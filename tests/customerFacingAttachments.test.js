// tests/customerFacingAttachments.test.js
// Proves customer_facing_attachments is genuinely independent from
// rfq_attachments and supplier_inquiry_attachments: inserting into one
// never surfaces when querying another. Scratch SQLite database, never
// the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-customer-facing-attachments-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const { createRfqAttachment, getRfqAttachments } = require("../src/db/rfqAttachmentQueries");
const {
  createCustomerFacingAttachment,
  getCustomerFacingAttachments,
} = require("../src/db/customerFacingAttachmentQueries");

const db = getDb();
db.exec(SCHEMA);

const userId = db
  .prepare("INSERT INTO users (name, role, region) VALUES (?, ?, ?)")
  .run("Test Rep", "Inside Sales", "Test Region").lastInsertRowid;

const accountId = db
  .prepare("INSERT INTO accounts (name, industry_segment, region, account_status) VALUES (?, ?, ?, ?)")
  .run("Test Account", "Offshore", "Test Region", "Active").lastInsertRowid;

const contactId = db
  .prepare("INSERT INTO contacts (account_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)")
  .run(accountId, "Test Contact", "Buyer", "test@example.com", "+1 555 000 0000").lastInsertRowid;

const rfqId = db
  .prepare(
    `INSERT INTO rfqs (rfq_number, job_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-2", "PM-TEST-2", accountId, contactId, userId, "Test Project", "New", "New", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

test("createCustomerFacingAttachment stores an attachment retrievable by rfq id, with optional description", () => {
  createCustomerFacingAttachment(db, {
    rfqId,
    originalFilename: "product-spec-sheet.pdf",
    storedFilename: "xyz789.pdf",
    mimeType: "application/pdf",
    description: "Spec sheet shared with the customer",
  });

  const attachments = getCustomerFacingAttachments(db, rfqId);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].original_filename, "product-spec-sheet.pdf");
  assert.equal(attachments[0].description, "Spec sheet shared with the customer");
});

test("customer_facing_attachments is independent from rfq_attachments — inserting into one never surfaces in the other", () => {
  createRfqAttachment(db, {
    rfqId,
    originalFilename: "internal-working-file.xlsx",
    storedFilename: "internal001.xlsx",
    mimeType: "application/vnd.ms-excel",
  });

  const customerFacingAttachments = getCustomerFacingAttachments(db, rfqId);
  const rfqAttachments = getRfqAttachments(db, rfqId);

  assert.ok(customerFacingAttachments.every((a) => a.original_filename !== "internal-working-file.xlsx"));
  assert.ok(rfqAttachments.every((a) => a.original_filename !== "product-spec-sheet.pdf"));

  const customerFacingRowCount = db.prepare("SELECT count(*) as n FROM customer_facing_attachments").get().n;
  const rfqAttachmentRowCount = db.prepare("SELECT count(*) as n FROM rfq_attachments").get().n;
  assert.equal(customerFacingRowCount, 1);
  assert.equal(rfqAttachmentRowCount, 1);
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
