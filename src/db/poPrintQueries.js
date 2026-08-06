// src/db/poPrintQueries.js
// Queries behind the print/PDF-able Purchase Order document sent to a
// vendor — the mirror image of quotePrintQueries.js: that document goes
// to the customer and must never show buy price/margin; this one goes to
// a vendor and must never show anything customer-identifying. Enforced
// structurally, not by hiding fields in the view: none of these queries
// join accounts or contacts, or quote_line_items, at all — the header
// query reaches only as far as orders -> purchase_orders -> quotes ->
// rfqs (for the PO number and job_number — job_number is PM's own
// end-to-end deal reference, not customer identity, see schema.js's rfqs
// comment — and stops there, never continuing on to accounts/contacts),
// and the line items query stops at order_line_items ->
// line_item_sourcing -> supplier_quote_line_items -> supplier_quotes ->
// supplier_inquiries. There is no path from either query to a customer
// table, so there's nothing for a careless future edit to accidentally
// reach.
//
// "PO number" here is PM's own reference to a vendor, not
// purchase_orders.po_number (which is the customer's PO to PM — a
// different transaction). One order can source from several vendors, so
// each vendor gets its own document; the route derives a per-vendor
// number by appending the vendor's id to the order's own po_number (see
// poPrint route), rather than adding new persisted state for something
// this sandbox can compute deterministically.

// One row per distinct vendor sourced on this order — feeds the "Print
// PO" links on the Order detail page. Same sourcing join as
// getPoLineItemsForVendor, just without the supplier_id filter.
const VENDORS_FOR_ORDER_QUERY = `
  SELECT DISTINCT s.id AS supplier_id, s.name AS supplier_name
  FROM order_line_items oli
  JOIN line_item_sourcing lis ON lis.id = oli.line_item_sourcing_id
  JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  JOIN suppliers s ON s.id = si.supplier_id
  WHERE oli.order_id = ?
  ORDER BY s.name
`;

// Reaches quotes -> rfqs only to pick up job_number — stops there, never
// continuing on to accounts/contacts, unlike orderQueries.js's own
// ORDER_QUERY which needs that further chain for the customer-facing
// order page.
const ORDER_HEADER_FOR_PO_QUERY = `
  SELECT o.id AS order_id, o.order_date, po.po_number, r.job_number
  FROM orders o
  JOIN purchase_orders po ON po.id = o.po_id
  JOIN quotes q ON q.id = po.quote_id
  JOIN rfqs r ON r.id = q.rfq_id
  WHERE o.id = ?
`;

const SUPPLIER_FOR_PO_QUERY = `
  SELECT id AS supplier_id, name AS supplier_name, country AS supplier_country
  FROM suppliers
  WHERE id = ?
`;

// The agreed line items for one vendor's slice of this order: quantity,
// unit, the vendor's own quoted unit price/currency, lead time, and which
// of that vendor's quotes it came from (shown per line, not assumed
// uniform for the whole document — a vendor could in principle have more
// than one supplier_quote contributing to one order). No join to
// quote_line_items anywhere, so the customer's sell price is never
// reachable here.
const PO_LINE_ITEMS_FOR_VENDOR_QUERY = `
  SELECT li.description, li.quantity, li.unit,
         sqli.unit_price, sqli.currency, sqli.lead_time_days,
         sq.quote_ref
  FROM order_line_items oli
  JOIN rfq_line_items li ON li.id = oli.rfq_line_item_id
  JOIN line_item_sourcing lis ON lis.id = oli.line_item_sourcing_id
  JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  WHERE oli.order_id = ? AND si.supplier_id = ?
`;

function getVendorsForOrder(db, orderId) {
  return db.prepare(VENDORS_FOR_ORDER_QUERY).all(orderId);
}

function getOrderHeaderForPo(db, orderId) {
  return db.prepare(ORDER_HEADER_FOR_PO_QUERY).get(orderId);
}

function getSupplierForPo(db, supplierId) {
  return db.prepare(SUPPLIER_FOR_PO_QUERY).get(supplierId);
}

function getPoLineItemsForVendor(db, orderId, supplierId) {
  return db.prepare(PO_LINE_ITEMS_FOR_VENDOR_QUERY).all(orderId, supplierId);
}

module.exports = { getVendorsForOrder, getOrderHeaderForPo, getSupplierForPo, getPoLineItemsForVendor };
