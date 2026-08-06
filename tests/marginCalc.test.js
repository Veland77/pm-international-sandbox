// tests/marginCalc.test.js
// Pure unit tests for the shared buy/freight/sell/margin calculations used
// everywhere on the RFQ page — no database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  toSourcedLineItems,
  buildLineCosts,
  buildMargin,
  buildLineItemDisplayRows,
  buildTotals,
} = require("../src/db/marginCalc");

const RATES = [
  { currency_code: "USD", rate_to_usd: 1 },
  { currency_code: "EUR", rate_to_usd: 1.08 },
];

test("toSourcedLineItems keeps only lines with a resolved vendor", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, quantity: 10, unit_price: 80, currency: "USD", weight_kg: 20, supplier_id: 5 },
    { rfq_line_item_id: 2, quantity: 5, unit_price: null, currency: null, weight_kg: null, supplier_id: null },
  ];
  const sourced = toSourcedLineItems(allLineItems);
  assert.equal(sourced.length, 1);
  assert.equal(sourced[0].rfqLineItemId, 1);
  assert.equal(sourced[0].supplierId, 5);
});

test("buildLineCosts: a freight quote covering exactly one line item attributes its full cost directly — no fractional split", () => {
  const sourcedLineItems = [
    { rfqLineItemId: "D", quantity: 2, unitPrice: 40, currency: "USD", weightKg: 5, supplierId: 6 },
  ];
  const freightCoverageRows = [{ freight_quote_id: "Q2", price: 150, currency: "USD", rfq_line_item_id: "D" }];

  const costs = buildLineCosts(sourcedLineItems, freightCoverageRows, RATES);
  const d = costs.get("D");
  assert.equal(d.buyUnitPriceUsd, 40);
  assert.equal(d.freightUnitUsd, 150 / 2); // the whole $150 quote, just spread over D's 2 units
});

test("buildLineCosts: a freight quote covering two line items splits by weight share", () => {
  // Quote Q1 covers A (10kg x 1 = 10kg) and B (20kg x 1 = 20kg) — 30kg
  // total. Its $300 price should split 1/3 to A, 2/3 to B.
  const sourcedLineItems = [
    { rfqLineItemId: "A", quantity: 1, unitPrice: 80, currency: "USD", weightKg: 10, supplierId: 5 },
    { rfqLineItemId: "B", quantity: 1, unitPrice: 60, currency: "USD", weightKg: 20, supplierId: 5 },
  ];
  const freightCoverageRows = [
    { freight_quote_id: "Q1", price: 300, currency: "USD", rfq_line_item_id: "A" },
    { freight_quote_id: "Q1", price: 300, currency: "USD", rfq_line_item_id: "B" },
  ];

  const costs = buildLineCosts(sourcedLineItems, freightCoverageRows, RATES);
  assert.equal(costs.get("A").freightUnitUsd, 300 * (10 / 30));
  assert.equal(costs.get("B").freightUnitUsd, 300 * (20 / 30));
});

test("buildLineCosts: a line item from the same vendor but OUTSIDE the freight quote's own coverage never dilutes that quote's allocation", () => {
  // The key correction: vendor 5 has a third line, C (100kg — much heavier
  // than A+B combined), sourced from the same vendor but NOT part of Q1's
  // freight_inquiry_line_items (a separate shipment/arrangement). Q1's
  // $300 must still split only across A and B (1/3 / 2/3, same as the
  // two-line test above) — C's weight must not enter the denominator, and
  // C itself gets no freight cost since no quote covers it.
  const sourcedLineItems = [
    { rfqLineItemId: "A", quantity: 1, unitPrice: 80, currency: "USD", weightKg: 10, supplierId: 5 },
    { rfqLineItemId: "B", quantity: 1, unitPrice: 60, currency: "USD", weightKg: 20, supplierId: 5 },
    { rfqLineItemId: "C", quantity: 1, unitPrice: 50, currency: "USD", weightKg: 100, supplierId: 5 },
  ];
  const freightCoverageRows = [
    { freight_quote_id: "Q1", price: 300, currency: "USD", rfq_line_item_id: "A" },
    { freight_quote_id: "Q1", price: 300, currency: "USD", rfq_line_item_id: "B" },
    // No row for C — Q1 does not cover it.
  ];

  const costs = buildLineCosts(sourcedLineItems, freightCoverageRows, RATES);
  assert.equal(costs.get("A").freightUnitUsd, 300 * (10 / 30));
  assert.equal(costs.get("B").freightUnitUsd, 300 * (20 / 30));
  assert.equal(costs.get("C").freightUnitUsd, null); // not $0 — genuinely not arranged yet
});

test("buildLineCosts: no freight coverage at all leaves freightUnitUsd null, not $0 or a crash", () => {
  const sourcedLineItems = [
    { rfqLineItemId: "A", quantity: 10, unitPrice: 80, currency: "USD", weightKg: 20, supplierId: 5 },
  ];
  const costs = buildLineCosts(sourcedLineItems, [], RATES);
  assert.equal(costs.get("A").freightUnitUsd, null);
  assert.equal(costs.get("A").buyUnitPriceUsd, 80);
});

test("buildLineCosts converts foreign-currency buy price via the shared FX logic", () => {
  const sourcedLineItems = [
    { rfqLineItemId: "A", quantity: 1, unitPrice: 100, currency: "EUR", weightKg: 10, supplierId: 5 },
  ];
  const costs = buildLineCosts(sourcedLineItems, [], RATES);
  // 100 * 1.08 * 1.005 (FX_MARGIN_PCT)
  assert.equal(costs.get("A").buyUnitPriceUsd, 100 * 1.08 * 1.005);
});

test("buildMargin computes margin $ and % from sell vs (buy + freight)", () => {
  const { marginUnitUsd, marginPct } = buildMargin(150, 100, 20);
  assert.equal(marginUnitUsd, 30);
  assert.equal(marginPct, (30 / 150) * 100);
});

test("buildMargin treats a null freight (not yet arranged) as $0 cost, not blocking the calc", () => {
  const { marginUnitUsd } = buildMargin(150, 100, null);
  assert.equal(marginUnitUsd, 50);
});

test("buildMargin returns nulls when buy price is unknown", () => {
  const { marginUnitUsd, marginPct } = buildMargin(150, null, 20);
  assert.equal(marginUnitUsd, null);
  assert.equal(marginPct, null);
});

test("buildMargin can be negative — real signal, not suppressed", () => {
  const { marginUnitUsd, marginPct } = buildMargin(80, 90, 15);
  assert.equal(marginUnitUsd, -25);
  assert.ok(marginPct < 0);
});

test("buildLineItemDisplayRows flags an unsourced line and excludes it from pricing", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, description: "Sourced Line", quantity: 10, unit: "EA", supplier_id: 5, supplier_name: "Vendor A" },
    { rfq_line_item_id: 2, description: "Unsourced Line", quantity: 5, unit: "EA", supplier_id: null, supplier_name: null },
  ];
  const lineCosts = new Map([[1, { buyUnitPriceUsd: 80, freightUnitUsd: 5 }]]);
  const rows = buildLineItemDisplayRows(allLineItems, lineCosts, { 1: "120" });

  const sourcedRow = rows.find((r) => r.rfqLineItemId === 1);
  assert.equal(sourcedRow.sourced, true);
  assert.equal(sourcedRow.buyUnitPriceUsd, 80);
  assert.equal(sourcedRow.freightUnitUsd, 5);
  assert.equal(sourcedRow.sellUnitPriceUsd, 120);
  assert.equal(sourcedRow.marginUnitUsd, 35); // 120 - 80 - 5

  const unsourcedRow = rows.find((r) => r.rfqLineItemId === 2);
  assert.equal(unsourcedRow.sourced, false);
});

test("buildLineItemDisplayRows leaves margin null when no sell price has been entered yet, but still shows buy/freight", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, description: "Line", quantity: 1, unit: "EA", supplier_id: 5, supplier_name: "Vendor A" },
  ];
  const lineCosts = new Map([[1, { buyUnitPriceUsd: 80, freightUnitUsd: 5 }]]);
  const rows = buildLineItemDisplayRows(allLineItems, lineCosts, {});
  assert.equal(rows[0].buyUnitPriceUsd, 80);
  assert.equal(rows[0].freightUnitUsd, 5);
  assert.equal(rows[0].sellUnitPriceUsd, null);
  assert.equal(rows[0].marginUnitUsd, null);
});

test("buildTotals aggregates buy, freight, and sell across sourced rows with a valid sell price", () => {
  const displayRows = [
    { sourced: true, sellUnitPriceUsd: 120, buyUnitPriceUsd: 85, freightUnitUsd: 5, quantity: 10 },
    { sourced: true, sellUnitPriceUsd: null, buyUnitPriceUsd: 50, freightUnitUsd: null, quantity: 5 }, // no price yet — excluded
    { sourced: false }, // unsourced — excluded
  ];
  const totals = buildTotals(displayRows);
  assert.equal(totals.totalSellUsd, 1200);
  assert.equal(totals.totalBuyUsd, 850);
  assert.equal(totals.totalFreightUsd, 50);
  assert.equal(totals.marginUsd, 1200 - 850 - 50);
});

test("buildTotals treats a null freight on an otherwise-priced row as $0 contribution", () => {
  const displayRows = [{ sourced: true, sellUnitPriceUsd: 100, buyUnitPriceUsd: 80, freightUnitUsd: null, quantity: 1 }];
  const totals = buildTotals(displayRows);
  assert.equal(totals.totalFreightUsd, 0);
  assert.equal(totals.marginUsd, 20);
});

test("buildTotals returns null when nothing has a valid sell price yet", () => {
  assert.equal(buildTotals([{ sourced: false }]), null);
  assert.equal(buildTotals([]), null);
});
