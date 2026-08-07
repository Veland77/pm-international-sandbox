// src/db/quotePrintQueries.js
// Queries behind the print/PDF-able customer-facing Quote document. This
// is the one customer-facing print document in the app — the opposite
// confidentiality direction from inquiryPrintQueries.js/freightPrintQueries.js
// (which exclude the customer's identity from supplier-facing documents).
// Here the customer's own name/contact is fine to show — they're the
// recipient — but Buy Price and Margin must never appear. That's enforced
// structurally, not by hiding columns in the view: QUOTE_PRINT_LINE_ITEMS_QUERY
// joins only quote_line_items -> rfq_line_items, with no path to
// supplier_quote_line_items (where buy price lives) at all, so it's not
// possible for this query to return buy price even after a careless future
// edit. QUOTE_PRINT_SHIPMENT_SIZE_LINE_ITEMS_QUERY does join through to
// supplier_quote_line_items (weight_kg/dimensions live there), but its
// SELECT list deliberately omits unit_price — same table, narrower ask.
// When a quote's freight_display_mode is 'included', quoteIntake.js's
// print route reuses that same weight_kg data (never touching this file's
// buy-price-free guarantee) to fold freight into each item — see
// marginCalc.js's buildLandedPrintLineItems.

const QUOTE_PRINT_HEADER_QUERY = `
  SELECT q.id, q.quote_number, q.status, q.created_date, q.valid_until, q.promised_delivery_date,
         q.freight_sell_price_usd, q.freight_display_mode,
         r.id AS rfq_id, r.job_number, r.project_name,
         a.name AS account_name,
         c.name AS contact_name, c.email AS contact_email,
         u.name AS sales_rep_name
  FROM quotes q
  JOIN rfqs r ON r.id = q.rfq_id
  JOIN accounts a ON a.id = r.account_id
  JOIN contacts c ON c.id = r.contact_id
  JOIN users u ON u.id = r.sales_rep_id
  WHERE q.id = ?
`;

// No join to supplier_quote_line_items anywhere in this query — the only
// price column reachable here is the customer's own sell price.
// rfq_line_item_id is included only to match each row against its own
// weight (from QUOTE_PRINT_SHIPMENT_SIZE_LINE_ITEMS_QUERY below) when
// freight_display_mode is 'included' — an id, never a price.
const QUOTE_PRINT_LINE_ITEMS_QUERY = `
  SELECT li.id AS rfq_line_item_id, li.description, li.quantity, li.unit, qli.unit_price_usd AS sell_unit_price_usd
  FROM quote_line_items qli
  JOIN rfq_line_items li ON li.id = qli.rfq_line_item_id
  WHERE qli.quote_id = ?
`;

// Same sourcing join lineItemCostQueries.js uses, scoped to physical size
// fields only — feeds directly into shipmentSizeCalc.js's
// buildShipmentSizeEstimate, unchanged.
const QUOTE_PRINT_SHIPMENT_SIZE_LINE_ITEMS_QUERY = `
  SELECT li.id AS rfq_line_item_id, li.quantity,
         s.id AS supplier_id,
         sqli.weight_kg, sqli.dimensions
  FROM rfq_line_items li
  LEFT JOIN line_item_sourcing lis ON lis.rfq_line_item_id = li.id AND lis.status = 'Selected'
  LEFT JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  LEFT JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  LEFT JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  LEFT JOIN suppliers s ON s.id = si.supplier_id
  WHERE li.rfq_id = ?
`;

function getQuoteForPrint(db, quoteId) {
  return db.prepare(QUOTE_PRINT_HEADER_QUERY).get(quoteId);
}

function getQuoteLineItemsForPrint(db, quoteId) {
  return db.prepare(QUOTE_PRINT_LINE_ITEMS_QUERY).all(quoteId);
}

function getQuoteShipmentSizeLineItemsForPrint(db, rfqId) {
  return db.prepare(QUOTE_PRINT_SHIPMENT_SIZE_LINE_ITEMS_QUERY).all(rfqId);
}

module.exports = { getQuoteForPrint, getQuoteLineItemsForPrint, getQuoteShipmentSizeLineItemsForPrint };
