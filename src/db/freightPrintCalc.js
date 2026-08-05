// src/db/freightPrintCalc.js
// Pure calculations for the Freight Inquiry print view: total weight and
// the requested ready-to-ship date. No DB access, so this is directly
// unit-testable. Weight/dimensions/dates are never stored on
// freight_inquiry_line_items itself — they're always read from the
// selected vendor's supplier_quote_line_items row, passed in here already
// joined.

const { addDays } = require("./orderSummary");

// lineItems: [{ weight_kg, quantity, received_date, lead_time_days }]
function totalWeightKg(lineItems) {
  return lineItems.reduce((sum, li) => sum + li.weight_kg * li.quantity, 0);
}

// Mirrors orderSummary.js's "Estimated Vendor Arrival" FCA-ready-date step
// (received_date + lead_time_days), taking the latest across all covered
// lines — everything has to be ready before the forwarder can pick up.
function requestedShipByDate(lineItems) {
  let latest = null;
  lineItems.forEach((li) => {
    const readyDate = addDays(li.received_date, li.lead_time_days);
    if (!latest || readyDate > latest) latest = readyDate;
  });
  return latest;
}

module.exports = { totalWeightKg, requestedShipByDate };
