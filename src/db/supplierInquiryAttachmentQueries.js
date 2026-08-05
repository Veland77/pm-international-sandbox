// src/db/supplierInquiryAttachmentQueries.js
// SUPPLIER-FACING attachment queries only. Deliberately not shared with
// src/db/rfqAttachmentQueries.js — see src/db/schema.js for why the two
// attachment systems stay fully separate.

function createSupplierInquiryAttachment(db, { supplierInquiryId, originalFilename, storedFilename, mimeType }) {
  const uploadedDate = new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      "INSERT INTO supplier_inquiry_attachments (supplier_inquiry_id, original_filename, stored_filename, uploaded_date, mime_type) VALUES (?, ?, ?, ?, ?)"
    )
    .run(supplierInquiryId, originalFilename, storedFilename, uploadedDate, mimeType).lastInsertRowid;
}

function getSupplierInquiryAttachments(db, supplierInquiryId) {
  return db
    .prepare("SELECT * FROM supplier_inquiry_attachments WHERE supplier_inquiry_id = ? ORDER BY uploaded_date")
    .all(supplierInquiryId);
}

function getSupplierInquiryAttachmentById(db, id) {
  return db.prepare("SELECT * FROM supplier_inquiry_attachments WHERE id = ?").get(id);
}

module.exports = { createSupplierInquiryAttachment, getSupplierInquiryAttachments, getSupplierInquiryAttachmentById };
