// tests/freightQuoteSelectionCalc.test.js
// Pure unit tests for sortQuotesByUsdPrice — no database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const { sortQuotesByUsdPrice } = require("../src/db/freightQuoteSelectionQueries");
const { toUsd } = require("../src/db/orderSummary");

const RATES = [
  { currency_code: "USD", rate_to_usd: 1 },
  { currency_code: "EUR", rate_to_usd: 1.08 },
];

test("sorts quotes ascending by USD-converted price, not native price", () => {
  // Quote 1's raw price (100) is numerically lower than quote 2's (105),
  // but quote 1 is EUR (gets the FX conversion + margin applied) and ends
  // up costing more in USD — a naive sort on raw `price` would get this
  // backwards.
  const quotes = [
    { freight_quote_id: 1, price: 100, currency: "EUR" },
    { freight_quote_id: 2, price: 105, currency: "USD" },
  ];
  const sorted = sortQuotesByUsdPrice(quotes, RATES);
  assert.equal(sorted[0].freight_quote_id, 2);
  assert.equal(sorted[1].freight_quote_id, 1);
  assert.equal(sorted[1].usdPrice, toUsd(100, "EUR", new Map(RATES.map((r) => [r.currency_code, r.rate_to_usd]))));
});

test("a quote in an unknown currency sorts last instead of crashing", () => {
  const quotes = [
    { freight_quote_id: 1, price: 100, currency: "GBP" }, // no known rate
    { freight_quote_id: 2, price: 5000, currency: "USD" },
  ];
  const sorted = sortQuotesByUsdPrice(quotes, RATES);
  assert.equal(sorted[0].freight_quote_id, 2);
  assert.equal(sorted[1].freight_quote_id, 1);
  assert.equal(sorted[1].usdPrice, null);
});

test("returns an empty array for no quotes", () => {
  assert.deepEqual(sortQuotesByUsdPrice([], RATES), []);
});
