// src/db/rfqQueries.js
// Read queries backing the RFQ list/detail pages. Kept separate from the route
// handlers so they can be tested directly against a database, no HTTP layer needed.

const LIST_QUERY = `
  SELECT r.id, r.job_number, r.project_name, r.status, r.due_date,
         a.name AS account_name, u.name AS sales_rep_name
  FROM rfqs r
  JOIN accounts a ON a.id = r.account_id
  JOIN users u ON u.id = r.sales_rep_id
  ORDER BY r.due_date
`;

const RFQ_QUERY = `
  SELECT r.*,
         a.name AS account_name, a.industry_segment, a.region AS account_region, a.account_status,
         c.name AS contact_name, c.title AS contact_title, c.email AS contact_email, c.phone AS contact_phone,
         u.name AS sales_rep_name
  FROM rfqs r
  JOIN accounts a ON a.id = r.account_id
  JOIN contacts c ON c.id = r.contact_id
  JOIN users u ON u.id = r.sales_rep_id
  WHERE r.id = ?
`;

const LINE_ITEMS_QUERY = `
  SELECT li.id, li.description, li.quantity, li.unit, li.length_m,
         m.name AS material_name, pf.name AS product_form_name, s.code AS standard_code,
         inum.item_number, inum.status AS item_number_status
  FROM rfq_line_items li
  JOIN materials m ON m.id = li.material_id
  JOIN product_forms pf ON pf.id = li.product_form_id
  LEFT JOIN standards s ON s.id = li.standard_id
  LEFT JOIN item_numbers inum ON inum.rfq_line_item_id = li.id
  WHERE li.rfq_id = ?
`;

// rfq_line_item_id/supplier_quote_line_item_id let the RFQ page match each
// comparison row against the per-line freight allocation computed in
// lineItemCostQueries.js/marginCalc.js — a row only ever gets a freight
// cost when it's the exact vendor-quote-line actually selected for that
// line (every other, non-winning vendor's row structurally never has a
// freight quote against it).
const SUPPLIER_COMPARISON_QUERY = `
  SELECT si.id AS supplier_inquiry_id, si.inquiry_number, s.name AS supplier_name, s.country AS supplier_country,
         si.status AS outreach_status,
         sq.quote_ref, sq.availability, sq.valid_until,
         li.id AS rfq_line_item_id, li.description AS line_item_description,
         li.quantity AS line_item_quantity, li.unit AS line_item_unit,
         sqli.id AS supplier_quote_line_item_id,
         sqli.unit_price, sqli.currency, sqli.weight_kg, sqli.dimensions,
         sqli.crating_cost, sqli.lead_time_days
  FROM supplier_inquiries si
  JOIN suppliers s ON s.id = si.supplier_id
  LEFT JOIN supplier_quotes sq ON sq.supplier_inquiry_id = si.id
  LEFT JOIN supplier_quote_line_items sqli ON sqli.supplier_quote_id = sq.id
  LEFT JOIN rfq_line_items li ON li.id = sqli.rfq_line_item_id
  WHERE si.rfq_id = ?
  ORDER BY sqli.rfq_line_item_id, s.name
`;

const QUOTE_QUERY = `
  SELECT * FROM quotes WHERE rfq_id = ? ORDER BY version DESC LIMIT 1
`;

// Every version of this RFQ's quote, newest first — the latest one (see
// QUOTE_QUERY above) is always the active version (Draft or Sent); every
// other row here is always 'Superseded'. Used to render the Quote
// History list on the RFQ detail page.
const QUOTE_VERSIONS_QUERY = `
  SELECT * FROM quotes WHERE rfq_id = ? ORDER BY version DESC
`;

const QUOTE_LINE_ITEMS_QUERY = `
  SELECT li.id AS rfq_line_item_id, qli.unit_price_usd, qli.lead_time_days, qli.target_margin_pct,
         li.description, li.quantity, li.unit
  FROM quote_line_items qli
  JOIN rfq_line_items li ON li.id = qli.rfq_line_item_id
  WHERE qli.quote_id = ?
`;

const CURRENCY_RATES_QUERY = `
  SELECT currency_code, rate_to_usd, as_of_date FROM currency_rates
`;

const SUPPLIER_INQUIRIES_FOR_RFQ_QUERY = `
  SELECT si.id, si.inquiry_number, si.status, si.sent_date, s.name AS supplier_name,
         GROUP_CONCAT(li.description, '; ') AS line_item_descriptions
  FROM supplier_inquiries si
  JOIN suppliers s ON s.id = si.supplier_id
  LEFT JOIN supplier_inquiry_line_items sil ON sil.supplier_inquiry_id = si.id
  LEFT JOIN rfq_line_items li ON li.id = sil.rfq_line_item_id
  WHERE si.rfq_id = ?
  GROUP BY si.id
  ORDER BY si.inquiry_number
`;

// supplier_id/supplier_name is the vendor pickup location this inquiry
// covers, derived the same way freightQuoteSelectionQueries.js does —
// needed so the RFQ page can link each row into the right comparison group
// and show whether that pickup location already has a selected forwarder.
const FREIGHT_INQUIRIES_FOR_RFQ_QUERY = `
  SELECT fi.id, fi.frq_number, ff.name AS freight_forwarder_name, fi.status, fi.sent_date,
         GROUP_CONCAT(li.description, '; ') AS line_item_descriptions,
         supplr.id AS supplier_id, supplr.name AS supplier_name
  FROM freight_inquiries fi
  JOIN freight_forwarders ff ON ff.id = fi.freight_forwarder_id
  LEFT JOIN freight_inquiry_line_items fil ON fil.freight_inquiry_id = fi.id
  LEFT JOIN rfq_line_items li ON li.id = fil.rfq_line_item_id
  LEFT JOIN line_item_sourcing lis ON lis.rfq_line_item_id = fil.rfq_line_item_id AND lis.status = 'Selected'
  LEFT JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  LEFT JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  LEFT JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  LEFT JOIN suppliers supplr ON supplr.id = si.supplier_id
  WHERE fi.rfq_id = ?
  GROUP BY fi.id
  ORDER BY fi.frq_number
`;

function listRfqs(db) {
  return db.prepare(LIST_QUERY).all();
}

function getRfqById(db, id) {
  return db.prepare(RFQ_QUERY).get(id);
}

function getLineItems(db, rfqId) {
  return db.prepare(LINE_ITEMS_QUERY).all(rfqId);
}

function getLatestQuote(db, rfqId) {
  return db.prepare(QUOTE_QUERY).get(rfqId);
}

function getQuoteVersionsForRfq(db, rfqId) {
  return db.prepare(QUOTE_VERSIONS_QUERY).all(rfqId);
}

function getQuoteLineItems(db, quoteId) {
  return db.prepare(QUOTE_LINE_ITEMS_QUERY).all(quoteId);
}

function getSupplierComparison(db, rfqId) {
  return db.prepare(SUPPLIER_COMPARISON_QUERY).all(rfqId);
}

function getCurrencyRates(db) {
  return db.prepare(CURRENCY_RATES_QUERY).all();
}

function getSupplierInquiriesForRfq(db, rfqId) {
  return db.prepare(SUPPLIER_INQUIRIES_FOR_RFQ_QUERY).all(rfqId);
}

function getFreightInquiriesForRfq(db, rfqId) {
  return db.prepare(FREIGHT_INQUIRIES_FOR_RFQ_QUERY).all(rfqId);
}

module.exports = {
  listRfqs,
  getRfqById,
  getLineItems,
  getLatestQuote,
  getQuoteVersionsForRfq,
  getQuoteLineItems,
  getSupplierComparison,
  getCurrencyRates,
  getSupplierInquiriesForRfq,
  getFreightInquiriesForRfq,
};
