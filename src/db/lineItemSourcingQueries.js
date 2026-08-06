// src/db/lineItemSourcingQueries.js
// Reads and writes behind the "Compare Vendors & Select Winner" screen —
// one RFQ line item at a time. Selecting a vendor never deletes a prior
// selection: the old line_item_sourcing row flips to 'Rejected' and a new
// 'Selected' row is inserted, so there's a history of who was picked and
// when, matching the status column's existing design (see schema.js).

const LINE_ITEM_QUERY = `
  SELECT li.id, li.rfq_id, li.description, li.quantity, li.unit,
         m.name AS material_name, pf.name AS product_form_name, s.code AS standard_code
  FROM rfq_line_items li
  JOIN materials m ON m.id = li.material_id
  JOIN product_forms pf ON pf.id = li.product_form_id
  LEFT JOIN standards s ON s.id = li.standard_id
  WHERE li.id = ?
`;

// Only vendors who actually sent pricing back — a Declined/Expired
// outreach has no supplier_quote_line_items row, so nothing to compare.
// Ordered by vendor name, not price, so the list doesn't itself imply
// "cheapest is best."
const VENDOR_QUOTES_FOR_LINE_ITEM_QUERY = `
  SELECT sqli.id AS supplier_quote_line_item_id, sqli.unit_price, sqli.currency,
         sqli.lead_time_days, sqli.notes,
         sq.availability,
         supplr.name AS supplier_name, supplr.country AS supplier_country,
         CASE WHEN lis.id IS NOT NULL THEN 1 ELSE 0 END AS is_selected
  FROM supplier_quote_line_items sqli
  JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  JOIN suppliers supplr ON supplr.id = si.supplier_id
  LEFT JOIN line_item_sourcing lis
    ON lis.supplier_quote_line_item_id = sqli.id AND lis.status = 'Selected'
  WHERE sqli.rfq_line_item_id = ?
  ORDER BY supplr.name
`;

function getLineItemForCompare(db, id) {
  return db.prepare(LINE_ITEM_QUERY).get(id);
}

function getVendorQuotesForLineItem(db, rfqLineItemId) {
  return db.prepare(VENDOR_QUOTES_FOR_LINE_ITEM_QUERY).all(rfqLineItemId);
}

function selectVendorForLineItem(db, { rfqLineItemId, supplierQuoteLineItemId }) {
  const rejectPriorSelection = db.prepare(
    "UPDATE line_item_sourcing SET status = 'Rejected' WHERE rfq_line_item_id = ? AND status = 'Selected'"
  );
  const insertSelection = db.prepare(`
    INSERT INTO line_item_sourcing (rfq_line_item_id, supplier_quote_line_item_id, selected_date, status)
    VALUES (?, ?, ?, 'Selected')
  `);

  const run = db.transaction(() => {
    rejectPriorSelection.run(rfqLineItemId);
    const selectedDate = new Date().toISOString().slice(0, 10);
    insertSelection.run(rfqLineItemId, supplierQuoteLineItemId, selectedDate);
  });

  run();
}

module.exports = { getLineItemForCompare, getVendorQuotesForLineItem, selectVendorForLineItem };
