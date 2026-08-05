// src/views/supplierInquiryDetail.js
// Renders a single Sourcing Inquiry's detail page: what was requested,
// the vendor's quote (if any), and its attachments. Deliberately excludes
// customer sell price/margin — this page is safe to have open while
// corresponding with the vendor.

const { layout } = require("./layout");
const { escapeHtml, formatDate, formatCurrency } = require("./htmlHelpers");
const { inquiryAttachmentBlock } = require("./supplierInquiryAttachmentsSection");

function requestedLineItemRows(lineItems) {
  return lineItems
    .map((li) => {
      const oversized = li.length_m != null && li.length_m > 6;
      const lengthText = li.length_m == null ? "—" : `${li.length_m} m`;
      return `
    <tr>
      <td>${escapeHtml(li.material_name)}</td>
      <td>${escapeHtml(li.product_form_name)}</td>
      <td>${escapeHtml(li.standard_code || "—")}</td>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity_requested)}</td>
      <td>${escapeHtml(li.unit)}</td>
      <td>${escapeHtml(lengthText)}${oversized ? " ⚠ Oversized — air freight constrained" : ""}</td>
    </tr>`;
    })
    .join("");
}

function quoteSection(quote, quoteLineItems) {
  if (!quote) {
    return '<div class="card"><h2>Quote</h2><p>No quote received yet.</p></div>';
  }

  const rows = quoteLineItems
    .map(
      (qli) => `
    <tr>
      <td>${escapeHtml(qli.description)}</td>
      <td>${escapeHtml(formatCurrency(qli.unit_price, ""))} ${escapeHtml(qli.currency)}</td>
      <td>${escapeHtml(qli.weight_kg)} kg / ${escapeHtml(qli.dimensions)}</td>
      <td>${escapeHtml(formatCurrency(qli.crating_cost, ""))} ${escapeHtml(qli.currency)}</td>
      <td>${escapeHtml(qli.lead_time_days)}</td>
      <td>${qli.is_selected ? "Selected" : "—"}</td>
    </tr>`
    )
    .join("");

  return `
    <div class="card">
      <h2>Quote ${escapeHtml(quote.quote_ref)}</h2>
      <p>
        Received: ${escapeHtml(formatDate(quote.received_date))} &middot; Availability: ${escapeHtml(quote.availability)} &middot;
        Lead Time: ${escapeHtml(quote.lead_time_days)} days &middot; Transit: ${escapeHtml(quote.estimated_transit_days)} days &middot;
        Valid Until: ${escapeHtml(formatDate(quote.valid_until))}
      </p>
      <table>
        <thead>
          <tr><th>Line Item</th><th>Unit Price</th><th>Weight / Dimensions</th><th>Crating Cost</th><th>Lead Time (days)</th><th>Status</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function supplierInquiryDetailPage({ inquiry, lineItems, quote, quoteLineItems, attachments }) {
  const body = `
    <a class="back-link" href="/rfqs/${inquiry.rfq_id}">&larr; Back to ${escapeHtml(inquiry.rfq_number)}</a>
    <h1>${escapeHtml(inquiry.inquiry_number)} — ${escapeHtml(inquiry.supplier_name)}</h1>
    <p>Status: ${escapeHtml(inquiry.outreach_status)} &middot; Sent: ${escapeHtml(formatDate(inquiry.sent_date))}</p>

    <div class="card">
      <h2>Supplier</h2>
      <p>
        ${escapeHtml(inquiry.supplier_name)} (${escapeHtml(inquiry.supplier_country)}, ${escapeHtml(inquiry.supplier_region)})<br>
        Specialty: ${escapeHtml(inquiry.supplier_specialty)}
      </p>
    </div>

    <div class="card">
      <h2>Requested Line Items</h2>
      <table>
        <thead>
          <tr><th>Material</th><th>Product Form</th><th>Standard</th><th>Description</th><th>Qty Requested</th><th>Unit</th><th>Length</th></tr>
        </thead>
        <tbody>${requestedLineItemRows(lineItems)}</tbody>
      </table>
    </div>

    ${quoteSection(quote, quoteLineItems)}

    <div class="card">
      <h2>Supplier-Facing Attachments</h2>
      <p class="text-positive">Confirmed clean of customer identity</p>
      ${inquiryAttachmentBlock(inquiry, attachments)}
    </div>
  `;

  return layout({ title: inquiry.inquiry_number, bodyHtml: body });
}

module.exports = { supplierInquiryDetailPage };
