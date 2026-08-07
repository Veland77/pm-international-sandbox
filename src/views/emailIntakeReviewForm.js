// src/views/emailIntakeReviewForm.js
// AI Email Intake review/confirm screen. Structurally the same shape as
// the manual New RFQ form (src/views/rfqNewForm.js) — reusing that
// pattern deliberately rather than inventing a new one — decorated with
// match-status badges per field and a source-reference panel (the raw
// email text and/or screenshot, plus any attachments) so staff can check
// the AI's work against the original. Nothing is created until this form
// is submitted and validated; see src/routes/emailIntake.js.
//
// Two possible inputs feed the line-item rows: fresh from the AI
// extraction (submission.extracted.lineItems, on first load) or from a
// failed confirm submission (formValues.lineItems, already in "form row"
// shape — see parseConfirmLineItems in the route). normalizeLineItems
// below reconciles both into one shape so the row template only has to
// know about one.

const { layout } = require("./layout");
const { escapeHtml, formatDate } = require("./htmlHelpers");

function errorList(errors) {
  if (!errors.length) return "";
  const items = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  return `<div class="form-errors"><strong>Please fix the following:</strong><ul>${items}</ul></div>`;
}

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

// Fresh from the AI (submission.extracted.lineItems shape: material/
// productForm/standard are each { asWritten, matched, id }).
function normalizeFromExtraction(li) {
  return {
    description: li.description,
    quantity: li.quantity,
    unit: li.unit,
    lengthM: null,
    materialId: li.material.matched ? li.material.id : null,
    materialMatched: li.material.matched,
    materialAsWritten: li.material.asWritten,
    productFormId: li.productForm.matched ? li.productForm.id : null,
    productFormMatched: li.productForm.matched,
    productFormAsWritten: li.productForm.asWritten,
    standardId: li.standard.matched ? li.standard.id : null,
    standardMatched: li.standard.matched,
    standardAsWritten: li.standard.asWritten,
    missingInfo: li.missingInfo,
    rawText: li.rawText,
    skip: false,
  };
}

// From a failed confirm submission (see parseConfirmLineItems in
// emailIntake.js) — same shape, different field names.
function normalizeFromFormValues(li) {
  return {
    description: li.description,
    quantity: li.quantity,
    unit: li.unit,
    lengthM: li.lengthM,
    materialId: li.materialId,
    materialMatched: li.materialOriginallyMatched,
    materialAsWritten: li.materialAsWritten,
    productFormId: li.productFormId,
    productFormMatched: li.productFormOriginallyMatched,
    productFormAsWritten: li.productFormAsWritten,
    standardId: li.standardId,
    standardMatched: li.standardOriginallyMatched,
    standardAsWritten: li.standardAsWritten,
    missingInfo: !li.quantity ? ["quantity"] : [],
    rawText: li.rawText,
    skip: li.skip,
  };
}

function matchBadge(matched, asWritten) {
  if (matched) return "";
  if (!asWritten) return "";
  return `<div class="text-negative" style="font-size: 0.85rem;">Unrecognized: "${escapeHtml(asWritten)}" — not in catalog</div>`;
}

function lineItemRowHtml(index, li, materials, productForms, standards) {
  const isUnrecognized = !li.materialMatched || !li.productFormMatched;
  const missingQty = li.missingInfo && li.missingInfo.includes("quantity");

  return `
    <tr class="email-intake-line-row${li.skip ? " email-intake-line-skipped" : ""}">
      <td>
        <select name="line_items[${index}][material_id]">${buildOptions(materials, "id", (m) => m.name, "Select material", li.materialId)}</select>
        ${matchBadge(li.materialMatched, li.materialAsWritten)}
      </td>
      <td>
        <select name="line_items[${index}][product_form_id]">${buildOptions(productForms, "id", (f) => f.name, "Select product form", li.productFormId)}</select>
        ${matchBadge(li.productFormMatched, li.productFormAsWritten)}
      </td>
      <td>
        <select name="line_items[${index}][standard_id]">${buildOptions(standards, "id", (s) => s.code, "(none)", li.standardId)}</select>
        ${matchBadge(li.standardMatched, li.standardAsWritten)}
      </td>
      <td><textarea class="auto-grow" name="line_items[${index}][description]">${escapeHtml(li.description || "")}</textarea></td>
      <td>
        <input type="number" name="line_items[${index}][quantity]" value="${escapeHtml(li.quantity || "")}" min="1">
        ${missingQty ? '<div class="text-negative" style="font-size: 0.85rem;">Not stated in email — please confirm</div>' : ""}
      </td>
      <td><input type="text" name="line_items[${index}][unit]" value="${escapeHtml(li.unit || "")}"></td>
      <td><input type="number" step="0.1" name="line_items[${index}][length_m]" value="${escapeHtml(li.lengthM || "")}"></td>
      <td>
        ${
          isUnrecognized
            ? `<label><input type="checkbox" name="line_items[${index}][skip]"${li.skip ? " checked" : ""}> Skip this line (defer — note left on the Job for follow-up)</label>`
            : ""
        }
      </td>
      <td>
        <button type="button" class="btn btn-secondary remove-line-item">Remove</button>
        <input type="hidden" name="line_items[${index}][raw_text]" value="${escapeHtml(li.rawText || "")}">
        <input type="hidden" name="line_items[${index}][material_originally_matched]" value="${li.materialMatched ? "true" : "false"}">
        <input type="hidden" name="line_items[${index}][material_as_written]" value="${escapeHtml(li.materialAsWritten || "")}">
        <input type="hidden" name="line_items[${index}][product_form_originally_matched]" value="${li.productFormMatched ? "true" : "false"}">
        <input type="hidden" name="line_items[${index}][product_form_as_written]" value="${escapeHtml(li.productFormAsWritten || "")}">
        <input type="hidden" name="line_items[${index}][standard_originally_matched]" value="${li.standardMatched ? "true" : "false"}">
        <input type="hidden" name="line_items[${index}][standard_as_written]" value="${escapeHtml(li.standardAsWritten || "")}">
      </td>
    </tr>`;
}

function notesBanner(notes) {
  if (!notes || !notes.length) return "";
  const items = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  return `
    <div class="form-errors">
      <strong>Flagged by the AI — review before confirming:</strong>
      <ul>${items}</ul>
    </div>`;
}

function sourcePanel(submission, attachments) {
  const screenshot = attachments.find((a) => a.used_for_extraction);
  const otherAttachments = attachments.filter((a) => !a.used_for_extraction);

  const textBlock = submission.raw_email_text
    ? `<h3>Pasted Text</h3><pre style="white-space: pre-wrap; max-height: 300px; overflow-y: auto; background: var(--color-cream); padding: 0.75rem; border-radius: var(--radius);">${escapeHtml(submission.raw_email_text)}</pre>`
    : "";

  const screenshotBlock = screenshot
    ? `<h3>Screenshot (used for extraction)</h3><p><img src="/email-intake/${submission.id}/attachments/${screenshot.id}" alt="Email screenshot" style="max-width: 100%; border: 1px solid var(--color-border); border-radius: var(--radius);"></p>`
    : "";

  const otherAttachmentsBlock = otherAttachments.length
    ? `<h3>Other Attachments</h3><ul>${otherAttachments
        .map((a) => `<li><a href="/email-intake/${submission.id}/attachments/${a.id}">${escapeHtml(a.original_filename)}</a></li>`)
        .join("")}</ul>`
    : "";

  return `
    <div class="card">
      <h2>Original Source</h2>
      <p style="color: var(--color-text-muted);">Received ${escapeHtml(formatDate(submission.created_date))}</p>
      ${textBlock}
      ${screenshotBlock}
      ${otherAttachmentsBlock}
    </div>`;
}

function senderSection(sender, senderMatch, accounts, contacts, formValues) {
  const mode = formValues.sender_mode || senderMatch.mode;

  return `
    <div class="card">
      <h2>Sender / Account</h2>
      <p style="color: var(--color-text-muted);">Extracted: ${escapeHtml(sender.name || "(no name)")} &lt;${escapeHtml(sender.email || "no email")}&gt;${sender.company ? `, ${escapeHtml(sender.company)}` : ""}${sender.title ? ` — ${escapeHtml(sender.title)}` : ""}</p>

      ${
        senderMatch.mode === "matched"
          ? `<label><input type="radio" name="sender_mode" value="matched"${mode === "matched" ? " checked" : ""}> Use matched contact: ${escapeHtml(senderMatch.contactName)} (${escapeHtml(senderMatch.accountName)})</label><br>`
          : ""
      }
      <label><input type="radio" name="sender_mode" value="existingAccountNewContact"${mode === "existingAccountNewContact" ? " checked" : ""}> Existing account, new contact</label><br>
      <label><input type="radio" name="sender_mode" value="new"${mode === "new" ? " checked" : ""}> New account entirely</label>

      <div id="existing-account-fields" style="${mode === "matched" || mode === "existingAccountNewContact" ? "" : "display:none;"}">
        <label class="field">
          <span class="field-label">Account</span>
          <select name="account_id" id="account_id">${buildOptions(
            accounts,
            "id",
            (a) => a.name,
            "Select account",
            formValues.account_id || senderMatch.accountId
          )}</select>
        </label>
        <label class="field" id="matched-contact-field" style="${mode === "matched" ? "" : "display:none;"}">
          <span class="field-label">Contact</span>
          <select name="contact_id" id="contact_id" data-selected-contact-id="${escapeHtml(formValues.contact_id || senderMatch.contactId || "")}"><option value="">Select contact</option></select>
        </label>
      </div>

      <div id="new-contact-fields" style="${mode === "existingAccountNewContact" || mode === "new" ? "" : "display:none;"}">
        <h3>New Contact</h3>
        <label class="field"><span class="field-label">Name</span><input type="text" name="new_contact_name" value="${escapeHtml(formValues.new_contact_name || sender.name || "")}"></label>
        <label class="field"><span class="field-label">Title</span><input type="text" name="new_contact_title" value="${escapeHtml(formValues.new_contact_title || sender.title || "")}"></label>
        <label class="field"><span class="field-label">Email</span><input type="email" name="new_contact_email" value="${escapeHtml(formValues.new_contact_email || sender.email || "")}"></label>
        <label class="field"><span class="field-label">Phone</span><input type="text" name="new_contact_phone" value="${escapeHtml(formValues.new_contact_phone || "")}"></label>
      </div>

      <div id="new-account-fields" style="${mode === "new" ? "" : "display:none;"}">
        <h3>New Account</h3>
        <label class="field"><span class="field-label">Account name</span><input type="text" name="new_account_name" value="${escapeHtml(formValues.new_account_name || sender.company || "")}"></label>
        <label class="field">
          <span class="field-label">Industry segment</span>
          <select name="new_account_industry_segment">
            ${["Offshore", "Marine", "Mining", "Oil & Gas"]
              .map((s) => `<option value="${s}"${formValues.new_account_industry_segment === s ? " selected" : ""}>${s}</option>`)
              .join("")}
          </select>
        </label>
        <label class="field"><span class="field-label">Region</span><input type="text" name="new_account_region" value="${escapeHtml(formValues.new_account_region || "")}"></label>
        <label class="field">
          <span class="field-label">Account status</span>
          <select name="new_account_status">
            ${["Active", "Prospect", "Inactive"]
              .map((s) => `<option value="${s}"${(formValues.new_account_status || "Active") === s ? " selected" : ""}>${s}</option>`)
              .join("")}
          </select>
        </label>
      </div>
    </div>`;
}

function emailIntakeReviewForm({
  submission,
  attachments = [],
  accounts,
  contacts,
  users,
  materials,
  productForms,
  standards,
  senderMatch,
  formValues = {},
  errors = [],
}) {
  const lineItems =
    formValues.lineItems && formValues.lineItems.length
      ? formValues.lineItems.map(normalizeFromFormValues)
      : submission.extracted.lineItems.map(normalizeFromExtraction);

  const clientOptions = JSON.stringify({ contacts, materials, productForms, standards }).replace(/</g, "\\u003c");

  const body = `
    <a class="back-link" href="/email-intake">&larr; AI Email Intake</a>
    <h1>Review Extracted RFQ</h1>
    ${errorList(errors)}
    ${notesBanner(submission.extracted.notes)}

    ${sourcePanel(submission, attachments)}

    <form method="POST" action="/email-intake/${submission.id}/confirm" id="email-intake-review-form">
      ${senderSection(submission.extracted.sender, senderMatch, accounts, contacts, formValues)}

      <div class="card">
        <h2>Deal Details</h2>
        <label class="field">
          <span class="field-label">Sales Rep</span>
          <select name="sales_rep_id">${buildOptions(users, "id", (u) => `${u.name} (${u.role})`, "Select sales rep", formValues.sales_rep_id)}</select>
        </label>
        <label class="field">
          <span class="field-label">Project Name</span>
          <input type="text" name="project_name" value="${escapeHtml(formValues.project_name || submission.extracted.subject || "")}" required>
        </label>
        <label class="field">
          <span class="field-label">Due Date (quote owed back)</span>
          <input type="date" name="due_date" value="${escapeHtml(formValues.due_date || "")}" required>
        </label>
        <label class="field">
          <span class="field-label">Customer Requested Delivery Date (optional — often not stated in an initial RFQ email)</span>
          <input type="date" name="customer_requested_delivery_date" value="${escapeHtml(formValues.customer_requested_delivery_date || "")}">
        </label>
      </div>

      <div class="card">
        <h2>Line Items</h2>
        <table id="line-items-table">
          <thead>
            <tr><th>Material</th><th>Product Form</th><th>Standard</th><th>Description</th><th>Qty</th><th>Unit</th><th>Length (m)</th><th></th><th></th></tr>
          </thead>
          <tbody id="line-items-body">
            ${lineItems.map((li, i) => lineItemRowHtml(i, li, materials, productForms, standards)).join("")}
          </tbody>
        </table>
        <p><button type="button" class="btn btn-secondary" id="add-line-item">+ Add Line Item</button></p>
      </div>

      <p><button type="submit" class="btn btn-primary">Confirm &amp; Create Job</button></p>
    </form>

    <form method="POST" action="/email-intake/${submission.id}/discard">
      <button type="submit" class="btn btn-secondary">Discard This Submission</button>
    </form>

    <script>window.__EMAIL_INTAKE_OPTIONS__ = ${clientOptions};</script>
    <script src="/emailIntakeReview.js"></script>
  `;

  return layout({ title: "Review Extracted RFQ", bodyHtml: body });
}

module.exports = { emailIntakeReviewForm };
