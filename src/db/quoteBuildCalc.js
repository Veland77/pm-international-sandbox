// src/db/quoteBuildCalc.js
// Pure calculations for the Offer to Customer (quote create/edit) screen:
// landed buy price per line (vendor cost + an allocated share of that
// vendor's selected freight quote, split by weight), margin $/% given a
// sell price, and the display rows / totals the view renders. Kept
// separate from orderSummary.js's buildLineItemMargins/buildOrderSummary
// — those don't include freight, and folding freight in here would
// silently change numbers already shown elsewhere (the RFQ page's Order
// Summary card, the Line Items table). No DB access, so this is directly
// unit-testable.

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
// selectedFreightBySupplierId: Map<supplierId, { usdPrice }>
// rates: rows from getCurrencyRates
// returns Map<rfqLineItemId, { buyUnitPriceUsd, freightPerUnitUsd, landedUnitPriceUsd }>
function buildLandedUnitPrices(sourcedLineItems, selectedFreightBySupplierId, rates) {
  const rateMap = new Map(rates.map((r) => [r.currency_code, r.rate_to_usd]));

  // Total weight covered by each vendor's shipment, used to allocate that
  // vendor's freight quote proportionally across its line items.
  const totalWeightBySupplier = new Map();
  sourcedLineItems.forEach((li) => {
    const weight = li.weightKg * li.quantity;
    totalWeightBySupplier.set(li.supplierId, (totalWeightBySupplier.get(li.supplierId) || 0) + weight);
  });

  const result = new Map();
  sourcedLineItems.forEach((li) => {
    const buyUnitPriceUsd = toUsd(li.unitPrice, li.currency, rateMap);
    const freight = selectedFreightBySupplierId.get(li.supplierId);
    const totalWeight = totalWeightBySupplier.get(li.supplierId);
    const lineWeight = li.weightKg * li.quantity;
    const freightShareUsd =
      freight && freight.usdPrice != null && totalWeight > 0 ? freight.usdPrice * (lineWeight / totalWeight) : 0;
    const freightPerUnitUsd = li.quantity > 0 ? freightShareUsd / li.quantity : 0;

    result.set(li.rfqLineItemId, {
      buyUnitPriceUsd,
      freightPerUnitUsd,
      landedUnitPriceUsd: buyUnitPriceUsd == null ? null : buyUnitPriceUsd + freightPerUnitUsd,
    });
  });

  return result;
}

function buildMargin(sellUnitPriceUsd, landedUnitPriceUsd) {
  if (landedUnitPriceUsd == null) return { marginUnitUsd: null, marginPct: null };
  const marginUnitUsd = sellUnitPriceUsd - landedUnitPriceUsd;
  const marginPct = sellUnitPriceUsd > 0 ? (marginUnitUsd / sellUnitPriceUsd) * 100 : null;
  return { marginUnitUsd, marginPct };
}

// allLineItems: rows from getRfqLineItemsWithSourcing (sourced + unsourced)
// landedPrices: Map from buildLandedUnitPrices
// sellPriceFormValues: { [rfqLineItemId]: "123.45" } — string form input,
// or an already-saved quote's unit_price_usd values (also passed as strings)
function buildQuoteDisplayRows(allLineItems, landedPrices, sellPriceFormValues) {
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

    const landed = landedPrices.get(li.rfq_line_item_id) || {};
    const raw = sellPriceFormValues[String(li.rfq_line_item_id)];
    const sellUnitPriceUsd = raw !== undefined && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null;
    const { marginUnitUsd, marginPct } =
      sellUnitPriceUsd != null
        ? buildMargin(sellUnitPriceUsd, landed.landedUnitPriceUsd)
        : { marginUnitUsd: null, marginPct: null };

    return {
      rfqLineItemId: li.rfq_line_item_id,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      sourced: true,
      supplierName: li.supplier_name,
      buyUnitPriceUsd: landed.landedUnitPriceUsd,
      sellPriceRaw: raw || "",
      sellUnitPriceUsd,
      marginUnitUsd,
      marginPct,
    };
  });
}

// null when nothing priceable has a valid sell price yet, so the view can
// show "—" instead of a misleading $0 total.
function buildQuoteTotals(displayRows) {
  let totalSellUsd = 0;
  let totalBuyUsd = 0;
  let any = false;

  displayRows.forEach((row) => {
    if (!row.sourced || row.sellUnitPriceUsd == null || row.buyUnitPriceUsd == null) return;
    any = true;
    totalSellUsd += row.sellUnitPriceUsd * row.quantity;
    totalBuyUsd += row.buyUnitPriceUsd * row.quantity;
  });

  if (!any) return null;

  const marginUsd = totalSellUsd - totalBuyUsd;
  const marginPct = totalSellUsd > 0 ? (marginUsd / totalSellUsd) * 100 : null;

  return { totalSellUsd, totalBuyUsd, marginUsd, marginPct };
}

module.exports = {
  toSourcedLineItems,
  buildLandedUnitPrices,
  buildMargin,
  buildQuoteDisplayRows,
  buildQuoteTotals,
};
