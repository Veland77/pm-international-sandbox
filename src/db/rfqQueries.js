// src/db/rfqQueries.js
// Read queries backing the RFQ list/detail pages. Kept separate from the route
// handlers so they can be tested directly against a database, no HTTP layer needed.

const LIST_QUERY = `
  SELECT r.id, r.rfq_number, r.project_name, r.status, r.due_date,
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
  SELECT li.id, li.description, li.quantity, li.unit,
         m.name AS material_name, pf.name AS product_form_name, s.code AS standard_code
  FROM rfq_line_items li
  JOIN materials m ON m.id = li.material_id
  JOIN product_forms pf ON pf.id = li.product_form_id
  LEFT JOIN standards s ON s.id = li.standard_id
  WHERE li.rfq_id = ?
`;

const QUOTE_QUERY = `
  SELECT * FROM quotes WHERE rfq_id = ? ORDER BY version DESC LIMIT 1
`;

const QUOTE_LINE_ITEMS_QUERY = `
  SELECT qli.unit_price_usd, qli.lead_time_days, qli.margin_pct,
         li.description, li.quantity, li.unit
  FROM quote_line_items qli
  JOIN rfq_line_items li ON li.id = qli.rfq_line_item_id
  WHERE qli.quote_id = ?
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

function getQuoteLineItems(db, quoteId) {
  return db.prepare(QUOTE_LINE_ITEMS_QUERY).all(quoteId);
}

module.exports = { listRfqs, getRfqById, getLineItems, getLatestQuote, getQuoteLineItems };
