// seed/seedSuppliers.js
// Inserts the supplier-side sourcing data (outreach, quotes, comparison line
// items) for one RFQ's scenario from supplierFixtures.js, and links each
// vendor quote that was actually received to a customer quote option.

const OPTION_LABELS = ["Option A", "Option B", "Option C"];

function seedSuppliersForRfq(db, supplierIds, { rfqId, lineItems, quoteId }, scenario, sourcingSpec) {
  const insertSupplierRfq = db.prepare(
    "INSERT INTO supplier_rfqs (rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?)"
  );
  const insertSupplierRfqLine = db.prepare(
    "INSERT INTO supplier_rfq_line_items (supplier_rfq_id, rfq_line_item_id, quantity_requested) VALUES (?, ?, ?)"
  );
  const insertSupplierQuote = db.prepare(`
    INSERT INTO supplier_quotes
      (supplier_rfq_id, quote_ref, received_date, availability, lead_time_days, valid_until, estimated_transit_days)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSupplierQuoteLine = db.prepare(`
    INSERT INTO supplier_quote_line_items
      (supplier_quote_id, rfq_line_item_id, unit_price, currency, weight_kg, dimensions, crating_cost, lead_time_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertQuoteOption = db.prepare(`
    INSERT INTO customer_quote_options (quote_id, option_label, supplier_quote_id, notes)
    VALUES (?, ?, ?, ?)
  `);
  const insertLineItemSourcing = db.prepare(`
    INSERT INTO line_item_sourcing (rfq_line_item_id, supplier_quote_line_item_id, selected_date, status)
    VALUES (?, ?, ?, 'Selected')
  `);

  let optionIndex = 0;
  // Tracks each vendor's quote-line-item id per (supplierIndex, rfqLineItemId)
  // so the sourcing selections below can look up the right row to point at.
  const quoteLineItemIdByKey = new Map();

  scenario.forEach((entry) => {
    const supplierRfqId = insertSupplierRfq.run(
      rfqId,
      supplierIds[entry.supplierIndex],
      "2026-01-10",
      entry.outreachStatus
    ).lastInsertRowid;

    lineItems.forEach((li) => {
      insertSupplierRfqLine.run(supplierRfqId, li.id, li.quantity);
    });

    if (entry.outreachStatus !== "Quoted") {
      return; // Declined/Expired suppliers never sent pricing back.
    }

    const supplierQuoteId = insertSupplierQuote.run(
      supplierRfqId,
      `SQ-${supplierRfqId}-${entry.currency}`,
      "2026-01-20",
      entry.availability,
      entry.leadTimeDays,
      "2026-04-01",
      entry.estimatedTransitDays
    ).lastInsertRowid;

    lineItems.forEach((li, j) => {
      const basePrice = 150 + j * 45;
      const supplierQuoteLineItemId = insertSupplierQuoteLine.run(
        supplierQuoteId,
        li.id,
        Math.round(basePrice * entry.priceMultiplier * 100) / 100,
        entry.currency,
        20 + j * 5,
        "120 x 15 x 15 cm",
        45 + j * 10,
        entry.leadTimeDays
      ).lastInsertRowid;
      quoteLineItemIdByKey.set(`${entry.supplierIndex}:${li.id}`, supplierQuoteLineItemId);
    });

    if (quoteId) {
      insertQuoteOption.run(
        quoteId,
        OPTION_LABELS[optionIndex] || `Option ${optionIndex + 1}`,
        supplierQuoteId,
        `Lead time ${entry.leadTimeDays} days, ${entry.availability.toLowerCase()}.`
      );
      optionIndex += 1;
    }
  });

  if (sourcingSpec) {
    lineItems.forEach((li, j) => {
      const supplierIndex = sourcingSpec[j];
      const supplierQuoteLineItemId = quoteLineItemIdByKey.get(`${supplierIndex}:${li.id}`);
      if (supplierQuoteLineItemId) {
        insertLineItemSourcing.run(li.id, supplierQuoteLineItemId, "2026-02-01");
      }
    });
  }
}

module.exports = { seedSuppliersForRfq };
