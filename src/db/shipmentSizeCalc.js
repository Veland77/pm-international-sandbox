// src/db/shipmentSizeCalc.js
// Estimated shipment size for the RFQ page's Order Summary card: total
// weight, and box dimensions when they're meaningful, built from
// vendor-quoted weight_kg/dimensions on each sourced line item. This is a
// vendor-quote-time estimate, not a final packed measurement — final
// weight/dimensions capture isn't built yet (see
// docs/phase4-sourcing-lifecycle.md, "Future: freight estimation & final
// weight/dimensions"). No DB access, so this is directly unit-testable.

// allLineItems: rows from getRfqLineItemsWithSourcing (sourced + unsourced)
// returns { totalWeightKg, dimensionsText, sourcedCount, totalCount }, or
// null if nothing's sourced yet — same "nothing to show" convention as
// marginCalc.js's buildTotals. dimensionsText is the shared box size only
// when every sourced line quotes the exact same dimensions string —
// dimensions is free text (one box per unit, no defined way to combine
// different box sizes into one shipment figure), so lines that disagree
// just leave it out rather than fabricating a combined number.
function buildShipmentSizeEstimate(allLineItems) {
  const totalCount = allLineItems.length;
  const sourcedLines = allLineItems.filter((li) => li.supplier_id != null);

  if (sourcedLines.length === 0) return null;

  const totalWeightKg = sourcedLines.reduce((sum, li) => sum + (li.weight_kg || 0) * li.quantity, 0);

  const distinctDimensions = new Set(sourcedLines.map((li) => li.dimensions).filter((d) => d != null));
  const dimensionsText = distinctDimensions.size === 1 ? [...distinctDimensions][0] : null;

  return { totalWeightKg, dimensionsText, sourcedCount: sourcedLines.length, totalCount };
}

module.exports = { buildShipmentSizeEstimate };
