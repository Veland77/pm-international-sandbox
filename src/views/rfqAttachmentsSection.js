// src/views/rfqAttachmentsSection.js
// Renders the "Customer Attachments" section on the RFQ detail page.
// Deliberately not shared with supplierInquiryAttachmentsSection.js — see
// src/db/schema.js for why the two attachment systems stay fully separate.

const { escapeHtml } = require("./htmlHelpers");

function rfqAttachmentsSection(rfqId, attachments) {
  const rows = attachments
    .map(
      (a) => `
    <tr>
      <td><a href="/rfqs/${rfqId}/attachments/${a.id}">${escapeHtml(a.original_filename)}</a></td>
      <td>${escapeHtml(a.uploaded_date)}</td>
      <td>${escapeHtml(a.mime_type)}</td>
    </tr>`
    )
    .join("");

  return `
    <h2>Customer Attachments</h2>
    <p style="color: #b00020; font-weight: bold;">Internal only — do not share with suppliers</p>
    <table>
      <thead>
        <tr><th>File</th><th>Uploaded</th><th>Type</th></tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="3">No attachments yet.</td></tr>'}</tbody>
    </table>
    <form method="POST" action="/rfqs/${rfqId}/attachments" enctype="multipart/form-data">
      <input type="file" name="file" required>
      <button type="submit">Upload</button>
    </form>`;
}

module.exports = { rfqAttachmentsSection };
