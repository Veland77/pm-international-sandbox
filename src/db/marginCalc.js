// src/db/marginCalc.js
// Pure margin/cost calculations shared by every place on the RFQ page
// that shows buy/sell/margin: the Order Summary card, the Line Items
// table, the Quote section, and (freight only) the Supplier Comparison
// table. One calculation, reused everywhere — nothing computes margin its
// own way. Freight is never folded into an item's own STORED price
// (buildLineItemDisplayRows/quote_line_items.unit_price_usd stay
// freight-free always) — it's tracked per line (buildLineCosts, for
// allocation purposes) and normally surfaces only as its own aggregated
// line (buildFreightLineItem). The one deliberate exception: a quote's
// "Included in items" mode lets the sales rep set a combined sell price
// directly (landed_sell_price_usd, stored as typed) — see
// deriveItemSellFromCombined for how the pure item price underneath it
// gets derived, and buildLineItemDisplayRows's marginIncludesFreight
// option for how that combined price's margin gets checked. No DB
// access, so this is directly unit-testable.

const { toUsd } = require("./orderSummary");

// allLineItems: rows from getRfqLineItemsWithSourcing — only the ones with
// a resolved supplier_id are actually sourced/quotable.
function toSourcedLineItems(allLineItems) {
  return allLineItems
    .filter((li) => li.supplier_id != null)
    .map((li) => ({
      rfqLineItemId: li.rfq_line_item_id,
      quantity: li.quantity,
      unitPrice: li.unit_price,
      currency: li.currency,
      weightKg: li.weight_kg,
      supplierId: li.supplier_id,
    }));
}

// sourcedLineItems: from toSourcedLineItems
// freightCoverageRows: [{ freight_quote_id, price, currency, rfq_line_item_id }]
//   — one row per (a vendor's Selected freight quote, a line item that
//   quote's own freight_inquiry actually covers). A quote covering only
//   one line item attributes its full cost directly to that line — the
//   trivial 100% case of the same weight-share formula below, not a
//   separately-handled special case. A quote is NEVER allocated across a
//   vendor's other line items that fall outside its own coverage.
// rates: rows from getCurrencyRates
// returns Map<rfqLineItemId, { buyUnitPriceUsd, freightUnitUsd }> — buy
// and freight are always kept separate; freightUnitUsd is null (not 0)
// when no freight quote has been selected for that line's shipment yet,
// so callers can tell "not arranged" apart from "arranged and free."
function buildLineCosts(sourcedLineItems, freightCoverageRows, rates) {
  const rateMap = new Map(rates.map((r) => [r.currency_code, r.rate_to_usd]));
  const lineById = new Map(sourcedLineItems.map((li) => [li.rfqLineItemId, li]));

  // Total weight actually covered by each specific freight quote — not
  // the vendor's total shipment weight, so a line outside that quote's
  // own freight_inquiry_line_items never dilutes its allocation.
  const totalWeightByFreightQuoteId = new Map();
  freightCoverageRows.forEach((row) => {
    const li = lineById.get(row.rfq_line_item_id);
    if (!li) return;
    const weight = li.weightKg * li.quantity;
    totalWeightByFreightQuoteId.set(
      row.freight_quote_id,
      (totalWeightByFreightQuoteId.get(row.freight_quote_id) || 0) + weight
    );
  });

  const freightTotalUsdByLineItemId = new Map();
  freightCoverageRows.forEach((row) => {
    const li = lineById.get(row.rfq_line_item_id);
    if (!li) return;
    const totalWeight = totalWeightByFreightQuoteId.get(row.freight_quote_id) || 0;
    const lineWeight = li.weightKg * li.quantity;
    const usdPrice = toUsd(row.price, row.currency, rateMap);
    if (usdPrice == null || totalWeight <= 0) return;
    const share = usdPrice * (lineWeight / totalWeight);
    freightTotalUsdByLineItemId.set(
      row.rfq_line_item_id,
      (freightTotalUsdByLineItemId.get(row.rfq_line_item_id) || 0) + share
    );
  });

  const result = new Map();
  sourcedLineItems.forEach((li) => {
    const buyUnitPriceUsd = toUsd(li.unitPrice, li.currency, rateMap);
    const freightTotalUsd = freightTotalUsdByLineItemId.get(li.rfqLineItemId);
    let freightUnitUsd = null;
    if (freightTotalUsd != null) {
      freightUnitUsd = li.quantity > 0 ? freightTotalUsd / li.quantity : 0;
    }
    result.set(li.rfqLineItemId, { buyUnitPriceUsd, freightUnitUsd });
  });

  return result;
}

// sellUnitPriceUsd vs (buyUnitPriceUsd + freightUnitUsd). freightUnitUsd
// of null (not yet arranged) contributes $0 to cost, same as before
// freight was tracked at all — margin isn't blocked on freight being
// sorted out, it just reflects buy-vs-sell until then.
function buildMargin(sellUnitPriceUsd, buyUnitPriceUsd, freightUnitUsd) {
  if (buyUnitPriceUsd == null) return { marginUnitUsd: null, marginPct: null };
  const totalCostUsd = buyUnitPriceUsd + (freightUnitUsd || 0);
  const marginUnitUsd = sellUnitPriceUsd - totalCostUsd;
  const marginPct = sellUnitPriceUsd > 0 ? (marginUnitUsd / sellUnitPriceUsd) * 100 : null;
  return { marginUnitUsd, marginPct };
}

// Suggested-default sell price for the quote create/edit form — a
// starting point the sales rep can freely override per line, never a
// decision made for them. Item cost and freight cost carry different
// markups (freight is a pass-through cost with thinner margin potential
// than the item itself), so they're marked up separately and summed,
// not blended into a single flat rate.
const ITEM_MARKUP_PCT = 30;
const FREIGHT_MARKUP_PCT = 15;

function suggestSellPrice(buyUnitPriceUsd, freightUnitUsd) {
  if (buyUnitPriceUsd == null) return null;
  const buyWithMarkup = buyUnitPriceUsd * (1 + ITEM_MARKUP_PCT / 100);
  const freightWithMarkup = (freightUnitUsd || 0) * (1 + FREIGHT_MARKUP_PCT / 100);
  return buyWithMarkup + freightWithMarkup;
}

// Freight doesn't fit the FORM-MATERIAL-YY-SEQUENCE item-numbering scheme
// used elsewhere (it's not a material or product form) — every quote's
// freight line gets this same fixed code instead of a generated one.
const FREIGHT_LINE_ITEM_CODE = "FRT-SVC";

// Sums the freight cost already attributed to every sourced line item
// (buildLineCosts's per-line weight-share allocation) into the single
// number the aggregated Freight line's buy price is built from. Reuses
// that allocation as-is — never recomputes freight cost, only totals what
// buildLineCosts already worked out per line.
function buildFreightLineTotal(allLineItems, lineCosts) {
  let total = 0;
  allLineItems.forEach((li) => {
    if (li.supplier_id == null) return;
    const costs = lineCosts.get(li.rfq_line_item_id);
    if (!costs) return;
    total += (costs.freightUnitUsd || 0) * li.quantity;
  });
  return total;
}

// The one aggregated Freight line shown on the Create Quote form and the
// saved Quote section, in place of a per-item Freight Cost column. Same
// row shape as buildLineItemDisplayRows's output (so it shares rendering
// and buildTotals with every other line) but synthetic: no
// rfq_line_item_id, buy price is buildFreightLineTotal (never
// recomputed here), sell price is whatever's been typed/saved.
// freightSellPriceRaw: string form input, or an already-saved quote's
// freight_sell_price_usd (also passed as a string) — same convention as
// buildLineItemDisplayRows's sellPriceFormValues.
function buildFreightLineItem(allLineItems, lineCosts, freightSellPriceRaw) {
  const buyUnitPriceUsd = buildFreightLineTotal(allLineItems, lineCosts);
  const sellUnitPriceUsd = parseSellPriceInput(freightSellPriceRaw);
  const { marginUnitUsd, marginPct } =
    sellUnitPriceUsd != null
      ? buildMargin(sellUnitPriceUsd, buyUnitPriceUsd, null)
      : { marginUnitUsd: null, marginPct: null };

  return {
    rfqLineItemId: null,
    description: `Freight (${FREIGHT_LINE_ITEM_CODE})`,
    quantity: 1,
    unit: "Shipment",
    sourced: true,
    isFreightLine: true,
    supplierName: null,
    buyUnitPriceUsd,
    sellPriceRaw: freightSellPriceRaw || "",
    sellUnitPriceUsd,
    marginUnitUsd,
    marginPct,
  };
}

// Parses a user-typed sell price, accepting either "123.45" or the
// Norwegian/European "123,45" (comma decimal separator) — this sandbox's
// users are Norway-based and their OS locale types a comma, not a period.
// A comma is only treated as a decimal separator, never a thousands
// grouping, so "123,45" -> 123.45 but a malformed value like "1,234,56"
// still fails to parse rather than guessing. Returns null, never NaN, so
// callers can treat "didn't parse" and "wasn't entered" the same way.
function parseSellPriceInput(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const normalized = /^-?\d+,\d+$/.test(trimmed) ? trimmed.replace(",", ".") : trimmed;
  const num = Number(normalized);
  return Number.isNaN(num) ? null : num;
}

// allLineItems: rows from getRfqLineItemsWithSourcing (sourced + unsourced)
// lineCosts: Map from buildLineCosts
// sellPriceFormValues: { [rfqLineItemId]: "123.45" } — string form input,
// or an already-saved quote's unit_price_usd/landed_sell_price_usd values
// (also passed as strings)
//
// A line item's own margin is buy-vs-sell only by default — freight is
// never subtracted here, even though costs.freightUnitUsd is still
// carried on the row (used to build the aggregated Freight line's buy
// price via buildFreightLineTotal, and still useful context). Freight's
// own economics live entirely on that one separate line, never split
// back across the items that happen to make up its shipment — UNLESS
// marginIncludesFreight is set, for the one deliberate exception: when a
// quote's freight_display_mode is 'included', sellPriceFormValues holds
// each line's combined (item + freight) sell price, so its margin has to
// be checked against buy + freight together, or it would look inflated
// by exactly the freight this price is already covering.
function buildLineItemDisplayRows(allLineItems, lineCosts, sellPriceFormValues, { marginIncludesFreight = false } = {}) {
  return allLineItems.map((li) => {
    if (li.supplier_id == null) {
      return {
        rfqLineItemId: li.rfq_line_item_id,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        sourced: false,
      };
    }

    const costs = lineCosts.get(li.rfq_line_item_id) || {};
    const raw = sellPriceFormValues[String(li.rfq_line_item_id)];
    const sellUnitPriceUsd = parseSellPriceInput(raw);
    const { marginUnitUsd, marginPct } =
      sellUnitPriceUsd != null
        ? buildMargin(sellUnitPriceUsd, costs.buyUnitPriceUsd, marginIncludesFreight ? costs.freightUnitUsd : null)
        : { marginUnitUsd: null, marginPct: null };

    return {
      rfqLineItemId: li.rfq_line_item_id,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      sourced: true,
      supplierName: li.supplier_name,
      buyUnitPriceUsd: costs.buyUnitPriceUsd,
      freightUnitUsd: costs.freightUnitUsd,
      sellPriceRaw: raw || "",
      sellUnitPriceUsd,
      marginUnitUsd,
      marginPct,
    };
  });
}

// null when nothing priceable has a valid sell price yet, so the view can
// show "—" instead of a misleading $0 total.
//
// totalFreightUsd only ever comes from a row flagged isFreightLine (see
// buildFreightLineItem) — an array of item rows alone reports $0 freight
// here, it never re-derives freight cost on its own. Callers that want
// freight reflected in these totals must include that row in displayRows.
function buildTotals(displayRows) {
  let totalSellUsd = 0;
  let totalBuyUsd = 0;
  let totalFreightUsd = 0;
  let any = false;

  displayRows.forEach((row) => {
    if (!row.sourced || row.sellUnitPriceUsd == null || row.buyUnitPriceUsd == null) return;
    any = true;
    totalSellUsd += row.sellUnitPriceUsd * row.quantity;
    totalBuyUsd += row.buyUnitPriceUsd * row.quantity;
    if (row.isFreightLine) {
      totalFreightUsd += row.buyUnitPriceUsd * row.quantity;
    }
  });

  if (!any) return null;

  const marginUsd = totalSellUsd - totalBuyUsd;
  const marginPct = totalSellUsd > 0 ? (marginUsd / totalSellUsd) * 100 : null;

  return { totalSellUsd, totalBuyUsd, totalFreightUsd, marginUsd, marginPct };
}

// The reverse direction of "Included in items" mode: the sales rep types
// one combined (item + freight) sell price per line directly — this
// derives what PURE item price to store underneath it, since
// quote_line_items.unit_price_usd must always stay freight-free (order
// conversion's PO total and the Order detail page's per-line margin both
// assume that — see schema.js). The freight portion subtracted out is
// anchored to that line's own real freight cost (freightUnitUsd) marked
// up at the same FREIGHT_MARKUP_PCT the separate-mode Freight line
// already uses (via suggestSellPrice(0, freightUnitUsd), which applies
// only the freight markup) — NOT a proportional share of whatever the
// rep typed, so the split is stable and doesn't move underneath them no
// matter what combined number they choose. combinedSellUsd is stored
// as-is, unchanged, in landed_sell_price_usd — never recomputed again.
function deriveItemSellFromCombined(combinedSellUsd, freightUnitUsd) {
  if (combinedSellUsd == null) return { itemSellUsd: null, freightPortionUsd: null };
  const freightPortionUsd = suggestSellPrice(0, freightUnitUsd);
  return { itemSellUsd: combinedSellUsd - freightPortionUsd, freightPortionUsd };
}

module.exports = {
  toSourcedLineItems,
  buildLineCosts,
  buildMargin,
  parseSellPriceInput,
  suggestSellPrice,
  deriveItemSellFromCombined,
  FREIGHT_LINE_ITEM_CODE,
  buildFreightLineTotal,
  buildFreightLineItem,
  buildLineItemDisplayRows,
  buildTotals,
};
