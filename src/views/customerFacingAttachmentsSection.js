// src/views/customerFacingAttachmentsSection.js
// Renders the "Customer-Facing Attachments" section on the RFQ detail page —
// files PM has chosen to SHARE with the customer, the opposite direction
// from rfqAttachmentsSection.js. This is the same attachment set a future
// customer portal will eventually surface directly, so it's kept as its
// own category rather than a filter/tag on Customer Attachments.
// Deliberately not shared with rfqAttachmentsSection.js or
// supplierInquiryAttachmentsSection.js — see src/db/schema.js for why the
// attachment systems stay fully separate.

const { escapeHtml, formatDate } = require("./htmlHelpers");

function customerFacingAttachmentsSection(rfqId, attachments) {
  const rows = attachments
    .map(
      (a) => `
    <tr>
      <td><a href="/rfqs/${rfqId}/customer-facing-attachments/${a.id}">${escapeHtml(a.original_filename)}</a></td>
      <td>${escapeHtml(a.description || "—")}</td>
      <td>${escapeHtml(formatDate(a.uploaded_date))}</td>
      <td>${escapeHtml(a.mime_type)}</td>
    </tr>`
    )
    .join("");

  const fileInputId = `customer-facing-attachment-file-${rfqId}`;

  return `
    <div class="card">
      <h2>Customer-Facing Attachments</h2>
      <p class="text-positive">Shared with the customer</p>
      <table>
        <thead>
          <tr><th>File</th><th>Description</th><th>Uploaded</th><th>Type</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4">No attachments yet.</td></tr>'}</tbody>
      </table>
      <form method="POST" action="/rfqs/${rfqId}/customer-facing-attachments" enctype="multipart/form-data">
        <div class="file-input">
          <input type="file" name="file" id="${fileInputId}" class="file-input-native" required>
          <label for="${fileInputId}" class="btn btn-secondary">Choose File</label>
          <span class="file-input-filename">No file chosen</span>
        </div>
        <label class="field">
          <span class="field-label">Description (optional)</span>
          <input type="text" name="description" placeholder="e.g. Product spec sheet">
        </label>
        <button type="submit" class="btn btn-primary">Upload</button>
      </form>
    </div>`;
}

module.exports = { customerFacingAttachmentsSection };
