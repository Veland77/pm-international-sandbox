// src/routes/customerFacingAttachments.js
// Upload/download for CUSTOMER-FACING attachments only. Deliberately not
// shared with src/routes/rfqAttachments.js or
// src/routes/supplierInquiryAttachments.js — see src/db/schema.js for why
// the attachment systems stay fully separate. Never import anything from
// those modules here.

const express = require("express");
const multer = require("multer");
const { getDb } = require("../db/connection");
const { createCustomerFacingAttachment, getCustomerFacingAttachmentById } = require("../db/customerFacingAttachmentQueries");
const { saveCustomerFacingAttachment, getCustomerFacingAttachmentPath } = require("../storage/customerFacingAttachmentStorage");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = express.Router();

router.post("/:id/customer-facing-attachments", upload.single("file"), (req, res) => {
  const db = getDb();
  const rfqId = Number(req.params.id);

  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const storedFilename = saveCustomerFacingAttachment(req.file.buffer, req.file.originalname);
  createCustomerFacingAttachment(db, {
    rfqId,
    originalFilename: req.file.originalname,
    storedFilename,
    mimeType: req.file.mimetype,
    description: (req.body.description || "").trim() || null,
  });

  res.redirect(`/rfqs/${rfqId}`);
});

router.get("/:id/customer-facing-attachments/:attachmentId", (req, res) => {
  const db = getDb();
  const attachment = getCustomerFacingAttachmentById(db, req.params.attachmentId);

  if (!attachment || attachment.rfq_id !== Number(req.params.id)) {
    return res.status(404).send("Attachment not found");
  }

  res.download(getCustomerFacingAttachmentPath(attachment.stored_filename), attachment.original_filename);
});

module.exports = router;
