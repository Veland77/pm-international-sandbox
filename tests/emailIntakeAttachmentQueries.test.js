// tests/emailIntakeAttachmentQueries.test.js
// Exercises AI Email Intake attachment queries against a scratch SQLite
// database, never the real seed data. Also proves the "screenshot used
// for extraction" flag and regular attachments are independently
// trackable on the same submission.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-email-intake-attachments-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  createEmailIntakeAttachment,
  getEmailIntakeAttachments,
  getEmailIntakeAttachmentById,
} = require("../src/db/emailIntakeAttachmentQueries");
const { createEmailIntakeSubmission } = require("../src/db/emailIntakeQueries");

const db = getDb();
db.exec(SCHEMA);

const emailIntakeId = createEmailIntakeSubmission(db, {
  rawEmailText: null,
  extracted: { sender: {}, subject: null, lineItems: [], notes: [] },
});

test("createEmailIntakeAttachment stores a screenshot flagged used_for_extraction, retrievable by submission id", () => {
  const id = createEmailIntakeAttachment(db, {
    emailIntakeId,
    originalFilename: "screenshot.png",
    storedFilename: "abc123.png",
    mimeType: "image/png",
    description: null,
    usedForExtraction: true,
  });

  const attachments = getEmailIntakeAttachments(db, emailIntakeId);
  const screenshot = attachments.find((a) => a.id === id);
  assert.equal(screenshot.original_filename, "screenshot.png");
  assert.equal(screenshot.used_for_extraction, 1);
});

test("createEmailIntakeAttachment stores a regular attachment (not used for extraction) with an optional description", () => {
  createEmailIntakeAttachment(db, {
    emailIntakeId,
    originalFilename: "drawing.pdf",
    storedFilename: "def456.pdf",
    mimeType: "application/pdf",
    description: "Wellhead package drawing",
    usedForExtraction: false,
  });

  const attachments = getEmailIntakeAttachments(db, emailIntakeId);
  const drawing = attachments.find((a) => a.original_filename === "drawing.pdf");
  assert.equal(drawing.used_for_extraction, 0);
  assert.equal(drawing.description, "Wellhead package drawing");
});

test("getEmailIntakeAttachments returns every attachment for the submission, both the screenshot and regular files together", () => {
  const attachments = getEmailIntakeAttachments(db, emailIntakeId);
  assert.equal(attachments.length, 2);
});

test("getEmailIntakeAttachmentById returns a single row by its own id", () => {
  const [first] = getEmailIntakeAttachments(db, emailIntakeId);
  const fetched = getEmailIntakeAttachmentById(db, first.id);
  assert.equal(fetched.id, first.id);
});

test("getEmailIntakeAttachments returns nothing for a submission with no uploads", () => {
  const otherId = createEmailIntakeSubmission(db, {
    rawEmailText: "text only, no files",
    extracted: { sender: {}, subject: null, lineItems: [], notes: [] },
  });
  assert.deepEqual(getEmailIntakeAttachments(db, otherId), []);
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
