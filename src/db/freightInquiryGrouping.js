// src/db/freightInquiryGrouping.js
// Pure grouping logic for Freight Inquiry creation. A single freight
// request can never mix pickup locations — weight, dimensions, and origin
// all come from one vendor's quote at a time, so mixing vendors into one
// request would produce a summed weight across unrelated locations. Groups
// the selected (already-sourced) line items by their vendor — the closest
// thing to a pickup location this data model has, since each supplier has
// exactly one location — and returns one group per distinct vendor. No DB
// access, so this is directly unit-testable.

// sourcedLineItems: [{ rfq_line_item_id, supplier_id, supplier_name, ... }]
function groupLineItemsByVendor(sourcedLineItems) {
  const groups = new Map(); // supplierId -> { supplierId, supplierName, lineItems: [] }

  sourcedLineItems.forEach((li) => {
    if (!groups.has(li.supplier_id)) {
      groups.set(li.supplier_id, { supplierId: li.supplier_id, supplierName: li.supplier_name, lineItems: [] });
    }
    groups.get(li.supplier_id).lineItems.push(li);
  });

  return Array.from(groups.values());
}

module.exports = { groupLineItemsByVendor };
