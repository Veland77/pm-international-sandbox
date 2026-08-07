// tests/marginCalc.test.js
// Pure unit tests for the shared buy/freight/sell/margin calculations used
// everywhere on the RFQ page — no database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  toSourcedLineItems,
  buildLineCosts,
  buildMargin,
  parseSellPriceInput,
  suggestSellPrice,
  FREIGHT_LINE_ITEM_CODE,
  buildFreightLineTotal,
  buildFreightLineItem,
  buildLineItemDisplayRows,
  buildLandedLineItemRows,
  buildLandedPrintLineItems,
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

test("suggestSellPrice marks up item cost and freight cost separately, then sums them", () => {
  // 30% on buy, 15% on freight — never blended into one flat rate.
  const suggested = suggestSellPrice(100, 20);
  assert.equal(suggested, 100 * 1.3 + 20 * 1.15);
});

test("suggestSellPrice treats a null freight (not yet arranged) as $0, marking up buy price only", () => {
  const suggested = suggestSellPrice(100, null);
  assert.equal(suggested, 100 * 1.3);
});

test("suggestSellPrice returns null when buy price is unknown", () => {
  assert.equal(suggestSellPrice(null, 20), null);
});

test("parseSellPriceInput accepts a period decimal", () => {
  assert.equal(parseSellPriceInput("107.07"), 107.07);
});

test("parseSellPriceInput accepts a comma decimal (Norwegian/European locale)", () => {
  assert.equal(parseSellPriceInput("107,07"), 107.07);
});

test("parseSellPriceInput returns null for empty, missing, or unparseable input", () => {
  assert.equal(parseSellPriceInput(""), null);
  assert.equal(parseSellPriceInput(undefined), null);
  assert.equal(parseSellPriceInput(null), null);
  assert.equal(parseSellPriceInput("abc"), null);
});

test("buildLineItemDisplayRows accepts a comma-decimal sell price and computes margin from it", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, description: "Sourced Line", quantity: 10, unit: "EA", supplier_id: 5, supplier_name: "Vendor A" },
  ];
  const lineCosts = new Map([[1, { buyUnitPriceUsd: 80, freightUnitUsd: 5 }]]);
  const rows = buildLineItemDisplayRows(allLineItems, lineCosts, { 1: "120,00" });

  assert.equal(rows[0].sellUnitPriceUsd, 120);
  assert.equal(rows[0].marginUnitUsd, 40); // 120 - 80 (freight is never subtracted from an item's own margin)
});

test("buildLineItemDisplayRows preserves the raw typed value (including a comma) for redisplay on error", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, description: "Sourced Line", quantity: 10, unit: "EA", supplier_id: 5, supplier_name: "Vendor A" },
  ];
  const lineCosts = new Map([[1, { buyUnitPriceUsd: 80, freightUnitUsd: 5 }]]);
  const rows = buildLineItemDisplayRows(allLineItems, lineCosts, { 1: "107,07" });

  assert.equal(rows[0].sellPriceRaw, "107,07");
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
  assert.equal(sourcedRow.marginUnitUsd, 40); // 120 - 80 (freight is never subtracted from an item's own margin)

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

test("buildTotals aggregates buy and sell across item rows plus the freight line's own buy/sell", () => {
  const displayRows = [
    { sourced: true, sellUnitPriceUsd: 120, buyUnitPriceUsd: 85, quantity: 10 },
    { sourced: true, sellUnitPriceUsd: null, buyUnitPriceUsd: 50, quantity: 5 }, // no price yet — excluded
    { sourced: false }, // unsourced — excluded
    { sourced: true, isFreightLine: true, sellUnitPriceUsd: 60, buyUnitPriceUsd: 50, quantity: 1 },
  ];
  const totals = buildTotals(displayRows);
  assert.equal(totals.totalSellUsd, 1200 + 60);
  assert.equal(totals.totalBuyUsd, 850 + 50);
  assert.equal(totals.totalFreightUsd, 50); // only from the row flagged isFreightLine
  assert.equal(totals.marginUsd, 1200 + 60 - (850 + 50));
});

test("buildTotals reports $0 total freight when displayRows contains no freight line — it never re-derives freight cost itself", () => {
  const displayRows = [{ sourced: true, sellUnitPriceUsd: 100, buyUnitPriceUsd: 80, quantity: 1 }];
  const totals = buildTotals(displayRows);
  assert.equal(totals.totalFreightUsd, 0);
  assert.equal(totals.marginUsd, 20);
});

test("buildTotals returns null when nothing has a valid sell price yet", () => {
  assert.equal(buildTotals([{ sourced: false }]), null);
  assert.equal(buildTotals([]), null);
});

test("buildFreightLineTotal sums the freight already attributed to every sourced line item, weighted by quantity", () => {
  const allLineItems = [
    { rfq_line_item_id: 1, quantity: 10, supplier_id: 5 },
    { rfq_line_item_id: 2, quantity: 20, supplier_id: 5 },
    { rfq_line_item_id: 3, quantity: 99, supplier_id: null }, // unsourced — excluded
  ];
  const lineCosts = new Map([
    [1, { buyUnitPriceUsd: 69.22, freightUnitUsd: 14.86 }],
    [2, { buyUnitPriceUsd: 105.65, freightUnitUsd: 18.57 }],
  ]);
  const total = buildFreightLineTotal(allLineItems, lineCosts);
  assert.equal(total, 14.86 * 10 + 18.57 * 20);
});

test("buildFreightLineTotal treats a line with no freight arranged yet as $0, not a crash", () => {
  const allLineItems = [{ rfq_line_item_id: 1, quantity: 10, supplier_id: 5 }];
  const lineCosts = new Map([[1, { buyUnitPriceUsd: 69.22, freightUnitUsd: null }]]);
  assert.equal(buildFreightLineTotal(allLineItems, lineCosts), 0);
});

test("buildFreightLineItem builds a synthetic row with the fixed item code, derived buy price, and typed sell price", () => {
  const allLineItems = [{ rfq_line_item_id: 1, quantity: 10, supplier_id: 5 }];
  const lineCosts = new Map([[1, { buyUnitPriceUsd: 69.22, freightUnitUsd: 14.86 }]]);
  const row = buildFreightLineItem(allLineItems, lineCosts, "175.00");

  assert.equal(row.isFreightLine, true);
  assert.equal(row.rfqLineItemId, null);
  assert.ok(row.description.includes(FREIGHT_LINE_ITEM_CODE));
  assert.equal(row.buyUnitPriceUsd, 148.6); // 14.86 * 10, reused from lineCosts, never recomputed
  assert.equal(row.sellUnitPriceUsd, 175);
  assert.equal(row.marginUnitUsd, 175 - 148.6);
});

test("buildFreightLineItem leaves margin null when no sell price has been entered yet, but still shows the derived buy price", () => {
  const allLineItems = [{ rfq_line_item_id: 1, quantity: 10, supplier_id: 5 }];
  const lineCosts = new Map([[1, { buyUnitPriceUsd: 69.22, freightUnitUsd: 14.86 }]]);
  const row = buildFreightLineItem(allLineItems, lineCosts, "");

  assert.equal(row.buyUnitPriceUsd, 148.6);
  assert.equal(row.sellUnitPriceUsd, null);
  assert.equal(row.marginUnitUsd, null);
});

test("buildFreightLineItem accepts a comma-decimal sell price, same as an item line", () => {
  const allLineItems = [{ rfq_line_item_id: 1, quantity: 10, supplier_id: 5 }];
  const lineCosts = new Map([[1, { buyUnitPriceUsd: 69.22, freightUnitUsd: 14.86 }]]);
  const row = buildFreightLineItem(allLineItems, lineCosts, "175,00");
  assert.equal(row.sellUnitPriceUsd, 175);
});

test("buildLandedLineItemRows folds each item's weight-share of freight buy/sell into its own buy/sell, matching totals with the separate-line view", () => {
  // A (10kg x 1 = 10kg) and B (20kg x 1 = 20kg) — A carries 1/3 of the
  // $300 freight buy, B carries 2/3, same shares used for the freight
  // line's $450 sell price.
  const displayRows = [
    { rfqLineItemId: "A", sourced: true, quantity: 1, buyUnitPriceUsd: 80, freightUnitUsd: 100, sellUnitPriceUsd: 130, marginUnitUsd: 50, marginPct: 38.46 },
    { rfqLineItemId: "B", sourced: true, quantity: 1, buyUnitPriceUsd: 60, freightUnitUsd: 200, sellUnitPriceUsd: 90, marginUnitUsd: 30, marginPct: 33.33 },
  ];
  const freightRow = { isFreightLine: true, buyUnitPriceUsd: 300, sellUnitPriceUsd: 450, quantity: 1 };

  const landed = buildLandedLineItemRows(displayRows, freightRow);
  const a = landed.find((r) => r.rfqLineItemId === "A");
  const b = landed.find((r) => r.rfqLineItemId === "B");

  assert.equal(a.buyUnitPriceUsd, 80 + 100); // item buy + its own freight share
  assert.equal(a.sellUnitPriceUsd, 130 + 450 * (100 / 300)); // + its 1/3 share of freight sell
  assert.equal(a.marginUnitUsd, a.sellUnitPriceUsd - a.buyUnitPriceUsd);

  assert.equal(b.buyUnitPriceUsd, 60 + 200);
  assert.equal(b.sellUnitPriceUsd, 90 + 450 * (200 / 300));
  assert.equal(b.marginUnitUsd, b.sellUnitPriceUsd - b.buyUnitPriceUsd);

  // Same total sell/buy/margin as the separate-line view — this is the
  // whole point: a different split of the same numbers, not new math.
  const landedTotalSell = a.sellUnitPriceUsd + b.sellUnitPriceUsd;
  const landedTotalBuy = a.buyUnitPriceUsd + b.buyUnitPriceUsd;
  const separateTotalSell = 130 + 90 + 450;
  const separateTotalBuy = 80 + 60 + 300;
  assert.equal(landedTotalSell, separateTotalSell);
  assert.equal(landedTotalBuy, separateTotalBuy);
});

test("buildLandedLineItemRows leaves an unsourced row untouched", () => {
  const displayRows = [{ rfqLineItemId: "X", sourced: false, description: "Unsourced" }];
  const freightRow = { isFreightLine: true, buyUnitPriceUsd: 100, sellUnitPriceUsd: 115, quantity: 1 };
  const landed = buildLandedLineItemRows(displayRows, freightRow);
  assert.deepEqual(landed[0], displayRows[0]);
});

test("buildLandedLineItemRows leaves an item with no freight arranged unchanged — nothing to fold in", () => {
  const displayRows = [
    { rfqLineItemId: "A", sourced: true, quantity: 1, buyUnitPriceUsd: 80, freightUnitUsd: null, sellUnitPriceUsd: 130 },
  ];
  const freightRow = { isFreightLine: true, buyUnitPriceUsd: 0, sellUnitPriceUsd: 0, quantity: 1 };
  const landed = buildLandedLineItemRows(displayRows, freightRow);
  assert.equal(landed[0].buyUnitPriceUsd, 80);
  assert.equal(landed[0].sellUnitPriceUsd, 130);
});

test("buildLandedLineItemRows falls back to the item's own sell price when the freight line has no saved sell price yet", () => {
  const displayRows = [
    { rfqLineItemId: "A", sourced: true, quantity: 1, buyUnitPriceUsd: 80, freightUnitUsd: 20, sellUnitPriceUsd: 130 },
  ];
  const freightRow = { isFreightLine: true, buyUnitPriceUsd: 20, sellUnitPriceUsd: null, quantity: 1 };
  const landed = buildLandedLineItemRows(displayRows, freightRow);
  assert.equal(landed[0].buyUnitPriceUsd, 100); // buy price still folds in, it's never null
  assert.equal(landed[0].sellUnitPriceUsd, 130); // sell falls back — nothing to allocate yet
});

test("buildLandedPrintLineItems folds freight into each item purely by weight share — no cost/price figure needed", () => {
  // A (10kg x 1 = 10kg) and B (20kg x 1 = 20kg) — 30kg total, so A takes
  // 1/3 of the $450 freight sell and B takes 2/3, same shares
  // buildLandedLineItemRows would produce in the single-freight-quote case.
  const lineItems = [
    { rfq_line_item_id: "A", quantity: 1, sell_unit_price_usd: 130 },
    { rfq_line_item_id: "B", quantity: 1, sell_unit_price_usd: 90 },
  ];
  const weightByLineItemId = new Map([
    ["A", 10],
    ["B", 20],
  ]);

  const landed = buildLandedPrintLineItems(lineItems, 450, weightByLineItemId);
  const a = landed.find((li) => li.rfq_line_item_id === "A");
  const b = landed.find((li) => li.rfq_line_item_id === "B");

  assert.equal(a.sell_unit_price_usd, 130 + 450 * (10 / 30));
  assert.equal(b.sell_unit_price_usd, 90 + 450 * (20 / 30));
});

test("buildLandedPrintLineItems splits evenly when no weight data is available for any line — never divides by zero", () => {
  const lineItems = [
    { rfq_line_item_id: "A", quantity: 1, sell_unit_price_usd: 100 },
    { rfq_line_item_id: "B", quantity: 1, sell_unit_price_usd: 100 },
  ];
  const landed = buildLandedPrintLineItems(lineItems, 200, new Map());
  assert.equal(landed[0].sell_unit_price_usd, 100); // 0 share of $200 — unchanged, not NaN
  assert.equal(landed[1].sell_unit_price_usd, 100);
});

test("buildLandedPrintLineItems divides a multi-unit line's folded freight share across its own quantity", () => {
  const lineItems = [{ rfq_line_item_id: "A", quantity: 5, sell_unit_price_usd: 20 }];
  const weightByLineItemId = new Map([["A", 4]]); // 4kg x 5 units = 20kg, the only line — takes all $100
  const landed = buildLandedPrintLineItems(lineItems, 100, weightByLineItemId);
  assert.equal(landed[0].sell_unit_price_usd, 20 + 100 / 5);
});
