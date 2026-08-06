// src/storage/customerFacingAttachmentStorage.js
// Filesystem storage for CUSTOMER-FACING attachments only (files PM wants
// to share with the customer — the opposite direction from
// rfqAttachmentStorage.js). Deliberately not shared with that module or
// with supplierInquiryAttachmentStorage.js — see src/db/schema.js for why
// the attachment systems stay fully separate. Own subdirectory, same
// reasoning: this is the exact set of files a future customer portal will
// eventually surface directly, so nothing from the internal-only
// rfq/ directory should ever be reachable through this one.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || "./data/attachments";
const CUSTOMER_FACING_ATTACHMENTS_DIR = path.join(ATTACHMENTS_DIR, "customer-facing");

fs.mkdirSync(CUSTOMER_FACING_ATTACHMENTS_DIR, { recursive: true });

// Randomized filename, extension preserved for correct downstream handling —
// original_filename (kept only in the database) is what's shown to users.
function saveCustomerFacingAttachment(buffer, originalFilename) {
  const storedFilename = `${crypto.randomBytes(16).toString("hex")}${path.extname(originalFilename)}`;
  fs.writeFileSync(path.join(CUSTOMER_FACING_ATTACHMENTS_DIR, storedFilename), buffer);
  return storedFilename;
}

function getCustomerFacingAttachmentPath(storedFilename) {
  return path.join(CUSTOMER_FACING_ATTACHMENTS_DIR, storedFilename);
}

module.exports = { saveCustomerFacingAttachment, getCustomerFacingAttachmentPath };
