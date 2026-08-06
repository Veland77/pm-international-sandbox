// src/db/freightPrintQueries.js
// Queries behind the print/PDF-able Freight Quote Request document.
// Deliberately scoped to non-customer-identifying fields, same approach
// as inquiryPrintQueries.js: no account or contact data selected here at
// all. Vendor name/country IS included — the forwarder needs real pickup
// locations, and vendor identity isn't the confidentiality boundary here
// (the end customer is).

const FREIGHT_PRINT_QUERY = `
  SELECT fi.id, fi.frq_number, fi.sent_date,
         ff.name AS freight_forwarder_name,
         u.name AS sales_rep_name
  FROM freight_inquiries fi
  JOIN freight_forwarders ff ON ff.id = fi.freight_forwarder_id
  JOIN rfqs r ON r.id = fi.rfq_id
  JOIN users u ON u.id = r.sales_rep_id
  WHERE fi.id = ?
`;

const FREIGHT_PRINT_LINE_ITEMS_QUERY = `
  SELECT li.id AS rfq_line_item_id, li.description, li.quantity, li.unit,
         m.name AS material_name, pf.name AS product_form_name,
         s.name AS supplier_name, s.country AS supplier_country,
         sqli.weight_kg, sqli.dimensions, sqli.lead_time_days,
         sq.received_date
  FROM freight_inquiry_line_items fil
  JOIN rfq_line_items li ON li.id = fil.rfq_line_item_id
  JOIN materials m ON m.id = li.material_id
  JOIN product_forms pf ON pf.id = li.product_form_id
  JOIN line_item_sourcing lis ON lis.rfq_line_item_id = li.id AND lis.status = 'Selected'
  JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  JOIN suppliers s ON s.id = si.supplier_id
  WHERE fil.freight_inquiry_id = ?
`;

function getFreightInquiryForPrint(db, id) {
  return db.prepare(FREIGHT_PRINT_QUERY).get(id);
}

function getFreightInquiryLineItemsForPrint(db, freightInquiryId) {
  return db.prepare(FREIGHT_PRINT_LINE_ITEMS_QUERY).all(freightInquiryId);
}

module.exports = { getFreightInquiryForPrint, getFreightInquiryLineItemsForPrint };
