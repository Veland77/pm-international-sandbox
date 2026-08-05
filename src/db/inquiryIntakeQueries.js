// src/db/inquiryIntakeQueries.js
// Read/write helpers for creating a new Sourcing Inquiry from an existing
// RFQ. This is an internal staff form, so full RFQ/customer context is
// expected and fine here — the confidentiality boundary is about what's
// supplier-facing (see inquiryPrintQueries.js and supplierInquiryQueries.js
// for that side), not this creation step.

function getSuppliersList(db) {
  return db.prepare("SELECT id, name, country FROM suppliers ORDER BY name").all();
}

// Same approach as rfqIntakeQueries.js's getNextRfqNumber: parse the
// highest existing trailing number and add one.
function getNextInquiryNumber(db) {
  const rows = db.prepare("SELECT inquiry_number FROM supplier_inquiries").all();
  const maxN = rows.reduce((max, r) => {
    const match = /(\d+)$/.exec(r.inquiry_number);
    const n = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, n);
  }, 9000);
  return `INQ-${maxN + 1}`;
}

function createSupplierInquiry(db, { rfqId, supplierId, lineItems }) {
  const insertInquiry = db.prepare(
    "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, 'Sent')"
  );
  const insertInquiryLine = db.prepare(
    "INSERT INTO supplier_inquiry_line_items (supplier_inquiry_id, rfq_line_item_id, quantity_requested) VALUES (?, ?, ?)"
  );

  const run = db.transaction(() => {
    const inquiryNumber = getNextInquiryNumber(db);
    const sentDate = new Date().toISOString().slice(0, 10);
    const inquiryId = insertInquiry.run(inquiryNumber, rfqId, supplierId, sentDate).lastInsertRowid;

    lineItems.forEach((li) => {
      insertInquiryLine.run(inquiryId, li.rfqLineItemId, li.quantity);
    });

    return { inquiryId, inquiryNumber };
  });

  return run();
}

module.exports = { getSuppliersList, getNextInquiryNumber, createSupplierInquiry };
