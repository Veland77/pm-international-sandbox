// src/views/supplierInquiryAttachmentsSection.js
// Renders SUPPLIER-FACING attachment UI. Deliberately not shared with
// rfqAttachmentsSection.js — see src/db/schema.js for why the two
// attachment systems stay fully separate. Must never read from or
// reference rfq_attachments in any way.

const { escapeHtml } = require("./htmlHelpers");

// The full upload/list widget for one inquiry — used on the Sourcing
// Inquiry detail page (src/views/supplierInquiryDetail.js), where upload
// actually happens.
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

// A lightweight links list for the RFQ detail page — points to each
// inquiry's own detail page, where the real upload/list UI lives, rather
// than duplicating full widgets in two places.
function supplierInquiryAttachmentsSection(inquiries, attachmentsByInquiryId) {
  if (!inquiries.length) {
    return "";
  }

  const rows = inquiries
    .map((inquiry) => {
      const count = (attachmentsByInquiryId.get(inquiry.id) || []).length;
      return `
    <tr>
      <td><a href="/supplier-inquiries/${inquiry.id}">${escapeHtml(inquiry.inquiry_number)}</a></td>
      <td>${escapeHtml(inquiry.supplier_name)}</td>
      <td>${count} file${count === 1 ? "" : "s"}</td>
    </tr>`;
    })
    .join("");

  return `
    <h2>Supplier-Facing Attachments</h2>
    <p style="color: #1a7a1a; font-weight: bold;">Confirmed clean of customer identity</p>
    <table>
      <thead>
        <tr><th>Inquiry #</th><th>Vendor</th><th>Attachments</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

module.exports = { supplierInquiryAttachmentsSection, inquiryAttachmentBlock };
