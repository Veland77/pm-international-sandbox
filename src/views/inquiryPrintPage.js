// src/views/inquiryPrintPage.js
// Print-friendly Sourcing Inquiry document — no app chrome or navigation,
// designed to be saved as PDF via the browser's print dialog and attached
// to an email manually. Nothing customer-identifying appears anywhere: no
// account name, no contact name, no customer PO reference. Job No IS
// shown — it's PM's own end-to-end deal reference, not customer identity
// (see schema.js's rfqs comment). The sandbox
// banner stays visible (including when printed) per house rules — it's
// non-negotiable, even on a page that otherwise strips all chrome. Kept
// standalone (own inline styles, not linking styles.css) so it stays
// self-contained and reliable to print/PDF regardless of network state.

const { escapeHtml, formatDate } = require("./htmlHelpers");

function lineItemRows(lineItems) {
  return lineItems
    .map(
      (li) => `
    <tr>
      <td>${escapeHtml(li.material_name)}</td>
      <td>${escapeHtml(li.product_form_name)}</td>
      <td>${escapeHtml(li.standard_code || "—")}</td>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity_requested)}</td>
      <td>${escapeHtml(li.unit)}</td>
    </tr>`
    )
    .join("");
}

function attachmentsList(attachments) {
  if (!attachments.length) {
    return "<p>No attachments.</p>";
  }
  const items = attachments.map((a) => `<li>${escapeHtml(a.original_filename)}</li>`).join("");
  return `<p>Attach the following files manually when sending this inquiry:</p><ul>${items}</ul>`;
}

function inquiryPrintPage({ inquiry, lineItems, attachments, responseRequestedBy }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(inquiry.inquiry_number)} — Sourcing Inquiry</title>
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
    <h1>PM International Suppliers, LLC — Sourcing Inquiry</h1>
    <div class="meta">
      <p><strong>Job No:</strong> ${escapeHtml(inquiry.job_number)}</p>
      <p><strong>Inquiry #:</strong> ${escapeHtml(inquiry.inquiry_number)}</p>
      <p><strong>Date Issued:</strong> ${escapeHtml(formatDate(inquiry.sent_date))}</p>
      <p><strong>Response Requested By:</strong> ${escapeHtml(formatDate(responseRequestedBy))}</p>
    </div>
  </header>

  <h2>Line Items</h2>
  <table>
    <thead>
      <tr><th>Material</th><th>Product Form</th><th>Standard</th><th>Description</th><th>Quantity</th><th>Unit</th></tr>
    </thead>
    <tbody>${lineItemRows(lineItems)}</tbody>
  </table>

  <h2>Terms</h2>
  <p>Please quote pricing FCA (Free Carrier — ready for pickup at your facility). PM International arranges its own freight forwarder for transport from your location.</p>

  <h2>Please Quote</h2>
  <ul>
    <li>Unit price and currency</li>
    <li>Lead time</li>
    <li>Availability — in stock or make to order</li>
    <li>Weight and dimensions (for freight planning)</li>
    <li>Crating cost</li>
  </ul>

  <h2>Attachments</h2>
  ${attachmentsList(attachments)}

  <h2>Contact</h2>
  <p>Please direct all questions and quote responses to: <strong>${escapeHtml(inquiry.sales_rep_name)}</strong></p>
</body>
</html>`;
}

module.exports = { inquiryPrintPage };
