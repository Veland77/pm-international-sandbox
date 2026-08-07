// src/storage/emailIntakeAttachmentStorage.js
// Filesystem storage for AI Email Intake attachments only — the one
// screenshot used as extraction input, plus any other files (drawings,
// spec sheets) that came with the original email. Own subdirectory, same
// randomized-filename pattern as every other attachment storage module.
// On confirmation these files are copied into rfq attachment storage (see
// src/routes/emailIntake.js's confirm route) — this directory is never
// read by the RFQ attachment download route, so the bytes have to
// actually move, not just get a second DB row pointed at them.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || "./data/attachments";
const EMAIL_INTAKE_ATTACHMENTS_DIR = path.join(ATTACHMENTS_DIR, "email-intake");

fs.mkdirSync(EMAIL_INTAKE_ATTACHMENTS_DIR, { recursive: true });

// Randomized filename, extension preserved for correct downstream handling —
// original_filename (kept only in the database) is what's shown to users.
function saveEmailIntakeAttachment(buffer, originalFilename) {
  const storedFilename = `${crypto.randomBytes(16).toString("hex")}${path.extname(originalFilename)}`;
  fs.writeFileSync(path.join(EMAIL_INTAKE_ATTACHMENTS_DIR, storedFilename), buffer);
  return storedFilename;
}

function getEmailIntakeAttachmentPath(storedFilename) {
  return path.join(EMAIL_INTAKE_ATTACHMENTS_DIR, storedFilename);
}

module.exports = { saveEmailIntakeAttachment, getEmailIntakeAttachmentPath };
