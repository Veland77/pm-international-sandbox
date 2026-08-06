// src/db/quoteBuildQueries.js
// Reads and writes behind the Offer to Customer (quote create/edit)
// screen. One quote per RFQ for now — no re-quote/versioning UI yet, so
// creation is blocked once any quote exists, but a Draft can be edited in
// place (delete-and-reinsert its line items) without that requiring the
// full versioning feature.

const { getCurrencyRates } = require("./rfqQueries");
const { getSelectedFreightQuotesForRfq } = require("./freightQuoteSelectionQueries");
const { toUsd } = require("./orderSummary");
const { toSourcedLineItems, buildLandedUnitPrices } = require("./quoteBuildCalc");

// Every line item on the RFQ, sourced or not — supplier_id/supplier_name
// are null for a line with no Selected vendor yet, which is how the quote
// screen tells sourced apart from unsourced. weight_kg + lead_time_days
// come from the selected vendor's own quote line, same source the Freight
// Inquiry and Expediting screens already use.
const RFQ_LINE_ITEMS_WITH_SOURCING_QUERY = `
  SELECT li.id AS rfq_line_item_id, li.description, li.quantity, li.unit,
         s.id AS supplier_id, s.name AS supplier_name,
         sqli.unit_price, sqli.currency, sqli.weight_kg, sqli.lead_time_days
  FROM rfq_line_items li
  LEFT JOIN line_item_sourcing lis ON lis.rfq_line_item_id = li.id AND lis.status = 'Selected'
  LEFT JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  LEFT JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  LEFT JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  LEFT JOIN suppliers s ON s.id = si.supplier_id
  WHERE li.rfq_id = ?
`;

function getRfqLineItemsWithSourcing(db, rfqId) {
  return db.prepare(RFQ_LINE_ITEMS_WITH_SOURCING_QUERY).all(rfqId);
}

// Composes the above with the freight-allocation calc — the one call both
// the quote-build form and the RFQ page's saved-quote display need.
function getLandedPricesForRfq(db, rfqId) {
  const allLineItems = getRfqLineItemsWithSourcing(db, rfqId);
  const sourcedLineItems = toSourcedLineItems(allLineItems);
  const rates = getCurrencyRates(db);
  const rateMap = new Map(rates.map((r) => [r.currency_code, r.rate_to_usd]));
  const selectedFreightBySupplierId = new Map(
    getSelectedFreightQuotesForRfq(db, rfqId).map((q) => [
      q.supplier_id,
      { usdPrice: toUsd(q.price, q.currency, rateMap) },
    ])
  );
  const landedPrices = buildLandedUnitPrices(sourcedLineItems, selectedFreightBySupplierId, rates);

  return { allLineItems, landedPrices };
}

// Same approach as getNextFrqNumber/getNextPoNumber: parse the highest
// existing trailing number and add one.
function getNextQuoteNumber(db) {
  const rows = db.prepare("SELECT quote_number FROM quotes").all();
  const maxN = rows.reduce((max, r) => {
    const match = /(\d+)$/.exec(r.quote_number);
    const n = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, n);
  }, 5000);
  return `Q-${maxN + 1}`;
}

// lines: [{ rfqLineItemId, sellUnitPriceUsd, leadTimeDays, targetMarginPct }]
function createQuote(db, { rfqId, validUntil, promisedDeliveryDate, lines }) {
  const insertQuote = db.prepare(`
    INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until, promised_delivery_date)
    VALUES (?, ?, ?, 'Draft', ?, ?, ?)
  `);
  const insertLine = db.prepare(`
    INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, target_margin_pct)
    VALUES (?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    const existingCount = db.prepare("SELECT COUNT(*) AS n FROM quotes WHERE rfq_id = ?").get(rfqId).n;
    const version = existingCount + 1;
    const quoteNumber = getNextQuoteNumber(db);
    const createdDate = new Date().toISOString().slice(0, 10);
    const quoteId = insertQuote.run(
      quoteNumber,
      rfqId,
      version,
      createdDate,
      validUntil,
      promisedDeliveryDate || null
    ).lastInsertRowid;

    lines.forEach((line) => {
      insertLine.run(quoteId, line.rfqLineItemId, line.sellUnitPriceUsd, line.leadTimeDays, line.targetMarginPct);
    });

    return quoteId;
  });

  return run();
}

// Only ever touches a quote that's still Draft — checked explicitly up
// front (not just via the quotes-row UPDATE's WHERE clause, which
// wouldn't have stopped the line-item delete+reinsert below from running
// regardless of status). The route only offers editing for Draft quotes
// in the first place; this is the actual second line of defense. Line
// items are deleted and reinserted rather than updated in place: while
// still Draft there's no history to preserve, unlike
// line_item_sourcing/freight_quote_selection.
function updateDraftQuote(db, { quoteId, validUntil, promisedDeliveryDate, lines }) {
  const updateQuote = db.prepare(
    "UPDATE quotes SET valid_until = ?, promised_delivery_date = ? WHERE id = ?"
  );
  const deleteLines = db.prepare("DELETE FROM quote_line_items WHERE quote_id = ?");
  const insertLine = db.prepare(`
    INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, target_margin_pct)
    VALUES (?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    const quote = db.prepare("SELECT status FROM quotes WHERE id = ?").get(quoteId);
    if (!quote || quote.status !== "Draft") return;

    updateQuote.run(validUntil, promisedDeliveryDate || null, quoteId);
    deleteLines.run(quoteId);
    lines.forEach((line) => {
      insertLine.run(quoteId, line.rfqLineItemId, line.sellUnitPriceUsd, line.leadTimeDays, line.targetMarginPct);
    });
  });

  run();
}

function markQuoteAsSent(db, quoteId) {
  db.prepare("UPDATE quotes SET status = 'Sent' WHERE id = ? AND status = 'Draft'").run(quoteId);
}

module.exports = {
  getRfqLineItemsWithSourcing,
  getLandedPricesForRfq,
  getNextQuoteNumber,
  createQuote,
  updateDraftQuote,
  markQuoteAsSent,
};
