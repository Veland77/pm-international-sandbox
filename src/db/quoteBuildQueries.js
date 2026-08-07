// src/db/quoteBuildQueries.js
// Writes (and number generation) behind the Offer to Customer quote
// create/edit screen. A still-Draft quote is edited in place
// (delete-and-reinsert its line items, see updateDraftQuote) — once a
// quote has been sent (Sent/Accepted/Rejected), editing it instead
// creates a new version via createQuoteVersion: the prior row becomes
// 'Superseded', a new row is inserted (same quote_number, version + 1,
// status 'Sent' directly — "Save & Send"), and the prior version's line
// items are left untouched for full negotiation traceability. Reads
// shared with the rest of the RFQ page (line items, sourcing,
// freight-allocated costs) live in lineItemCostQueries.js — this file is
// quote CRUD only.

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
// freightDisplayMode: 'separate' or 'included' — the sales rep's choice at
// save time of how this version's freight should be shown; see schema.js.
function createQuote(db, { rfqId, validUntil, promisedDeliveryDate, freightSellPriceUsd, freightDisplayMode, lines }) {
  const insertQuote = db.prepare(`
    INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until, promised_delivery_date, freight_sell_price_usd, freight_display_mode)
    VALUES (?, ?, ?, 'Draft', ?, ?, ?, ?, ?)
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
      freightSellPriceUsd,
      freightDisplayMode
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
function updateDraftQuote(db, { quoteId, validUntil, promisedDeliveryDate, freightSellPriceUsd, freightDisplayMode, lines }) {
  const updateQuote = db.prepare(
    "UPDATE quotes SET valid_until = ?, promised_delivery_date = ?, freight_sell_price_usd = ?, freight_display_mode = ? WHERE id = ?"
  );
  const deleteLines = db.prepare("DELETE FROM quote_line_items WHERE quote_id = ?");
  const insertLine = db.prepare(`
    INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, target_margin_pct)
    VALUES (?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    const quote = db.prepare("SELECT status FROM quotes WHERE id = ?").get(quoteId);
    if (!quote || quote.status !== "Draft") return;

    updateQuote.run(validUntil, promisedDeliveryDate || null, freightSellPriceUsd, freightDisplayMode, quoteId);
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

// Revises a quote that's already been sent at least once (status
// Sent/Accepted/Rejected — anything but Draft). Never overwrites the
// existing row: it becomes 'Superseded', and a new row is inserted
// reusing the same quote_number with version + 1, saved directly as
// 'Sent' ("Save & Send" — a revision only ever exists because it's being
// re-presented to the customer, so there's no reason for it to sit as an
// internal-only Draft first). Only ever touches a quote that's actually
// non-Draft, checked explicitly up front for the same reason
// updateDraftQuote checks the opposite — the route only offers this path
// once a quote exists and isn't Draft, but this is the real guard.
function createQuoteVersion(db, { quoteId, validUntil, promisedDeliveryDate, freightSellPriceUsd, freightDisplayMode, lines }) {
  const supersedeQuote = db.prepare("UPDATE quotes SET status = 'Superseded' WHERE id = ?");
  const insertQuote = db.prepare(`
    INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until, promised_delivery_date, freight_sell_price_usd, freight_display_mode)
    VALUES (?, ?, ?, 'Sent', ?, ?, ?, ?, ?)
  `);
  const insertLine = db.prepare(`
    INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, target_margin_pct)
    VALUES (?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    const priorQuote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(quoteId);
    if (!priorQuote || priorQuote.status === "Draft") return null;

    supersedeQuote.run(quoteId);

    const createdDate = new Date().toISOString().slice(0, 10);
    const newQuoteId = insertQuote.run(
      priorQuote.quote_number,
      priorQuote.rfq_id,
      priorQuote.version + 1,
      createdDate,
      validUntil,
      promisedDeliveryDate || null,
      freightSellPriceUsd,
      freightDisplayMode
    ).lastInsertRowid;

    lines.forEach((line) => {
      insertLine.run(newQuoteId, line.rfqLineItemId, line.sellUnitPriceUsd, line.leadTimeDays, line.targetMarginPct);
    });

    return newQuoteId;
  });

  return run();
}

module.exports = { getNextQuoteNumber, createQuote, updateDraftQuote, markQuoteAsSent, createQuoteVersion };
