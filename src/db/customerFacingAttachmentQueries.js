// src/db/customerFacingAttachmentQueries.js
// CUSTOMER-FACING attachment queries only — files PM wants to share with
// the customer, the opposite direction from rfqAttachmentQueries.js.
// Deliberately not shared with rfqAttachmentQueries.js or
// supplierInquiryAttachmentQueries.js — see src/db/schema.js for why the
// attachment systems stay fully separate.

function createCustomerFacingAttachment(db, { rfqId, originalFilename, storedFilename, mimeType, description }) {
  const uploadedDate = new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      "INSERT INTO customer_facing_attachments (rfq_id, original_filename, stored_filename, uploaded_date, mime_type, description) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(rfqId, originalFilename, storedFilename, uploadedDate, mimeType, description || null).lastInsertRowid;
}

function getCustomerFacingAttachments(db, rfqId) {
  return db
    .prepare("SELECT * FROM customer_facing_attachments WHERE rfq_id = ? ORDER BY uploaded_date")
    .all(rfqId);
}

function getCustomerFacingAttachmentById(db, id) {
  return db.prepare("SELECT * FROM customer_facing_attachments WHERE id = ?").get(id);
}

module.exports = { createCustomerFacingAttachment, getCustomerFacingAttachments, getCustomerFacingAttachmentById };
