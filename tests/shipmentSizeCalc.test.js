// tests/shipmentSizeCalc.test.js
// Pure unit tests for the Order Summary card's "Estimated Shipment Size"
// calc — no database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildShipmentSizeEstimate } = require("../src/db/shipmentSizeCalc");

test("buildShipmentSizeEstimate sums weight_kg x quantity across sourced lines only", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, quantity: 10, weight_kg: 20, dimensions: "120 x 15 x 15 cm", supplier_id: 5 },
    { rfq_line_item_id: 2, quantity: 20, weight_kg: 25, dimensions: "120 x 15 x 15 cm", supplier_id: 5 },
    { rfq_line_item_id: 3, quantity: 99, weight_kg: null, dimensions: null, supplier_id: null }, // unsourced — excluded
  ];
  const estimate = buildShipmentSizeEstimate(allLineItems);
  assert.equal(estimate.totalWeightKg, 20 * 10 + 25 * 20);
  assert.equal(estimate.sourcedCount, 2);
  assert.equal(estimate.totalCount, 3);
});

test("buildShipmentSizeEstimate shows shared dimensions when every sourced line quotes the same box size", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, quantity: 1, weight_kg: 20, dimensions: "120 x 15 x 15 cm", supplier_id: 5 },
    { rfq_line_item_id: 2, quantity: 1, weight_kg: 25, dimensions: "120 x 15 x 15 cm", supplier_id: 5 },
  ];
  const estimate = buildShipmentSizeEstimate(allLineItems);
  assert.equal(estimate.dimensionsText, "120 x 15 x 15 cm");
});

test("buildShipmentSizeEstimate omits dimensions when sourced lines disagree on box size — never combines them", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, quantity: 1, weight_kg: 20, dimensions: "120 x 15 x 15 cm", supplier_id: 5 },
    { rfq_line_item_id: 2, quantity: 1, weight_kg: 25, dimensions: "80 x 40 x 40 cm", supplier_id: 5 },
  ];
  const estimate = buildShipmentSizeEstimate(allLineItems);
  assert.equal(estimate.dimensionsText, null);
});

test("buildShipmentSizeEstimate returns null when nothing is sourced yet", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, quantity: 10, weight_kg: null, dimensions: null, supplier_id: null },
  ];
  assert.equal(buildShipmentSizeEstimate(allLineItems), null);
  assert.equal(buildShipmentSizeEstimate([]), null);
});

test("buildShipmentSizeEstimate reports partial sourcing so the caller can flag it", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, quantity: 10, weight_kg: 20, dimensions: "120 x 15 x 15 cm", supplier_id: 5 },
    { rfq_line_item_id: 2, quantity: 5, weight_kg: null, dimensions: null, supplier_id: null },
    { rfq_line_item_id: 3, quantity: 5, weight_kg: null, dimensions: null, supplier_id: null },
  ];
  const estimate = buildShipmentSizeEstimate(allLineItems);
  assert.equal(estimate.sourcedCount, 1);
  assert.equal(estimate.totalCount, 3);
});
