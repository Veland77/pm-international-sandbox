// src/views/inquiryNewForm.js
// Form for creating a new Sourcing Inquiry from an RFQ: pick a vendor,
// checkbox-select which line items to include. A line item can be
// selected even if it's already on another inquiry — the same item
// commonly gets sent to multiple vendors for comparison.

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
      const checked = selectedIds.includes(li.id) ? " checked" : "";
      return `
    <tr>
      <td><input type="checkbox" name="line_item_ids" value="${li.id}"${checked}></td>
      <td>${escapeHtml(li.material_name)}</td>
      <td>${escapeHtml(li.product_form_name)}</td>
      <td>${escapeHtml(li.standard_code || "—")}</td>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity)}</td>
      <td>${escapeHtml(li.unit)}</td>
    </tr>`;
    })
    .join("");
}

function inquiryNewFormPage({ rfq, lineItems, suppliers, formValues = {}, errors = [] }) {
  const selectedIds = (formValues.line_item_ids || []).map(Number);
  const selectedSupplierId = formValues.supplier_id;

  const supplierOptions = suppliers
    .map((s) => {
      const selected = String(selectedSupplierId) === String(s.id) ? " selected" : "";
      return `<option value="${s.id}"${selected}>${escapeHtml(s.name)} (${escapeHtml(s.country)})</option>`;
    })
    .join("");

  const body = `
    <a class="back-link" href="/rfqs/${rfq.id}">&larr; Back to ${escapeHtml(rfq.rfq_number)}</a>
    <h1>New Sourcing Inquiry — ${escapeHtml(rfq.rfq_number)}</h1>
    ${errorList(errors)}
    <form method="POST" action="/rfqs/${rfq.id}/inquiries">
      <div class="card">
        <h2>Vendor</h2>
        <label class="field">
          <span class="field-label">Vendor</span>
          <select name="supplier_id" required>
            <option value="">Select vendor</option>
            ${supplierOptions}
          </select>
        </label>
      </div>

      <div class="card">
        <h2>Line Items to Include</h2>
        <table>
          <thead>
            <tr><th></th><th>Material</th><th>Product Form</th><th>Standard</th><th>Description</th><th>Qty</th><th>Unit</th></tr>
          </thead>
          <tbody>${lineItemCheckboxRows(lineItems, selectedIds)}</tbody>
        </table>
        <p style="color: var(--color-text-muted);">A line item can be selected even if it's already on another inquiry — the same item is often sent to multiple vendors for comparison.</p>
      </div>

      <p><button type="submit" class="btn btn-primary">Create Sourcing Inquiry</button></p>
    </form>
  `;

  return layout({ title: `New Inquiry — ${rfq.rfq_number}`, bodyHtml: body });
}

module.exports = { inquiryNewFormPage };
