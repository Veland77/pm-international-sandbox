// src/db/shipmentGrouping.js
// Pure grouping logic for the Convert-to-Order form: decides which RFQ
// line items ship together. Default is one shipment per distinct vendor;
// a line item can be reassigned to join a different vendor's group instead
// — that reassignment is how two vendors get combined into one shipment.
// No DB access, so this is directly unit-testable.

function groupLineItemsForShipment(sourcedLineItems, chosenGroupKeyByLineItemId = {}) {
  const groups = new Map(); // groupKey -> { rfqLineItemIds: [], supplierIds: Set }

  sourcedLineItems.forEach((li) => {
    const chosen = chosenGroupKeyByLineItemId[li.rfqLineItemId];
    const groupKey = chosen !== undefined && chosen !== null && chosen !== "" ? Number(chosen) : li.supplierId;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { rfqLineItemIds: [], supplierIds: new Set() });
    }
    const group = groups.get(groupKey);
    group.rfqLineItemIds.push(li.rfqLineItemId);
    group.supplierIds.add(li.supplierId);
  });

  // Per schema.js's shipments.supplier_id comment: a group only gets a
  // single vendor stamped on it when every line in it actually came from
  // that same vendor. A group combining line items reassigned from
  // different vendors has no single vendor, so supplierId stays null —
  // origin/destination for that shipment are filled in manually instead.
  return Array.from(groups.values()).map((group) => ({
    supplierId: group.supplierIds.size === 1 ? [...group.supplierIds][0] : null,
    rfqLineItemIds: group.rfqLineItemIds,
  }));
}

module.exports = { groupLineItemsForShipment };
