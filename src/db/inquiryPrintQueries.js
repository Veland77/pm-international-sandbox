// src/db/inquiryPrintQueries.js
// The one query behind the print/PDF-able Sourcing Inquiry document.
// Deliberately separate from supplierInquiryQueries.js and scoped to
// exactly the non-identifying fields the document needs. due_date is
// included only to compute the response-requested-by date server-side —
// never rendered as a raw customer date, and no account/contact fields
// are selected here at all. job_number is the stable, end-to-end deal
// reference (see schema.js's rfqs comment) — safe to show a vendor, it's
// PM's own internal number, not customer identity.

const INQUIRY_PRINT_QUERY = `
  SELECT si.id, si.inquiry_number, si.sent_date,
         s.name AS supplier_name,
         r.due_date, r.job_number,
         u.name AS sales_rep_name
  FROM supplier_inquiries si
  JOIN suppliers s ON s.id = si.supplier_id
  JOIN rfqs r ON r.id = si.rfq_id
  JOIN users u ON u.id = r.sales_rep_id
  WHERE si.id = ?
`;

function getInquiryForPrint(db, id) {
  return db.prepare(INQUIRY_PRINT_QUERY).get(id);
}

module.exports = { getInquiryForPrint };
