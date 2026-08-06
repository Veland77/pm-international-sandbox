// src/views/freightInquiryNewForm.js
// Form for creating Freight Inquiries ("FRQ") from an RFQ: pick a
// forwarder, checkbox-select which already-sourced line items need a
// quote. Selecting line items from more than one vendor is allowed — that
// produces one freight inquiry per vendor's pickup location, never one
// combined request (see freightInquiryGrouping.js).

const { layout } = require("./layout");
const { escapeHtml } = require("./htmlHelpers");

function errorList(errors) {
  if (!errors.length) return "";
  const items = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  return `<div class="form-errors"><strong>Please fix the following:</strong><ul>${items}</ul></div>`;
}

function forwarderOptions(forwarders, selectedId) {
  return forwarders
    .map((f) => {
      const selected = String(selectedId) === String(f.id) ? " selected" : "";
      return `<option value="${f.id}"${selected}>${escapeHtml(f.name)} (${escapeHtml(f.country)})</option>`;
    })
    .join("");
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

function freightInquiryNewFormPage({ rfq, sourcedLineItems, forwarders, formValues = {}, errors = [] }) {
  const selectedIds = (formValues.line_item_ids || []).map(Number);

  const body = `
    <a class="back-link" href="/rfqs/${rfq.id}">&larr; Back to ${escapeHtml(rfq.job_number)}</a>
    <h1>New Freight Inquiry — ${escapeHtml(rfq.job_number)}</h1>
    ${errorList(errors)}
    <form method="POST" action="/rfqs/${rfq.id}/freight-inquiries">
      <div class="card">
        <h2>Freight Forwarder</h2>
        <label class="field">
          <span class="field-label">Forwarder</span>
          <select name="freight_forwarder_id" required>
            <option value="">Select forwarder</option>
            ${forwarderOptions(forwarders, formValues.freight_forwarder_id)}
          </select>
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
        <p style="color: var(--color-text-muted);">Only line items with a selected vendor are shown — weight, dimensions, and ready date all come from that vendor's quote. Selecting line items from more than one vendor creates one freight inquiry per vendor's pickup location, not one combined request.</p>
      </div>

      <p><button type="submit" class="btn btn-primary">Send Freight Inquiry</button></p>
    </form>
  `;

  return layout({ title: `New Freight Inquiry — ${rfq.job_number}`, bodyHtml: body });
}

module.exports = { freightInquiryNewFormPage };
