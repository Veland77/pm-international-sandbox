// tests/orderSummary.test.js
// Pure unit tests for currency conversion and delivery-date estimation —
// no database involved. Margin/cost calculations moved to marginCalc.js
// (see tests/marginCalc.test.js) once the RFQ page unified on one shared
// margin calculation instead of a separate freight-exclusive one here.

const test = require("node:test");
const assert = require("node:assert/strict");
const { toUsd, addDays, estimateArrivalDate, FX_MARGIN_PCT } = require("../src/db/orderSummary");

const RATE_MAP = new Map([
  ["USD", 1],
  ["EUR", 1.08],
  ["CNY", 0.139],
]);

test("toUsd passes USD through unchanged with no FX margin applied", () => {
  assert.equal(toUsd(100, "USD", RATE_MAP), 100);
});

test("toUsd converts a foreign currency and applies the FX margin", () => {
  const expected = 100 * 1.08 * (1 + FX_MARGIN_PCT / 100);
  assert.equal(toUsd(100, "EUR", RATE_MAP), expected);
});

test("toUsd returns null for a currency with no known rate", () => {
  assert.equal(toUsd(100, "GBP", RATE_MAP), null);
});

test("addDays advances a YYYY-MM-DD string correctly", () => {
  assert.equal(addDays("2026-01-01", 10), "2026-01-11");
  assert.equal(addDays("2026-01-25", 10), "2026-02-04");
});

test("estimateArrivalDate takes the latest arrival across every sourced line", () => {
  const allLineItems = [
    {
      rfq_line_item_id: 1,
      supplier_id: 5,
      received_date: "2026-01-01",
      lead_time_days: 10,
      estimated_transit_days: 5,
    },
    {
      rfq_line_item_id: 2,
      supplier_id: 5,
      received_date: "2026-01-01",
      lead_time_days: 20,
      estimated_transit_days: 5,
    },
  ];
  // Line 2 has the longer lead time (20 days vs 10), so its arrival date should win.
  assert.equal(estimateArrivalDate(allLineItems), addDays("2026-01-01", 20 + 5));
});

test("estimateArrivalDate skips unsourced lines", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, supplier_id: null, received_date: null, lead_time_days: null, estimated_transit_days: null },
  ];
  assert.equal(estimateArrivalDate(allLineItems), null);
});

test("estimateArrivalDate returns null when nothing is sourced", () => {
  assert.equal(estimateArrivalDate([]), null);
});
