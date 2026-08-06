// src/db/marginCalc.js
// Pure margin/cost calculations shared by every place on the RFQ page
// that shows buy/freight/sell/margin: the Order Summary card, the Line
// Items table, the Quote section, and (freight only) the Supplier
// Comparison table. One calculation, reused everywhere — nothing computes
// margin its own way, and nothing folds freight into buy price; they're
// always kept as separate numbers, only summed at the point margin is
// computed. No DB access, so this is directly unit-testable.

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
// or an already-saved quote's unit_price_usd values (also passed as strings)
function buildLineItemDisplayRows(allLineItems, lineCosts, sellPriceFormValues) {
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
        ? buildMargin(sellUnitPriceUsd, costs.buyUnitPriceUsd, costs.freightUnitUsd)
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
    totalFreightUsd += (row.freightUnitUsd || 0) * row.quantity;
  });

  if (!any) return null;

  const marginUsd = totalSellUsd - totalBuyUsd - totalFreightUsd;
  const marginPct = totalSellUsd > 0 ? (marginUsd / totalSellUsd) * 100 : null;

  return { totalSellUsd, totalBuyUsd, totalFreightUsd, marginUsd, marginPct };
}

module.exports = {
  toSourcedLineItems,
  buildLineCosts,
  buildMargin,
  parseSellPriceInput,
  suggestSellPrice,
  buildLineItemDisplayRows,
  buildTotals,
};
