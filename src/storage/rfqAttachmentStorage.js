// src/storage/rfqAttachmentStorage.js
// Filesystem storage for CUSTOMER attachments only. Deliberately not shared
// with src/storage/supplierInquiryAttachmentStorage.js — see
// src/db/schema.js for why the two attachment systems stay fully separate.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || "./data/attachments";
const RFQ_ATTACHMENTS_DIR = path.join(ATTACHMENTS_DIR, "rfq");

fs.mkdirSync(RFQ_ATTACHMENTS_DIR, { recursive: true });

// Randomized filename, extension preserved for correct downstream handling —
// original_filename (kept only in the database) is what's shown to users.
function saveRfqAttachment(buffer, originalFilename) {
  const storedFilename = `${crypto.randomBytes(16).toString("hex")}${path.extname(originalFilename)}`;
  fs.writeFileSync(path.join(RFQ_ATTACHMENTS_DIR, storedFilename), buffer);
  return storedFilename;
}

function getRfqAttachmentPath(storedFilename) {
  return path.join(RFQ_ATTACHMENTS_DIR, storedFilename);
}

module.exports = { saveRfqAttachment, getRfqAttachmentPath };
