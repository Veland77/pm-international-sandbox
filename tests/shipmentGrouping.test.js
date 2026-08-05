// tests/shipmentGrouping.test.js
// Pure unit tests for the Convert-to-Order shipment grouping logic — no
// database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const { groupLineItemsForShipment } = require("../src/db/shipmentGrouping");

test("defaults to one shipment group per distinct vendor", () => {
  const groups = groupLineItemsForShipment([
    { rfqLineItemId: 1, supplierId: 10 },
    { rfqLineItemId: 2, supplierId: 20 },
    { rfqLineItemId: 3, supplierId: 10 },
  ]);

  assert.equal(groups.length, 2);
  const groupTen = groups.find((g) => g.supplierId === 10);
  assert.deepEqual(groupTen.rfqLineItemIds, [1, 3]);
  const groupTwenty = groups.find((g) => g.supplierId === 20);
  assert.deepEqual(groupTwenty.rfqLineItemIds, [2]);
});

test("a line item can be reassigned to combine into a different vendor's shipment", () => {
  const groups = groupLineItemsForShipment(
    [
      { rfqLineItemId: 1, supplierId: 10 },
      { rfqLineItemId: 2, supplierId: 20 },
    ],
    { 2: "10" } // form fields arrive as strings
  );

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rfqLineItemIds.sort(), [1, 2]);
  // Combined shipment mixes two vendors' line items — no single vendor
  // owns it, so supplierId stays null (per schema.js's shipments comment).
  assert.equal(groups[0].supplierId, null);
});

test("a group stays single-vendor when every line in it already shares that vendor, reassigned or not", () => {
  const groups = groupLineItemsForShipment(
    [
      { rfqLineItemId: 1, supplierId: 10 },
      { rfqLineItemId: 2, supplierId: 10 },
    ],
    { 2: "10" } // redundant reassignment — line 2 already belonged to vendor 10's group
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].supplierId, 10);
});

test("an empty or missing choice for a line item falls back to its own vendor", () => {
  const groups = groupLineItemsForShipment(
    [
      { rfqLineItemId: 1, supplierId: 10 },
      { rfqLineItemId: 2, supplierId: 20 },
    ],
    { 1: "", 2: undefined }
  );

  assert.equal(groups.length, 2);
});

test("returns no groups for an empty line item list", () => {
  assert.deepEqual(groupLineItemsForShipment([]), []);
});
