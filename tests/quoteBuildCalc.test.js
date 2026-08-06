// tests/quoteBuildCalc.test.js
// Pure unit tests for the Offer to Customer quote-build calculations — no
// database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  toSourcedLineItems,
  buildLandedUnitPrices,
  buildMargin,
  buildQuoteDisplayRows,
  buildQuoteTotals,
} = require("../src/db/quoteBuildCalc");

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

test("buildLandedUnitPrices allocates one vendor's freight quote across its lines by weight share", () => {
  // Vendor 5 ships two lines: line A (20kg x 10 = 200kg) and line B (30kg x
  // 20 = 600kg) — 800kg total. A $800 freight quote should split 1/4 to A, 3/4 to B.
  const sourcedLineItems = [
    { rfqLineItemId: "A", quantity: 10, unitPrice: 80, currency: "USD", weightKg: 20, supplierId: 5 },
    { rfqLineItemId: "B", quantity: 20, unitPrice: 60, currency: "USD", weightKg: 30, supplierId: 5 },
  ];
  const selectedFreightBySupplierId = new Map([[5, { usdPrice: 800 }]]);

  const landed = buildLandedUnitPrices(sourcedLineItems, selectedFreightBySupplierId, RATES);

  const a = landed.get("A");
  const b = landed.get("B");
  assert.equal(a.buyUnitPriceUsd, 80);
  assert.equal(a.freightPerUnitUsd, (800 * 0.25) / 10); // $20/unit
  assert.equal(a.landedUnitPriceUsd, 80 + (800 * 0.25) / 10);

  assert.equal(b.buyUnitPriceUsd, 60);
  assert.equal(b.freightPerUnitUsd, (800 * 0.75) / 20); // $30/unit
  assert.equal(b.landedUnitPriceUsd, 60 + (800 * 0.75) / 20);
});

test("buildLandedUnitPrices treats a vendor with no selected freight quote as $0 freight, not a crash", () => {
  const sourcedLineItems = [
    { rfqLineItemId: "A", quantity: 10, unitPrice: 80, currency: "USD", weightKg: 20, supplierId: 5 },
  ];
  const landed = buildLandedUnitPrices(sourcedLineItems, new Map(), RATES);
  const a = landed.get("A");
  assert.equal(a.freightPerUnitUsd, 0);
  assert.equal(a.landedUnitPriceUsd, 80);
});

test("buildLandedUnitPrices converts foreign-currency buy price via the shared FX logic", () => {
  const sourcedLineItems = [
    { rfqLineItemId: "A", quantity: 1, unitPrice: 100, currency: "EUR", weightKg: 10, supplierId: 5 },
  ];
  const landed = buildLandedUnitPrices(sourcedLineItems, new Map(), RATES);
  // 100 * 1.08 * 1.005 (FX_MARGIN_PCT)
  assert.equal(landed.get("A").buyUnitPriceUsd, 100 * 1.08 * 1.005);
});

test("buildMargin computes margin $ and % from sell vs landed price", () => {
  const { marginUnitUsd, marginPct } = buildMargin(150, 100);
  assert.equal(marginUnitUsd, 50);
  assert.equal(marginPct, (50 / 150) * 100);
});

test("buildMargin returns nulls when landed price is unknown", () => {
  const { marginUnitUsd, marginPct } = buildMargin(150, null);
  assert.equal(marginUnitUsd, null);
  assert.equal(marginPct, null);
});

test("buildMargin can be negative — real signal, not suppressed", () => {
  const { marginUnitUsd, marginPct } = buildMargin(80, 100);
  assert.equal(marginUnitUsd, -20);
  assert.ok(marginPct < 0);
});

test("buildQuoteDisplayRows flags an unsourced line and excludes it from pricing", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, description: "Sourced Line", quantity: 10, unit: "EA", supplier_id: 5, supplier_name: "Vendor A" },
    { rfq_line_item_id: 2, description: "Unsourced Line", quantity: 5, unit: "EA", supplier_id: null, supplier_name: null },
  ];
  const landedPrices = new Map([[1, { buyUnitPriceUsd: 80, landedUnitPriceUsd: 85 }]]);
  const rows = buildQuoteDisplayRows(allLineItems, landedPrices, { 1: "120" });

  const sourcedRow = rows.find((r) => r.rfqLineItemId === 1);
  assert.equal(sourcedRow.sourced, true);
  assert.equal(sourcedRow.sellUnitPriceUsd, 120);
  assert.equal(sourcedRow.marginUnitUsd, 35);

  const unsourcedRow = rows.find((r) => r.rfqLineItemId === 2);
  assert.equal(unsourcedRow.sourced, false);
});

test("buildQuoteDisplayRows leaves margin null when no sell price has been entered yet", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, description: "Line", quantity: 1, unit: "EA", supplier_id: 5, supplier_name: "Vendor A" },
  ];
  const landedPrices = new Map([[1, { landedUnitPriceUsd: 85 }]]);
  const rows = buildQuoteDisplayRows(allLineItems, landedPrices, {});
  assert.equal(rows[0].sellUnitPriceUsd, null);
  assert.equal(rows[0].marginUnitUsd, null);
});

test("buildQuoteTotals aggregates only sourced rows with a valid sell price", () => {
  const displayRows = [
    { sourced: true, sellUnitPriceUsd: 120, buyUnitPriceUsd: 85, quantity: 10 },
    { sourced: true, sellUnitPriceUsd: null, buyUnitPriceUsd: 50, quantity: 5 }, // no price yet — excluded
    { sourced: false }, // unsourced — excluded
  ];
  const totals = buildQuoteTotals(displayRows);
  assert.equal(totals.totalSellUsd, 1200);
  assert.equal(totals.totalBuyUsd, 850);
  assert.equal(totals.marginUsd, 350);
});

test("buildQuoteTotals returns null when nothing has a valid sell price yet", () => {
  assert.equal(buildQuoteTotals([{ sourced: false }]), null);
  assert.equal(buildQuoteTotals([]), null);
});
