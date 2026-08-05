// tests/orderSummary.test.js
// Pure unit tests for the order-summary calculation — no database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOrderSummary, buildLineItemMargins, toUsd, addDays, FX_MARGIN_PCT } = require("../src/db/orderSummary");

const TEST_RATES = [
  { currency_code: "USD", rate_to_usd: 1 },
  { currency_code: "EUR", rate_to_usd: 1.08 },
  { currency_code: "CNY", rate_to_usd: 0.139 },
];
const RATE_MAP = new Map(TEST_RATES.map((r) => [r.currency_code, r.rate_to_usd]));

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

test("buildLineItemMargins computes buy/sell/margin per line and skips unsourced lines", () => {
  const quoteLineItems = [
    { rfq_line_item_id: 1, quantity: 10, unit_price_usd: 100 },
    { rfq_line_item_id: 2, quantity: 5, unit_price_usd: 50 },
  ];
  const sourcingRows = [
    {
      rfq_line_item_id: 1,
      unit_price: 80,
      currency: "USD",
      lead_time_days: 10,
      received_date: "2026-01-01",
      estimated_transit_days: 5,
    },
    // line 2 has no sourcing row — no vendor selected yet
  ];

  const margins = buildLineItemMargins({ quoteLineItems, sourcingRows, rates: TEST_RATES });

  assert.equal(margins.size, 1);
  const line1 = margins.get(1);
  assert.equal(line1.buyUnitPriceUsd, 80);
  assert.equal(line1.sellUnitPriceUsd, 100);
  assert.equal(line1.marginUnitUsd, 20);
  assert.equal(line1.marginPct, 20);
  assert.equal(margins.has(2), false);
});

test("buildLineItemMargins can produce a negative margin — real signal, not suppressed", () => {
  const margins = buildLineItemMargins({
    quoteLineItems: [{ rfq_line_item_id: 1, quantity: 1, unit_price_usd: 100 }],
    sourcingRows: [
      {
        rfq_line_item_id: 1,
        unit_price: 150,
        currency: "EUR",
        lead_time_days: 10,
        received_date: "2026-01-01",
        estimated_transit_days: 5,
      },
    ],
    rates: TEST_RATES,
  });

  const line1 = margins.get(1);
  assert.ok(line1.buyUnitPriceUsd > 100);
  assert.ok(line1.marginUnitUsd < 0);
  assert.ok(line1.marginPct < 0);
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

  const summary = buildOrderSummary({ quoteLineItems, sourcingRows, rates: TEST_RATES });

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
    rates: TEST_RATES,
  });

  assert.equal(summary.totalOrderValueUsd, 50);
  assert.equal(summary.totalCostUsd, 0);
  assert.equal(summary.estimatedArrivalDate, null);
});

test("buildOrderSummary returns null profit percent when order value is zero", () => {
  const summary = buildOrderSummary({ quoteLineItems: [], sourcingRows: [], rates: TEST_RATES });
  assert.equal(summary.totalOrderValueUsd, 0);
  assert.equal(summary.grossProfitPct, null);
});
