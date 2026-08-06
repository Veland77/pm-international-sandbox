// src/db/orderSummary.js
// Currency conversion and delivery-date estimation helpers shared across
// the app. Margin/cost calculations (buy price, freight, sell price,
// margin) live in marginCalc.js — this file used to also compute a
// freight-exclusive margin (buildLineItemMargins/buildOrderSummary),
// removed once the RFQ page moved to one shared margin calculation
// everywhere instead of two different numbers for the same line item.

// A currency-conversion spread applied only when converting a vendor's
// foreign-currency cost to USD — reflects the real cost of actually
// converting money, not just the raw market rate. Never applied to USD.
const FX_MARGIN_PCT = 0.5;

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

// Latest estimated arrival across every sourced line — the order isn't
// complete until the last item lands.
// allLineItems: rows from getRfqLineItemsWithSourcing (received_date/
// estimated_transit_days/lead_time_days come from the selected vendor's
// own quote; null for a line with no selected vendor yet).
function estimateArrivalDate(allLineItems) {
  let estimatedArrivalDate = null;

  allLineItems.forEach((li) => {
    if (li.supplier_id == null || !li.received_date) return;
    const fcaReadyDate = addDays(li.received_date, li.lead_time_days);
    const arrivalDate = addDays(fcaReadyDate, li.estimated_transit_days);
    if (!estimatedArrivalDate || arrivalDate > estimatedArrivalDate) {
      estimatedArrivalDate = arrivalDate;
    }
  });

  return estimatedArrivalDate;
}

module.exports = { toUsd, addDays, estimateArrivalDate, FX_MARGIN_PCT };
