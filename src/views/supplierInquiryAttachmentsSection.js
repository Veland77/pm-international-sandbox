// src/views/supplierInquiryAttachmentsSection.js
// Renders the "Supplier-Facing Attachments" section, grouped per Sourcing
// Inquiry. Deliberately not shared with rfqAttachmentsSection.js — see
// src/db/schema.js for why the two attachment systems stay fully separate.
// Must never read from or reference rfq_attachments in any way.

const { escapeHtml } = require("./htmlHelpers");

function inquiryAttachmentBlock(inquiry, attachments) {
  const rows = attachments
    .map(
      (a) => `
    <tr>
      <td><a href="/supplier-inquiries/${inquiry.id}/attachments/${a.id}">${escapeHtml(a.original_filename)}</a></td>
      <td>${escapeHtml(a.uploaded_date)}</td>
      <td>${escapeHtml(a.mime_type)}</td>
    </tr>`
    )
    .join("");

  return `
    <h3>${escapeHtml(inquiry.inquiry_number)} — ${escapeHtml(inquiry.supplier_name)}</h3>
    <table>
      <thead>
        <tr><th>File</th><th>Uploaded</th><th>Type</th></tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="3">No attachments yet.</td></tr>'}</tbody>
    </table>
    <form method="POST" action="/supplier-inquiries/${inquiry.id}/attachments" enctype="multipart/form-data">
      <input type="file" name="file" required>
      <button type="submit">Upload</button>
    </form>`;
}

function supplierInquiryAttachmentsSection(inquiries, attachmentsByInquiryId) {
  if (!inquiries.length) {
    return "";
  }

  const blocks = inquiries
    .map((inquiry) => inquiryAttachmentBlock(inquiry, attachmentsByInquiryId.get(inquiry.id) || []))
    .join("");

  return `
    <h2>Supplier-Facing Attachments</h2>
    <p style="color: #1a7a1a; font-weight: bold;">Confirmed clean of customer identity</p>
    ${blocks}`;
}

module.exports = { supplierInquiryAttachmentsSection };
