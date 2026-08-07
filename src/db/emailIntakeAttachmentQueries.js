// src/db/emailIntakeAttachmentQueries.js
// Queries for AI Email Intake attachments — the screenshot (if any) used
// as extraction input, plus any other files uploaded alongside it.
// Deliberately its own module, not shared with rfqAttachmentQueries.js —
// see src/db/schema.js for why. getEmailIntakeAttachments is used both to
// render the review screen and, on confirmation, to promote every row
// into rfq_attachments.

function createEmailIntakeAttachment(db, { emailIntakeId, originalFilename, storedFilename, mimeType, description, usedForExtraction }) {
  const uploadedDate = new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      `INSERT INTO email_intake_attachments
        (email_intake_id, original_filename, stored_filename, uploaded_date, mime_type, description, used_for_extraction)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(emailIntakeId, originalFilename, storedFilename, uploadedDate, mimeType, description || null, usedForExtraction ? 1 : 0)
    .lastInsertRowid;
}

function getEmailIntakeAttachments(db, emailIntakeId) {
  return db
    .prepare("SELECT * FROM email_intake_attachments WHERE email_intake_id = ? ORDER BY id")
    .all(emailIntakeId);
}

function getEmailIntakeAttachmentById(db, id) {
  return db.prepare("SELECT * FROM email_intake_attachments WHERE id = ?").get(id);
}

module.exports = { createEmailIntakeAttachment, getEmailIntakeAttachments, getEmailIntakeAttachmentById };
