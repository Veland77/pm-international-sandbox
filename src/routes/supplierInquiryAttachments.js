// src/routes/supplierInquiryAttachments.js
// Upload/download for SUPPLIER-FACING attachments only. Deliberately not
// shared with src/routes/rfqAttachments.js — see src/db/schema.js for why
// the two attachment systems stay fully separate. Never import anything
// from the RFQ (customer) attachment modules here — that's the whole point.

const express = require("express");
const multer = require("multer");
const { getDb } = require("../db/connection");
const { createSupplierInquiryAttachment, getSupplierInquiryAttachmentById } = require("../db/supplierInquiryAttachmentQueries");
const { saveSupplierInquiryAttachment, getSupplierInquiryAttachmentPath } = require("../storage/supplierInquiryAttachmentStorage");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = express.Router();

router.post("/:id/attachments", upload.single("file"), (req, res) => {
  const db = getDb();
  const supplierInquiryId = Number(req.params.id);

  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const storedFilename = saveSupplierInquiryAttachment(req.file.buffer, req.file.originalname);
  createSupplierInquiryAttachment(db, {
    supplierInquiryId,
    originalFilename: req.file.originalname,
    storedFilename,
    mimeType: req.file.mimetype,
  });

  res.redirect(`/supplier-inquiries/${supplierInquiryId}`);
});

router.get("/:id/attachments/:attachmentId", (req, res) => {
  const db = getDb();
  const attachment = getSupplierInquiryAttachmentById(db, req.params.attachmentId);

  if (!attachment || attachment.supplier_inquiry_id !== Number(req.params.id)) {
    return res.status(404).send("Attachment not found");
  }

  res.download(getSupplierInquiryAttachmentPath(attachment.stored_filename), attachment.original_filename);
});

module.exports = router;
