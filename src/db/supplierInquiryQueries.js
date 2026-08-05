// src/db/supplierInquiryQueries.js
// Read queries backing the Sourcing Inquiry detail page. Deliberately
// excludes customer sell price/margin data — this page is oriented around
// what was asked of a vendor and what they quoted, never PM's internal
// pricing. The rfq_number/rfq_id included here are for an internal
// back-link only (staff navigation), not shown to any supplier.

const INQUIRY_QUERY = `
  SELECT si.id, si.inquiry_number, si.rfq_id, si.sent_date, si.status AS outreach_status,
         s.name AS supplier_name, s.country AS supplier_country, s.region AS supplier_region,
         s.specialty AS supplier_specialty,
         r.rfq_number
  FROM supplier_inquiries si
  JOIN suppliers s ON s.id = si.supplier_id
  JOIN rfqs r ON r.id = si.rfq_id
  WHERE si.id = ?
`;

const INQUIRY_LINE_ITEMS_QUERY = `
  SELECT sil.rfq_line_item_id, sil.quantity_requested,
         li.description, li.unit, li.length_m,
         m.name AS material_name, pf.name AS product_form_name, st.code AS standard_code
  FROM supplier_inquiry_line_items sil
  JOIN rfq_line_items li ON li.id = sil.rfq_line_item_id
  JOIN materials m ON m.id = li.material_id
  JOIN product_forms pf ON pf.id = li.product_form_id
  LEFT JOIN standards st ON st.id = li.standard_id
  WHERE sil.supplier_inquiry_id = ?
`;

const INQUIRY_QUOTE_QUERY = `
  SELECT * FROM supplier_quotes WHERE supplier_inquiry_id = ? ORDER BY id DESC LIMIT 1
`;

const INQUIRY_QUOTE_LINE_ITEMS_QUERY = `
  SELECT sqli.rfq_line_item_id, sqli.unit_price, sqli.currency, sqli.weight_kg, sqli.dimensions,
         sqli.crating_cost, sqli.lead_time_days,
         li.description,
         CASE WHEN lis.id IS NOT NULL THEN 1 ELSE 0 END AS is_selected
  FROM supplier_quote_line_items sqli
  JOIN rfq_line_items li ON li.id = sqli.rfq_line_item_id
  LEFT JOIN line_item_sourcing lis
    ON lis.supplier_quote_line_item_id = sqli.id AND lis.status = 'Selected'
  WHERE sqli.supplier_quote_id = ?
`;

function getSupplierInquiryById(db, id) {
  return db.prepare(INQUIRY_QUERY).get(id);
}

function getInquiryLineItems(db, inquiryId) {
  return db.prepare(INQUIRY_LINE_ITEMS_QUERY).all(inquiryId);
}

function getInquiryQuote(db, inquiryId) {
  return db.prepare(INQUIRY_QUOTE_QUERY).get(inquiryId);
}

function getInquiryQuoteLineItems(db, quoteId) {
  return db.prepare(INQUIRY_QUOTE_LINE_ITEMS_QUERY).all(quoteId);
}

module.exports = { getSupplierInquiryById, getInquiryLineItems, getInquiryQuote, getInquiryQuoteLineItems };
