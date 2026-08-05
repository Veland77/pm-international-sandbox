// src/views/freightInquiryNewForm.js
// Form for creating a new Freight Inquiry ("FRQ") from an RFQ: pick a
// forwarder, checkbox-select which already-sourced line items need a
// quote.

const { layout } = require("./layout");
const { escapeHtml } = require("./htmlHelpers");

function errorList(errors) {
  if (!errors.length) return "";
  const items = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  return `<div class="form-errors"><strong>Please fix the following:</strong><ul>${items}</ul></div>`;
}

function lineItemCheckboxRows(lineItems, selectedIds) {
  return lineItems
    .map((li) => {
      const checked = selectedIds.includes(li.rfq_line_item_id) ? " checked" : "";
      return `
    <tr>
      <td><input type="checkbox" name="line_item_ids" value="${li.rfq_line_item_id}"${checked}></td>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity)}</td>
      <td>${escapeHtml(li.unit)}</td>
      <td>${escapeHtml(li.supplier_name)} (${escapeHtml(li.supplier_country)})</td>
    </tr>`;
    })
    .join("");
}

function freightInquiryNewFormPage({ rfq, sourcedLineItems, formValues = {}, errors = [] }) {
  const selectedIds = (formValues.line_item_ids || []).map(Number);

  const body = `
    <a class="back-link" href="/rfqs/${rfq.id}">&larr; Back to ${escapeHtml(rfq.rfq_number)}</a>
    <h1>New Freight Inquiry — ${escapeHtml(rfq.rfq_number)}</h1>
    ${errorList(errors)}
    <form method="POST" action="/rfqs/${rfq.id}/freight-inquiries">
      <div class="card">
        <h2>Freight Forwarder</h2>
        <label class="field">
          <span class="field-label">Forwarder Name</span>
          <input type="text" name="freight_forwarder_name" value="${escapeHtml(formValues.freight_forwarder_name || "")}" required>
        </label>
      </div>

      <div class="card">
        <h2>Line Items to Include</h2>
        <table>
          <thead>
            <tr><th></th><th>Description</th><th>Qty</th><th>Unit</th><th>Pickup Vendor</th></tr>
          </thead>
          <tbody>${lineItemCheckboxRows(sourcedLineItems, selectedIds)}</tbody>
        </table>
        <p style="color: var(--color-text-muted);">Only line items with a selected vendor are shown — weight, dimensions, and ready date all come from that vendor's quote.</p>
      </div>

      <p><button type="submit" class="btn btn-primary">Send Freight Inquiry</button></p>
    </form>
  `;

  return layout({ title: `New Freight Inquiry — ${rfq.rfq_number}`, bodyHtml: body });
}

module.exports = { freightInquiryNewFormPage };
