// src/views/rfqAttachmentsSection.js
// Renders the "Customer Attachments" section on the RFQ detail page —
// files received FROM the customer, or internal working files about them.
// Deliberately not shared with supplierInquiryAttachmentsSection.js or
// customerFacingAttachmentsSection.js — see src/db/schema.js for why the
// attachment systems stay fully separate.

const { escapeHtml, formatDate } = require("./htmlHelpers");

function rfqAttachmentsSection(rfqId, attachments) {
  const rows = attachments
    .map(
      (a) => `
    <tr>
      <td><a href="/rfqs/${rfqId}/attachments/${a.id}">${escapeHtml(a.original_filename)}</a></td>
      <td>${escapeHtml(a.description || "—")}</td>
      <td>${escapeHtml(formatDate(a.uploaded_date))}</td>
      <td>${escapeHtml(a.mime_type)}</td>
    </tr>`
    )
    .join("");

  const fileInputId = `rfq-attachment-file-${rfqId}`;

  return `
    <div class="card">
      <h2>Customer Attachments</h2>
      <p class="text-negative">Internal only — do not share with suppliers</p>
      <table>
        <thead>
          <tr><th>File</th><th>Description</th><th>Uploaded</th><th>Type</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4">No attachments yet.</td></tr>'}</tbody>
      </table>
      <form method="POST" action="/rfqs/${rfqId}/attachments" enctype="multipart/form-data">
        <div class="file-input">
          <input type="file" name="file" id="${fileInputId}" class="file-input-native" required>
          <label for="${fileInputId}" class="btn btn-secondary">Choose File</label>
          <span class="file-input-filename">No file chosen</span>
        </div>
        <label class="field">
          <span class="field-label">Description (optional)</span>
          <input type="text" name="description" placeholder="e.g. Flange detail drawing">
        </label>
        <button type="submit" class="btn btn-primary">Upload</button>
      </form>
    </div>`;
}

module.exports = { rfqAttachmentsSection };
