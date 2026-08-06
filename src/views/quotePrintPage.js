// src/views/quotePrintPage.js
// Print-friendly customer-facing Quote document — no app chrome or
// navigation, designed to be saved as PDF and emailed to the customer as
// an attachment. Only customer-appropriate fields appear: Description,
// Qty, Unit, Sell Price, Total Sell Price, and the quote's total — never
// Buy Price or Margin. That's enforced upstream in quoteIntake.js's print
// route, which builds this page only from quotePrintQueries.js's narrowly
// scoped queries (no join path to buy price at all); this view has no
// buy/margin field available to render even by mistake. Freight always
// shows as its own line here regardless of which freight view happens to
// be toggled on the live RFQ page — see quoteIntake.js for why. Kept
// standalone (own inline styles, not linking styles.css), same as
// inquiryPrintPage.js/freightInquiryPrintPage.js, so it stays
// self-contained and reliable to print/PDF regardless of network state.

const { escapeHtml, formatDate, formatCurrency, formatNumber } = require("./htmlHelpers");

// Mirrors rfqDetail.js's formatShipmentSize, but this page is a formal
// document rather than a live dashboard, so the nothing-sourced-yet
// fallback reads as a sentence instead of a bare "—".
function formatShipmentSize(estimate) {
  if (!estimate) return "Not yet available — no line items sourced.";

  let text = `${formatNumber(estimate.totalWeightKg, 1)} kg`;
  if (estimate.dimensionsText) {
    text += ` — box/pallet size: ${estimate.dimensionsText}`;
  }
  if (estimate.sourcedCount < estimate.totalCount) {
    const missing = estimate.totalCount - estimate.sourcedCount;
    text += ` (${estimate.sourcedCount} of ${estimate.totalCount} line items — ${missing} not yet sourced)`;
  }
  return text;
}

function lineRow(li) {
  return `
    <tr>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity)}</td>
      <td>${escapeHtml(li.unit)}</td>
      <td>${escapeHtml(formatCurrency(li.sell_unit_price_usd))}</td>
      <td>${escapeHtml(formatCurrency(li.totalSellUsd))}</td>
    </tr>`;
}

function quotePrintPage({ quote, lineItems, freightLine, grandTotalUsd, shipmentSizeEstimate }) {
  const rows = lineItems.map(lineRow).join("") + (freightLine ? lineRow(freightLine) : "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(quote.quote_number)} — Quote</title>
  <style>
    :root {
      --color-olive: #3c4022;
      --color-gold: #a99a5b;
      --color-border: #d8d2bd;
    }
    body { font-family: Cambria, Georgia, "Times New Roman", serif; margin: 2rem; color: #2a2a20; max-width: 800px; }
    .banner { background: #b00020; color: #fff; padding: 0.5rem 1rem; font-weight: bold; margin-bottom: 1.5rem; font-family: system-ui, sans-serif; }
    .no-print { font-family: system-ui, sans-serif; }
    .no-print button { background: var(--color-olive); color: #fff; border: none; padding: 0.5rem 1.1rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
    header { border-bottom: 3px solid var(--color-gold); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    header h1 { margin: 0 0 0.25rem 0; font-size: 1.4rem; color: var(--color-olive); }
    .meta p { margin: 0.15rem 0; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid var(--color-border); padding: 0.4rem 0.6rem; text-align: left; font-size: 0.95rem; }
    th { background: #f0ede1; color: var(--color-olive); }
    h2 { font-size: 1.1rem; color: var(--color-olive); border-bottom: 1px solid var(--color-border); padding-bottom: 0.25rem; margin-top: 2rem; }
    .total-row td { font-weight: 700; background: #f7f4ec; }
    @media print {
      .no-print { display: none; }
      body { margin: 0.5in; }
    }
  </style>
</head>
<body>
  <div class="banner">SANDBOX — TEST DATA</div>
  <p class="no-print"><button onclick="window.print()">Print / Save as PDF</button></p>

  <header>
    <h1>PM International Suppliers, LLC — Quote</h1>
    <div class="meta">
      <p><strong>Quote #:</strong> ${escapeHtml(quote.quote_number)}</p>
      <p><strong>Job No:</strong> ${escapeHtml(quote.job_number)} — ${escapeHtml(quote.project_name)}</p>
      <p><strong>Date Issued:</strong> ${escapeHtml(formatDate(quote.created_date))}</p>
      <p><strong>Valid Until:</strong> ${escapeHtml(formatDate(quote.valid_until))}</p>
      ${quote.promised_delivery_date ? `<p><strong>Promised Delivery:</strong> ${escapeHtml(formatDate(quote.promised_delivery_date))}</p>` : ""}
      <p><strong>Attn:</strong> ${escapeHtml(quote.contact_name)}, ${escapeHtml(quote.account_name)}</p>
    </div>
  </header>

  <h2>Line Items</h2>
  <table>
    <thead>
      <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Sell Price</th><th>Total Sell Price</th></tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="4">Total</td>
        <td>${escapeHtml(formatCurrency(grandTotalUsd))}</td>
      </tr>
    </tbody>
  </table>

  <h2>Estimated Shipment Size</h2>
  <p>${escapeHtml(formatShipmentSize(shipmentSizeEstimate))}</p>
  <p style="font-size: 0.85rem; color: #6b6a5c;">Preliminary, based on vendor quotes — not a final packed measurement.</p>

  <h2>Contact</h2>
  <p>Please direct all questions to: <strong>${escapeHtml(quote.sales_rep_name)}</strong></p>
</body>
</html>`;
}

module.exports = { quotePrintPage };
