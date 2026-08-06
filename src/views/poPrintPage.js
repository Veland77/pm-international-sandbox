// src/views/poPrintPage.js
// Print-friendly Purchase Order document — no app chrome or navigation,
// designed to be saved as PDF and sent to a vendor. Nothing
// customer-identifying appears anywhere: no account name, no contact
// name, no customer PO reference — the opposite confidentiality
// direction from quotePrintPage.js, same reasoning as
// inquiryPrintPage.js/freightInquiryPrintPage.js's exclusions. The
// destination is a generic placeholder, same known simplification
// freightInquiryPrintPage.js already uses. Kept standalone (own inline
// styles, not linking styles.css) so it stays self-contained and
// reliable to print/PDF regardless of network state.
//
// Only reachable after "Generate Purchase Order" has actually been
// clicked (see src/routes/orders.js) — issuedDate comes from that real,
// recorded action, not from when this page happens to be rendered/
// re-rendered (which could be any later time the vendor's contact needs
// another copy).

const { escapeHtml, formatDate, formatCurrency } = require("./htmlHelpers");

function lineItemRows(lineItems) {
  return lineItems
    .map(
      (li) => `
    <tr>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity)}</td>
      <td>${escapeHtml(li.unit)}</td>
      <td>${escapeHtml(formatCurrency(li.unit_price, ""))} ${escapeHtml(li.currency)}</td>
      <td>${escapeHtml(li.lead_time_days)}</td>
      <td>${escapeHtml(li.quote_ref)}</td>
    </tr>`
    )
    .join("");
}

function poPrintPage({ poNumber, orderDate, issuedDate, supplier, lineItems }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(poNumber)} — Purchase Order</title>
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
    <h1>PM International Suppliers, LLC — Purchase Order</h1>
    <div class="meta">
      <p><strong>PO #:</strong> ${escapeHtml(poNumber)}</p>
      <p><strong>Order Date:</strong> ${escapeHtml(formatDate(orderDate))}</p>
      <p><strong>Issued:</strong> ${escapeHtml(formatDate(issuedDate))}</p>
      <p><strong>Vendor:</strong> ${escapeHtml(supplier.supplier_name)}, ${escapeHtml(supplier.supplier_country)}</p>
    </div>
  </header>

  <h2>Ship To</h2>
  <p>PM International receiving facility (exact address provided upon booking)</p>

  <h2>Line Items</h2>
  <table>
    <thead>
      <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Lead Time (days)</th><th>Your Quote Ref</th></tr>
    </thead>
    <tbody>${lineItemRows(lineItems)}</tbody>
  </table>

  <p>Please reference PO ${escapeHtml(poNumber)} on your invoice, packing list, and all shipping documents.</p>
</body>
</html>`;
}

module.exports = { poPrintPage };
