// src/db/vendorPoQueries.js
// Reads/writes behind "Generate Purchase Order" — a real, one-time action
// that issues a vendor's PO, distinct from the print document itself
// (poPrintQueries.js/poPrintPage.js), which stays fully derived and is
// never stored. This file only tracks the fact and date that a specific
// (order, vendor) PO was issued.

const GET_ISSUANCE_QUERY = `
  SELECT order_id, supplier_id, issued_date
  FROM vendor_po_issuances
  WHERE order_id = ? AND supplier_id = ?
`;

const GET_ISSUANCES_FOR_ORDER_QUERY = `
  SELECT supplier_id, issued_date
  FROM vendor_po_issuances
  WHERE order_id = ?
`;

function getVendorPoIssuance(db, orderId, supplierId) {
  return db.prepare(GET_ISSUANCE_QUERY).get(orderId, supplierId);
}

// Map<supplierId, issuedDate> — the shape the Order detail page wants to
// decide, per vendor, whether to show "Generate Purchase Order" or the
// already-issued status.
function getVendorPoIssuancesForOrder(db, orderId) {
  const rows = db.prepare(GET_ISSUANCES_FOR_ORDER_QUERY).all(orderId);
  return new Map(rows.map((r) => [r.supplier_id, r.issued_date]));
}

// INSERT OR IGNORE relies on the (order_id, supplier_id) UNIQUE constraint
// in schema.js — a double-click or a second POST to the same vendor's PO
// silently does nothing rather than erroring or creating a duplicate
// record with a later date.
function createVendorPoIssuance(db, { orderId, supplierId, issuedDate }) {
  db.prepare(
    "INSERT OR IGNORE INTO vendor_po_issuances (order_id, supplier_id, issued_date) VALUES (?, ?, ?)"
  ).run(orderId, supplierId, issuedDate);
}

module.exports = { getVendorPoIssuance, getVendorPoIssuancesForOrder, createVendorPoIssuance };
