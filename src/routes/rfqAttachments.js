// src/routes/rfqAttachments.js
// Upload/download for CUSTOMER attachments only. Deliberately not shared
// with src/routes/supplierInquiryAttachments.js — see src/db/schema.js for
// why the two attachment systems stay fully separate. Never import
// anything from the supplier-inquiry attachment modules here.

const express = require("express");
const multer = require("multer");
const { getDb } = require("../db/connection");
const { createRfqAttachment, getRfqAttachmentById } = require("../db/rfqAttachmentQueries");
const { saveRfqAttachment, getRfqAttachmentPath } = require("../storage/rfqAttachmentStorage");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = express.Router();

router.post("/:id/attachments", upload.single("file"), (req, res) => {
  const db = getDb();
  const rfqId = Number(req.params.id);

  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const storedFilename = saveRfqAttachment(req.file.buffer, req.file.originalname);
  createRfqAttachment(db, {
    rfqId,
    originalFilename: req.file.originalname,
    storedFilename,
    mimeType: req.file.mimetype,
  });

  res.redirect(`/rfqs/${rfqId}`);
});

router.get("/:id/attachments/:attachmentId", (req, res) => {
  const db = getDb();
  const attachment = getRfqAttachmentById(db, req.params.attachmentId);

  if (!attachment || attachment.rfq_id !== Number(req.params.id)) {
    return res.status(404).send("Attachment not found");
  }

  res.download(getRfqAttachmentPath(attachment.stored_filename), attachment.original_filename);
});

module.exports = router;
