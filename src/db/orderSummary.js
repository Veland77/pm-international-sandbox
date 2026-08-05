// src/db/orderSummary.js
// Computes the RFQ detail page's order-value/gross-profit/delivery-date
// numbers from already-fetched rows. Pure logic, no database access, so
// it's testable on its own.

// A currency-conversion spread applied only when converting a vendor's
// foreign-currency cost to USD — reflects the real cost of actually
// converting money, not just the raw market rate. Never applied to USD.
const FX_MARGIN_PCT = 0.5;

// rates: rows from the currency_rates table ({ currency_code, rate_to_usd }).
function ratesByCode(rates) {
  return new Map(rates.map((r) => [r.currency_code, r.rate_to_usd]));
}

function toUsd(amount, currencyCode, rateMap) {
  if (currencyCode === "USD") return amount;
  const rate = rateMap.get(currencyCode);
  if (rate === undefined) return null;
  return amount * rate * (1 + FX_MARGIN_PCT / 100);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Per-line buy price (selected vendor's cost, converted to USD), sell price
// (customer unit price), and margin. Lines with no selected vendor, or a
// vendor quoted in a currency we don't have a rate for, are left out —
// callers should treat a missing entry as "no margin to show yet".
//
// quoteLineItems: rows from QUOTE_LINE_ITEMS_QUERY (rfq_line_item_id, quantity, unit_price_usd, ...)
// sourcingRows: rows from getLineItemSourcing (rfq_line_item_id, unit_price, currency, lead_time_days, received_date, estimated_transit_days)
// rates: rows from getCurrencyRates
function buildLineItemMargins({ quoteLineItems, sourcingRows, rates }) {
  const rateMap = ratesByCode(rates);
  const sourcingByLineItemId = new Map(sourcingRows.map((r) => [r.rfq_line_item_id, r]));
  const marginsByLineItemId = new Map();

  quoteLineItems.forEach((qli) => {
    const sourcing = sourcingByLineItemId.get(qli.rfq_line_item_id);
    if (!sourcing) return;

    const buyUnitPriceUsd = toUsd(sourcing.unit_price, sourcing.currency, rateMap);
    if (buyUnitPriceUsd === null) return;

    const sellUnitPriceUsd = qli.unit_price_usd;
    const marginUnitUsd = sellUnitPriceUsd - buyUnitPriceUsd;
    const marginPct = sellUnitPriceUsd > 0 ? (marginUnitUsd / sellUnitPriceUsd) * 100 : null;

    marginsByLineItemId.set(qli.rfq_line_item_id, {
      quantity: qli.quantity,
      buyUnitPriceUsd,
      sellUnitPriceUsd,
      marginUnitUsd,
      marginPct,
      sourcing,
    });
  });

  return marginsByLineItemId;
}

function buildOrderSummary({ quoteLineItems, sourcingRows, rates }) {
  const margins = buildLineItemMargins({ quoteLineItems, sourcingRows, rates });

  let totalOrderValueUsd = 0;
  let totalCostUsd = 0;
  let estimatedArrivalDate = null;

  quoteLineItems.forEach((qli) => {
    totalOrderValueUsd += qli.unit_price_usd * qli.quantity;

    const margin = margins.get(qli.rfq_line_item_id);
    if (!margin) return;

    totalCostUsd += margin.buyUnitPriceUsd * qli.quantity;

    const fcaReadyDate = addDays(margin.sourcing.received_date, margin.sourcing.lead_time_days);
    const arrivalDate = addDays(fcaReadyDate, margin.sourcing.estimated_transit_days);
    if (!estimatedArrivalDate || arrivalDate > estimatedArrivalDate) {
      estimatedArrivalDate = arrivalDate;
    }
  });

  const grossProfitUsd = totalOrderValueUsd - totalCostUsd;
  const grossProfitPct = totalOrderValueUsd > 0 ? (grossProfitUsd / totalOrderValueUsd) * 100 : null;

  return {
    totalOrderValueUsd,
    totalCostUsd,
    grossProfitUsd,
    grossProfitPct,
    estimatedArrivalDate,
  };
}

module.exports = { buildOrderSummary, buildLineItemMargins, toUsd, addDays, FX_MARGIN_PCT };
