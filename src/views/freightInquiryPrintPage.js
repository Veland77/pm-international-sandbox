// src/views/freightInquiryPrintPage.js
// Print-friendly Freight Quote Request document — no app chrome or
// navigation, designed to be saved as PDF and sent to a freight forwarder.
// Nothing customer-identifying appears anywhere: no account name, no
// contact name, no customer PO reference, and the destination is a
// generic placeholder rather than a real customer-facing location — same
// reasoning as inquiryPrintPage.js's exclusions. Job No IS shown — it's
// PM's own end-to-end deal reference, not customer identity. A real
// forwarder would need at least a destination country/region to price
// accurately; the placeholder below is a known simplification, flagged
// for later, not a gap to silently work around.

const { escapeHtml, formatDate, formatNumber } = require("./htmlHelpers");

function lineItemRows(lineItems) {
  return lineItems
    .map(
      (li) => `
    <tr>
      <td>${escapeHtml(li.material_name)}</td>
      <td>${escapeHtml(li.product_form_name)}</td>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity)}</td>
      <td>${escapeHtml(li.unit)}</td>
      <td>${escapeHtml(li.weight_kg)} kg</td>
      <td>${escapeHtml(li.dimensions)}</td>
      <td>${escapeHtml(li.supplier_name)}, ${escapeHtml(li.supplier_country)}</td>
    </tr>`
    )
    .join("");
}

function freightInquiryPrintPage({ inquiry, lineItems, totalWeightKg, requestedShipByDate }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(inquiry.frq_number)} — Freight Quote Request</title>
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
    <h1>PM International Suppliers, LLC — Freight Quote Request</h1>
    <div class="meta">
      <p><strong>Job No:</strong> ${escapeHtml(inquiry.job_number)}</p>
      <p><strong>FRQ #:</strong> ${escapeHtml(inquiry.frq_number)}</p>
      <p><strong>Date Issued:</strong> ${escapeHtml(formatDate(inquiry.sent_date))}</p>
      <p><strong>Requested Ready-to-Ship Date:</strong> ${escapeHtml(formatDate(requestedShipByDate))}</p>
      <p><strong>Attn:</strong> ${escapeHtml(inquiry.freight_forwarder_name)}</p>
    </div>
  </header>

  <h2>Shipment</h2>
  <p>
    <strong>Destination:</strong> PM International receiving facility (exact address provided upon booking)<br>
    <strong>Total Weight:</strong> ${escapeHtml(formatNumber(totalWeightKg, 1))} kg
  </p>

  <h2>Line Items</h2>
  <table>
    <thead>
      <tr><th>Material</th><th>Product Form</th><th>Description</th><th>Qty</th><th>Unit</th><th>Weight</th><th>Dimensions</th><th>Pickup Location</th></tr>
    </thead>
    <tbody>${lineItemRows(lineItems)}</tbody>
  </table>

  <h2>Please Quote</h2>
  <ul>
    <li>All-in freight price and currency</li>
    <li>Transit time (days)</li>
    <li>Quote validity period</li>
  </ul>

  <h2>Contact</h2>
  <p>Please direct all questions and quote responses to: <strong>${escapeHtml(inquiry.sales_rep_name)}</strong></p>
</body>
</html>`;
}

module.exports = { freightInquiryPrintPage };
