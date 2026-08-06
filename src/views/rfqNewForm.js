// src/views/rfqNewForm.js
// Renders the New RFQ form: existing/new account+contact, sales rep,
// project details, and a repeatable line-items table. On validation
// failure, the route re-renders this with whatever was already entered
// plus an error list, so a failed submit never loses the user's work.

const { layout } = require("./layout");
const { escapeHtml } = require("./htmlHelpers");

function buildOptions(items, valueKey, labelFn, blankLabel, selectedValue) {
  const blank = `<option value="">${escapeHtml(blankLabel)}</option>`;
  const rest = items
    .map((item) => {
      const value = item[valueKey];
      const selected = String(selectedValue) === String(value) ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(labelFn(item))}</option>`;
    })
    .join("");
  return blank + rest;
}

function errorList(errors) {
  if (!errors.length) return "";
  const items = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  return `<div class="form-errors"><strong>Please fix the following:</strong><ul>${items}</ul></div>`;
}

function dateField(labelText, name, value) {
  return `
    <label class="field">
      <span class="field-label">${escapeHtml(labelText)}</span>
      <input type="date" name="${name}" value="${escapeHtml(value || "")}" required>
    </label>`;
}

function lineItemRowHtml(index, li, materials, productForms, standards) {
  return `
    <tr class="line-item-row">
      <td><select name="line_items[${index}][material_id]" required>${buildOptions(materials, "id", (m) => m.name, "Select material", li.materialId)}</select></td>
      <td><select name="line_items[${index}][product_form_id]" required>${buildOptions(productForms, "id", (f) => f.name, "Select product form", li.productFormId)}</select></td>
      <td><select name="line_items[${index}][standard_id]">${buildOptions(standards, "id", (s) => s.code, "(none)", li.standardId)}</select></td>
      <td><textarea class="auto-grow" name="line_items[${index}][description]" required>${escapeHtml(li.description || "")}</textarea></td>
      <td><input type="number" name="line_items[${index}][quantity]" value="${escapeHtml(li.quantity || "")}" min="1" required></td>
      <td><input type="text" name="line_items[${index}][unit]" value="${escapeHtml(li.unit || "")}" required></td>
      <td><input type="number" step="0.1" name="line_items[${index}][length_m]" value="${escapeHtml(li.lengthM || "")}"></td>
      <td><button type="button" class="btn btn-secondary remove-line-item">Remove</button></td>
    </tr>`;
}

function rfqNewFormPage({ accounts, contacts, users, materials, productForms, standards, formValues = {}, errors = [] }) {
  const accountMode = formValues.account_mode === "new" ? "new" : "existing";
  const lineItems = formValues.lineItems && formValues.lineItems.length ? formValues.lineItems : [{}];

  const clientOptions = JSON.stringify({ contacts, materials, productForms, standards }).replace(/</g, "\\u003c");

  const body = `
    <a class="back-link" href="/rfqs">&larr; All RFQs</a>
    <h1>New RFQ</h1>
    ${errorList(errors)}
    <form method="POST" action="/rfqs" id="rfq-form">
      <div class="card">
        <h2>Account</h2>
        <label><input type="radio" name="account_mode" value="existing" ${accountMode === "existing" ? "checked" : ""}> Existing account</label>
        <label><input type="radio" name="account_mode" value="new" ${accountMode === "new" ? "checked" : ""}> New account</label>

        <div id="existing-account-fields" style="${accountMode === "new" ? "display:none;" : ""}">
          <label class="field">
            <span class="field-label">Account</span>
            <select name="account_id" id="account_id">${buildOptions(accounts, "id", (a) => a.name, "Select account", formValues.account_id)}</select>
          </label>
          <label class="field">
            <span class="field-label">Contact</span>
            <select name="contact_id" id="contact_id"><option value="">Select contact</option></select>
          </label>
        </div>

        <div id="new-account-fields" style="${accountMode === "existing" ? "display:none;" : ""}">
          <label class="field">
            <span class="field-label">Account name</span>
            <input type="text" name="new_account_name" value="${escapeHtml(formValues.new_account_name || "")}">
          </label>
          <label class="field">
            <span class="field-label">Industry segment</span>
            <select name="new_account_industry_segment">
              ${["Offshore", "Marine", "Mining", "Oil & Gas"]
                .map((s) => `<option value="${s}"${formValues.new_account_industry_segment === s ? " selected" : ""}>${s}</option>`)
                .join("")}
            </select>
          </label>
          <label class="field">
            <span class="field-label">Region</span>
            <input type="text" name="new_account_region" value="${escapeHtml(formValues.new_account_region || "")}">
          </label>
          <label class="field">
            <span class="field-label">Account status</span>
            <select name="new_account_status">
              ${["Active", "Prospect", "Inactive"]
                .map((s) => `<option value="${s}"${(formValues.new_account_status || "Active") === s ? " selected" : ""}>${s}</option>`)
                .join("")}
            </select>
          </label>

          <h3>New Contact</h3>
          <label class="field"><span class="field-label">Name</span><input type="text" name="new_contact_name" value="${escapeHtml(formValues.new_contact_name || "")}"></label>
          <label class="field"><span class="field-label">Title</span><input type="text" name="new_contact_title" value="${escapeHtml(formValues.new_contact_title || "")}"></label>
          <label class="field"><span class="field-label">Email</span><input type="email" name="new_contact_email" value="${escapeHtml(formValues.new_contact_email || "")}"></label>
          <label class="field"><span class="field-label">Phone</span><input type="text" name="new_contact_phone" value="${escapeHtml(formValues.new_contact_phone || "")}"></label>
        </div>
      </div>

      <div class="card">
        <h2>Deal Details</h2>
        <label class="field">
          <span class="field-label">Sales Rep</span>
          <select name="sales_rep_id">${buildOptions(users, "id", (u) => `${u.name} (${u.role})`, "Select sales rep", formValues.sales_rep_id)}</select>
        </label>
        <label class="field">
          <span class="field-label">Project Name</span>
          <input type="text" name="project_name" value="${escapeHtml(formValues.project_name || "")}" required>
        </label>
        ${dateField("Due Date (quote owed back)", "due_date", formValues.due_date)}
        ${dateField("Customer Requested Delivery Date", "customer_requested_delivery_date", formValues.customer_requested_delivery_date)}
      </div>

      <div class="card">
        <h2>Line Items</h2>
        <table id="line-items-table">
          <thead>
            <tr><th>Material</th><th>Product Form</th><th>Standard</th><th>Description</th><th>Qty</th><th>Unit</th><th>Length (m)</th><th></th></tr>
          </thead>
          <tbody id="line-items-body">
            ${lineItems.map((li, i) => lineItemRowHtml(i, li, materials, productForms, standards)).join("")}
          </tbody>
        </table>
        <p><button type="button" class="btn btn-secondary" id="add-line-item">+ Add Line Item</button></p>
      </div>

      <p><button type="submit" class="btn btn-primary">Create RFQ</button></p>
    </form>

    <script>window.__RFQ_FORM_OPTIONS__ = ${clientOptions};</script>
    <script src="/rfqIntake.js"></script>
  `;

  return layout({ title: "New RFQ", bodyHtml: body });
}

module.exports = { rfqNewFormPage };
