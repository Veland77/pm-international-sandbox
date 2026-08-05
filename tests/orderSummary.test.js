// tests/orderSummary.test.js
// Pure unit tests for the order-summary calculation — no database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOrderSummary, toUsd, addDays } = require("../src/db/orderSummary");

test("toUsd converts known currencies and returns null for unknown ones", () => {
  assert.equal(toUsd(100, "USD"), 100);
  assert.equal(toUsd(100, "EUR"), 108);
  assert.equal(Math.round(toUsd(100, "CNY") * 100) / 100, 14);
  assert.equal(toUsd(100, "GBP"), null);
});

test("addDays advances a YYYY-MM-DD string correctly", () => {
  assert.equal(addDays("2026-01-01", 10), "2026-01-11");
  assert.equal(addDays("2026-01-25", 10), "2026-02-04");
});

test("buildOrderSummary computes order value, profit, and single-vendor arrival date", () => {
  const quoteLineItems = [
    { rfq_line_item_id: 1, quantity: 10, unit_price_usd: 100 },
    { rfq_line_item_id: 2, quantity: 5, unit_price_usd: 200 },
  ];
  const sourcingRows = [
    {
      rfq_line_item_id: 1,
      unit_price: 50,
      currency: "USD",
      lead_time_days: 10,
      received_date: "2026-01-01",
      estimated_transit_days: 5,
    },
    {
      rfq_line_item_id: 2,
      unit_price: 100,
      currency: "USD",
      lead_time_days: 20,
      received_date: "2026-01-01",
      estimated_transit_days: 5,
    },
  ];

  const summary = buildOrderSummary({ quoteLineItems, sourcingRows });

  assert.equal(summary.totalOrderValueUsd, 10 * 100 + 5 * 200);
  assert.equal(summary.totalCostUsd, 10 * 50 + 5 * 100);
  assert.equal(summary.grossProfitUsd, summary.totalOrderValueUsd - summary.totalCostUsd);
  assert.equal(
    Math.round(summary.grossProfitPct * 100) / 100,
    Math.round((summary.grossProfitUsd / summary.totalOrderValueUsd) * 10000) / 100
  );
  // Line 2 has the longer lead time (20 days vs 10), so its arrival date should win.
  assert.equal(summary.estimatedArrivalDate, addDays("2026-01-01", 20 + 5));
});

test("buildOrderSummary skips lines with no sourcing selection", () => {
  const summary = buildOrderSummary({
    quoteLineItems: [{ rfq_line_item_id: 1, quantity: 1, unit_price_usd: 50 }],
    sourcingRows: [],
  });

  assert.equal(summary.totalOrderValueUsd, 50);
  assert.equal(summary.totalCostUsd, 0);
  assert.equal(summary.estimatedArrivalDate, null);
});

test("buildOrderSummary returns null profit percent when order value is zero", () => {
  const summary = buildOrderSummary({ quoteLineItems: [], sourcingRows: [] });
  assert.equal(summary.totalOrderValueUsd, 0);
  assert.equal(summary.grossProfitPct, null);
});
