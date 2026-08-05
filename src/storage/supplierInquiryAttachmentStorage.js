// src/storage/supplierInquiryAttachmentStorage.js
// Filesystem storage for SUPPLIER-FACING attachments only. Deliberately not
// shared with src/storage/rfqAttachmentStorage.js — see src/db/schema.js
// for why the two attachment systems stay fully separate. Suppliers must
// never see which end customer an inquiry is for.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || "./data/attachments";
const SUPPLIER_INQUIRY_ATTACHMENTS_DIR = path.join(ATTACHMENTS_DIR, "supplier-inquiry");

fs.mkdirSync(SUPPLIER_INQUIRY_ATTACHMENTS_DIR, { recursive: true });

// Randomized filename, extension preserved for correct downstream handling —
// original_filename (kept only in the database) is what's shown to users.
function saveSupplierInquiryAttachment(buffer, originalFilename) {
  const storedFilename = `${crypto.randomBytes(16).toString("hex")}${path.extname(originalFilename)}`;
  fs.writeFileSync(path.join(SUPPLIER_INQUIRY_ATTACHMENTS_DIR, storedFilename), buffer);
  return storedFilename;
}

function getSupplierInquiryAttachmentPath(storedFilename) {
  return path.join(SUPPLIER_INQUIRY_ATTACHMENTS_DIR, storedFilename);
}

module.exports = { saveSupplierInquiryAttachment, getSupplierInquiryAttachmentPath };
