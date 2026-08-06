// src/db/rfqAttachmentQueries.js
// CUSTOMER attachment queries only. Deliberately not shared with
// src/db/supplierInquiryAttachmentQueries.js or
// src/db/customerFacingAttachmentQueries.js — see src/db/schema.js for why
// the attachment systems stay fully separate.

function createRfqAttachment(db, { rfqId, originalFilename, storedFilename, mimeType, description }) {
  const uploadedDate = new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      "INSERT INTO rfq_attachments (rfq_id, original_filename, stored_filename, uploaded_date, mime_type, description) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(rfqId, originalFilename, storedFilename, uploadedDate, mimeType, description || null).lastInsertRowid;
}

function getRfqAttachments(db, rfqId) {
  return db
    .prepare("SELECT * FROM rfq_attachments WHERE rfq_id = ? ORDER BY uploaded_date")
    .all(rfqId);
}

function getRfqAttachmentById(db, id) {
  return db.prepare("SELECT * FROM rfq_attachments WHERE id = ?").get(id);
}

module.exports = { createRfqAttachment, getRfqAttachments, getRfqAttachmentById };
