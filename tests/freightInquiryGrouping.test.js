// tests/freightInquiryGrouping.test.js
// Pure unit tests for the Freight Inquiry vendor-grouping logic — no
// database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const { groupLineItemsByVendor } = require("../src/db/freightInquiryGrouping");

test("a single-vendor selection produces one group", () => {
  const groups = groupLineItemsByVendor([
    { rfq_line_item_id: 1, supplier_id: 10, supplier_name: "Vendor A" },
    { rfq_line_item_id: 2, supplier_id: 10, supplier_name: "Vendor A" },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].supplierId, 10);
  assert.deepEqual(
    groups[0].lineItems.map((li) => li.rfq_line_item_id),
    [1, 2]
  );
});

test("a selection spanning two vendors produces two separate groups, never combined", () => {
  const groups = groupLineItemsByVendor([
    { rfq_line_item_id: 1, supplier_id: 10, supplier_name: "Vendor A" },
    { rfq_line_item_id: 2, supplier_id: 20, supplier_name: "Vendor B" },
    { rfq_line_item_id: 3, supplier_id: 10, supplier_name: "Vendor A" },
  ]);

  assert.equal(groups.length, 2);

  const groupA = groups.find((g) => g.supplierId === 10);
  assert.equal(groupA.supplierName, "Vendor A");
  assert.deepEqual(
    groupA.lineItems.map((li) => li.rfq_line_item_id),
    [1, 3]
  );

  const groupB = groups.find((g) => g.supplierId === 20);
  assert.equal(groupB.supplierName, "Vendor B");
  assert.deepEqual(
    groupB.lineItems.map((li) => li.rfq_line_item_id),
    [2]
  );
});

test("three vendors produce three groups", () => {
  const groups = groupLineItemsByVendor([
    { rfq_line_item_id: 1, supplier_id: 10, supplier_name: "Vendor A" },
    { rfq_line_item_id: 2, supplier_id: 20, supplier_name: "Vendor B" },
    { rfq_line_item_id: 3, supplier_id: 30, supplier_name: "Vendor C" },
  ]);

  assert.equal(groups.length, 3);
});

test("returns no groups for an empty selection", () => {
  assert.deepEqual(groupLineItemsByVendor([]), []);
});
