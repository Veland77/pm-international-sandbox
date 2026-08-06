// src/views/freightInquiryCreationSummary.js
// Shown after submitting the Freight Inquiry form. A single submission can
// produce more than one freight_inquiries row — one per distinct vendor
// pickup location among the selected line items (see
// freightInquiryGrouping.js) — so this confirms how many were created and
// links to each one's print view, rather than redirecting to just one.

const { layout } = require("./layout");
const { escapeHtml } = require("./htmlHelpers");

function freightInquiryCreationSummaryPage({ rfq, createdInquiries }) {
  const items = createdInquiries
    .map(
      (c) => `
    <li>
      <strong>${escapeHtml(c.frqNumber)}</strong> — pickup from ${escapeHtml(c.supplierName)} —
      <a href="/freight-inquiries/${c.freightInquiryId}/print">View / Print</a>
    </li>`
    )
    .join("");

  const countText =
    createdInquiries.length === 1
      ? "1 freight inquiry was created."
      : `${createdInquiries.length} freight inquiries were created — one per vendor pickup location.`;

  const body = `
    <a class="back-link" href="/rfqs/${rfq.id}">&larr; Back to ${escapeHtml(rfq.rfq_number)}</a>
    <h1>Freight Inquiries Sent — ${escapeHtml(rfq.rfq_number)}</h1>
    <div class="card">
      <p>${escapeHtml(countText)}</p>
      <ul>${items}</ul>
    </div>
  `;

  return layout({ title: `Freight Inquiries Sent — ${rfq.rfq_number}`, bodyHtml: body });
}

module.exports = { freightInquiryCreationSummaryPage };
