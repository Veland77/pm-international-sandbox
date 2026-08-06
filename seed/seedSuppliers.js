// seed/seedSuppliers.js
// Inserts the supplier-side sourcing data (sourcing inquiries, quotes,
// comparison line items) for one RFQ's scenario from supplierFixtures.js,
// and links each vendor quote that was actually received to a customer
// quote option.

const OPTION_LABELS = ["Option A", "Option B", "Option C"];

function seedSuppliersForRfq(db, supplierIds, { rfqId, lineItems, quoteId, dates, nextInquiryNumber }, scenario, sourcingSpec) {
  const insertSupplierInquiry = db.prepare(
    "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  );
  const insertSupplierInquiryLine = db.prepare(
    "INSERT INTO supplier_inquiry_line_items (supplier_inquiry_id, rfq_line_item_id, quantity_requested) VALUES (?, ?, ?)"
  );
  const insertSupplierQuote = db.prepare(`
    INSERT INTO supplier_quotes
      (supplier_inquiry_id, quote_ref, received_date, availability, lead_time_days, valid_until, estimated_transit_days)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSupplierQuoteLine = db.prepare(`
    INSERT INTO supplier_quote_line_items
      (supplier_quote_id, rfq_line_item_id, unit_price, currency, weight_kg, dimensions, crating_cost, lead_time_days, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    const supplierInquiryId = insertSupplierInquiry.run(
      nextInquiryNumber(),
      rfqId,
      supplierIds[entry.supplierIndex],
      dates.sentDate,
      entry.outreachStatus
    ).lastInsertRowid;

    lineItems.forEach((li) => {
      insertSupplierInquiryLine.run(supplierInquiryId, li.id, li.quantity);
    });

    if (entry.outreachStatus !== "Quoted") {
      return; // Declined/Expired suppliers never sent pricing back.
    }

    const supplierQuoteId = insertSupplierQuote.run(
      supplierInquiryId,
      `SQ-${supplierInquiryId}-${entry.currency}`,
      dates.receivedDate,
      entry.availability,
      entry.leadTimeDays,
      dates.validUntil,
      entry.estimatedTransitDays
    ).lastInsertRowid;

    lineItems.forEach((li, j) => {
      // entry.unitPrices[j] is a hand-picked, independent native-currency
      // price for this vendor/line — see supplierFixtures.js for how each
      // one was chosen against the real currency_rates.
      const supplierQuoteLineItemId = insertSupplierQuoteLine.run(
        supplierQuoteId,
        li.id,
        entry.unitPrices[j],
        entry.currency,
        20 + j * 5,
        "120 x 15 x 15 cm",
        45 + j * 10,
        entry.leadTimeDays,
        (entry.notes && entry.notes[j]) || null
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
        insertLineItemSourcing.run(li.id, supplierQuoteLineItemId, dates.selectedDate);
      }
    });
  }
}

module.exports = { seedSuppliersForRfq };
