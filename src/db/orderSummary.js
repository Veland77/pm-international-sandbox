// src/db/orderSummary.js
// Computes the RFQ detail page's summary block (order value, gross profit,
// delivery dates) from already-fetched rows. Pure logic, no database
// access, so it's testable on its own.
//
// FIXED_DEMO_USD_RATES are made-up conversion rates for this sandbox only —
// not live or real exchange rates, and not fit for any real financial use.
// They exist so the demo can show a real-looking Gross Profit number even
// though vendor quotes come in EUR/CNY and customer prices are in USD.
const FIXED_DEMO_USD_RATES = { USD: 1, EUR: 1.08, CNY: 0.14 };

function toUsd(amount, currency) {
  const rate = FIXED_DEMO_USD_RATES[currency];
  return rate === undefined ? null : amount * rate;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// quoteLineItems: rows from QUOTE_LINE_ITEMS_QUERY (rfq_line_item_id, quantity, unit_price_usd, ...)
// sourcingRows: rows from getLineItemSourcing (rfq_line_item_id, unit_price, currency, lead_time_days, received_date, estimated_transit_days)
function buildOrderSummary({ quoteLineItems, sourcingRows }) {
  const sourcingByLineItemId = new Map(sourcingRows.map((r) => [r.rfq_line_item_id, r]));

  let totalOrderValueUsd = 0;
  let totalCostUsd = 0;
  let estimatedArrivalDate = null;

  quoteLineItems.forEach((qli) => {
    totalOrderValueUsd += qli.unit_price_usd * qli.quantity;

    const sourcing = sourcingByLineItemId.get(qli.rfq_line_item_id);
    if (!sourcing) return;

    const unitCostUsd = toUsd(sourcing.unit_price, sourcing.currency);
    if (unitCostUsd !== null) {
      totalCostUsd += unitCostUsd * qli.quantity;
    }

    const fcaReadyDate = addDays(sourcing.received_date, sourcing.lead_time_days);
    const arrivalDate = addDays(fcaReadyDate, sourcing.estimated_transit_days);
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

module.exports = { buildOrderSummary, toUsd, addDays };
