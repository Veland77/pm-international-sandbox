// src/views/rfqDetail.js
// Renders a single RFQ's detail page: account/contact, line items, and linked quote if any.

const { layout } = require("./layout");
const { escapeHtml } = require("./htmlHelpers");

function lineItemRows(lineItems) {
  return lineItems
    .map(
      (li) => `
    <tr>
      <td>${escapeHtml(li.material_name)}</td>
      <td>${escapeHtml(li.product_form_name)}</td>
      <td>${escapeHtml(li.standard_code || "—")}</td>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity)}</td>
      <td>${escapeHtml(li.unit)}</td>
    </tr>`
    )
    .join("");
}

function quoteSection(quote, quoteLineItems) {
  if (!quote) {
    return "<h2>Quote</h2><p>No quote yet.</p>";
  }

  const quoteRows = quoteLineItems
    .map(
      (qli) => `
    <tr>
      <td>${escapeHtml(qli.description)}</td>
      <td>${escapeHtml(qli.quantity)}</td>
      <td>${escapeHtml(qli.unit)}</td>
      <td>$${escapeHtml(qli.unit_price_usd)}</td>
      <td>${escapeHtml(qli.lead_time_days)}</td>
      <td>${escapeHtml(qli.margin_pct)}%</td>
    </tr>`
    )
    .join("");

  return `
    <h2>Quote ${escapeHtml(quote.quote_number)} (v${escapeHtml(quote.version)})</h2>
    <p>Status: ${escapeHtml(quote.status)} &middot; Created: ${escapeHtml(quote.created_date)} &middot; Valid until: ${escapeHtml(quote.valid_until)}</p>
    <table>
      <thead>
        <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price (USD)</th><th>Lead Time (days)</th><th>Margin %</th></tr>
      </thead>
      <tbody>${quoteRows}</tbody>
    </table>`;
}

function rfqDetailPage({ rfq, lineItems, quote, quoteLineItems }) {
  const body = `
    <a class="back-link" href="/rfqs">&larr; All RFQs</a>
    <h1>${escapeHtml(rfq.rfq_number)} — ${escapeHtml(rfq.project_name)}</h1>
    <p>Status: ${escapeHtml(rfq.status)} &middot; Created: ${escapeHtml(rfq.created_date)} &middot; Due: ${escapeHtml(rfq.due_date)}</p>

    <h2>Account</h2>
    <p>
      ${escapeHtml(rfq.account_name)} (${escapeHtml(rfq.industry_segment)}, ${escapeHtml(rfq.account_region)}) &mdash; ${escapeHtml(rfq.account_status)}<br>
      Sales Rep: ${escapeHtml(rfq.sales_rep_name)}
    </p>

    <h2>Contact</h2>
    <p>
      ${escapeHtml(rfq.contact_name)}, ${escapeHtml(rfq.contact_title)}<br>
      ${escapeHtml(rfq.contact_email)} &middot; ${escapeHtml(rfq.contact_phone)}
    </p>

    <h2>Line Items</h2>
    <table>
      <thead>
        <tr><th>Material</th><th>Product Form</th><th>Standard</th><th>Description</th><th>Qty</th><th>Unit</th></tr>
      </thead>
      <tbody>${lineItemRows(lineItems)}</tbody>
    </table>

    ${quoteSection(quote, quoteLineItems)}
  `;

  return layout({ title: rfq.rfq_number, bodyHtml: body });
}

module.exports = { rfqDetailPage };
