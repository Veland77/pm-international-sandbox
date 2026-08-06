// tests/attachments.test.js
// Proves the two attachment tables are genuinely independent: inserting
// into one never surfaces when querying the other. Scratch SQLite
// database, never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-attachments-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const { createRfqAttachment, getRfqAttachments } = require("../src/db/rfqAttachmentQueries");
const {
  createSupplierInquiryAttachment,
  getSupplierInquiryAttachments,
} = require("../src/db/supplierInquiryAttachmentQueries");

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
  .run("RFQ-TEST-1", "PM-TEST-1", accountId, contactId, userId, "Test Project", "New", "New", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const supplierId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Supplier", "Germany", "Europe", "Test specialty").lastInsertRowid;

const supplierInquiryId = db
  .prepare(
    "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("INQ-TEST-1", rfqId, supplierId, "2026-01-05", "Sent").lastInsertRowid;

test("createRfqAttachment stores a customer attachment retrievable by rfq id", () => {
  createRfqAttachment(db, {
    rfqId,
    originalFilename: "customer-drawing.pdf",
    storedFilename: "abc123.pdf",
    mimeType: "application/pdf",
  });

  const attachments = getRfqAttachments(db, rfqId);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].original_filename, "customer-drawing.pdf");
  assert.equal(attachments[0].description, null);
});

test("createRfqAttachment stores an optional description", () => {
  createRfqAttachment(db, {
    rfqId,
    originalFilename: "customer-drawing-rev2.pdf",
    storedFilename: "abc124.pdf",
    mimeType: "application/pdf",
    description: "Flange detail drawing, revision 2",
  });

  const attachments = getRfqAttachments(db, rfqId);
  const withDescription = attachments.find((a) => a.original_filename === "customer-drawing-rev2.pdf");
  assert.equal(withDescription.description, "Flange detail drawing, revision 2");
});

test("createSupplierInquiryAttachment stores a supplier attachment retrievable by inquiry id", () => {
  createSupplierInquiryAttachment(db, {
    supplierInquiryId,
    originalFilename: "vendor-spec-sheet.pdf",
    storedFilename: "def456.pdf",
    mimeType: "application/pdf",
  });

  const attachments = getSupplierInquiryAttachments(db, supplierInquiryId);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].original_filename, "vendor-spec-sheet.pdf");
});

test("the two attachment tables are fully independent — a customer file never appears in supplier queries and vice versa", () => {
  const rfqAttachments = getRfqAttachments(db, rfqId);
  const supplierAttachments = getSupplierInquiryAttachments(db, supplierInquiryId);

  assert.ok(rfqAttachments.every((a) => a.original_filename !== "vendor-spec-sheet.pdf"));
  assert.ok(supplierAttachments.every((a) => a.original_filename !== "customer-drawing.pdf"));

  const rfqAttachmentRowCount = db.prepare("SELECT count(*) as n FROM rfq_attachments").get().n;
  const supplierAttachmentRowCount = db.prepare("SELECT count(*) as n FROM supplier_inquiry_attachments").get().n;
  assert.equal(rfqAttachmentRowCount, 2);
  assert.equal(supplierAttachmentRowCount, 1);
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
