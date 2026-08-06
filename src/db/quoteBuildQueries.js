// src/db/quoteBuildQueries.js
// Writes (and number generation) behind the Offer to Customer quote
// create/edit screen. One quote per RFQ for now — no re-quote/versioning
// UI yet, so creation is blocked once any quote exists, but a Draft can
// be edited in place (delete-and-reinsert its line items) without that
// requiring the full versioning feature. Reads shared with the rest of
// the RFQ page (line items, sourcing, freight-allocated costs) live in
// lineItemCostQueries.js — this file is quote CRUD only.

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
function createQuote(db, { rfqId, validUntil, promisedDeliveryDate, freightSellPriceUsd, lines }) {
  const insertQuote = db.prepare(`
    INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until, promised_delivery_date, freight_sell_price_usd)
    VALUES (?, ?, ?, 'Draft', ?, ?, ?, ?)
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
      promisedDeliveryDate || null,
      freightSellPriceUsd
    ).lastInsertRowid;

    lines.forEach((line) => {
      insertLine.run(quoteId, line.rfqLineItemId, line.sellUnitPriceUsd, line.leadTimeDays, line.targetMarginPct);
    });

    return quoteId;
  });

  return run();
}

// Only ever touches a quote that's still Draft — checked explicitly up
// front (not just via a WHERE clause on the quotes-row UPDATE, which
// wouldn't stop the line-item delete+reinsert below from running
// regardless of status). The route only offers editing for Draft quotes
// in the first place; this is the actual second line of defense. Line
// items are deleted and reinserted rather than updated in place: while
// still Draft there's no history to preserve, unlike
// line_item_sourcing/freight_quote_selection.
function updateDraftQuote(db, { quoteId, validUntil, promisedDeliveryDate, freightSellPriceUsd, lines }) {
  const updateQuote = db.prepare(
    "UPDATE quotes SET valid_until = ?, promised_delivery_date = ?, freight_sell_price_usd = ? WHERE id = ?"
  );
  const deleteLines = db.prepare("DELETE FROM quote_line_items WHERE quote_id = ?");
  const insertLine = db.prepare(`
    INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, target_margin_pct)
    VALUES (?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    const quote = db.prepare("SELECT status FROM quotes WHERE id = ?").get(quoteId);
    if (!quote || quote.status !== "Draft") return;

    updateQuote.run(validUntil, promisedDeliveryDate || null, freightSellPriceUsd, quoteId);
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

module.exports = { getNextQuoteNumber, createQuote, updateDraftQuote, markQuoteAsSent };
