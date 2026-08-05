// tests/freightPrintCalc.test.js
// Pure unit tests for the Freight Inquiry print view's weight/date
// calculations — no database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const { totalWeightKg, requestedShipByDate } = require("../src/db/freightPrintCalc");
const { addDays } = require("../src/db/orderSummary");

test("totalWeightKg sums each line's weight times quantity", () => {
  const lineItems = [
    { weight_kg: 20, quantity: 10 },
    { weight_kg: 5, quantity: 4 },
  ];
  assert.equal(totalWeightKg(lineItems), 20 * 10 + 5 * 4);
});

test("totalWeightKg returns 0 for no line items", () => {
  assert.equal(totalWeightKg([]), 0);
});

test("requestedShipByDate takes the latest received_date + lead_time_days across all lines", () => {
  const lineItems = [
    { received_date: "2026-01-01", lead_time_days: 10 },
    { received_date: "2026-01-01", lead_time_days: 20 },
  ];
  assert.equal(requestedShipByDate(lineItems), addDays("2026-01-01", 20));
});

test("requestedShipByDate uses each line's own received_date, not a shared one", () => {
  const lineItems = [
    { received_date: "2026-01-01", lead_time_days: 5 },
    { received_date: "2026-02-01", lead_time_days: 5 },
  ];
  assert.equal(requestedShipByDate(lineItems), addDays("2026-02-01", 5));
});

test("requestedShipByDate returns null for no line items", () => {
  assert.equal(requestedShipByDate([]), null);
});
