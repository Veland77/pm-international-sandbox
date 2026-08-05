// src/views/rfqAttachmentsSection.js
// Renders the "Customer Attachments" section on the RFQ detail page.
// Deliberately not shared with supplierInquiryAttachmentsSection.js — see
// src/db/schema.js for why the two attachment systems stay fully separate.

const { escapeHtml, formatDate } = require("./htmlHelpers");

function rfqAttachmentsSection(rfqId, attachments) {
  const rows = attachments
    .map(
      (a) => `
    <tr>
      <td><a href="/rfqs/${rfqId}/attachments/${a.id}">${escapeHtml(a.original_filename)}</a></td>
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
          <tr><th>File</th><th>Uploaded</th><th>Type</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="3">No attachments yet.</td></tr>'}</tbody>
      </table>
      <form method="POST" action="/rfqs/${rfqId}/attachments" enctype="multipart/form-data">
        <div class="file-input">
          <input type="file" name="file" id="${fileInputId}" class="file-input-native" required>
          <label for="${fileInputId}" class="btn btn-secondary">Choose File</label>
          <span class="file-input-filename">No file chosen</span>
        </div>
        <button type="submit" class="btn btn-primary">Upload</button>
      </form>
    </div>`;
}

module.exports = { rfqAttachmentsSection };
