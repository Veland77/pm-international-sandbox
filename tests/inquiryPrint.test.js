// tests/inquiryPrint.test.js
// Exercises the print-document query against a scratch SQLite database,
// and directly proves it never surfaces customer-identifying data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-inquiry-print-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const { getInquiryForPrint } = require("../src/db/inquiryPrintQueries");

const db = getDb();
db.exec(SCHEMA);

const userId = db
  .prepare("INSERT INTO users (name, role, region) VALUES (?, ?, ?)")
  .run("Casey Test", "Inside Sales", "Test Region").lastInsertRowid;

const accountId = db
  .prepare("INSERT INTO accounts (name, industry_segment, region, account_status) VALUES (?, ?, ?, ?)")
  .run("Confidential Customer Co", "Offshore", "Test Region", "Active").lastInsertRowid;

const contactId = db
  .prepare("INSERT INTO contacts (account_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)")
  .run(accountId, "Secret Contact Name", "Buyer", "test@example.com", "+1 555 000 0000").lastInsertRowid;

const rfqId = db
  .prepare(
    `INSERT INTO rfqs (rfq_number, job_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-1", "PM-TEST-1", accountId, contactId, userId, "Test Project", "Sourcing", "Sourcing", "2026-01-01", "2026-02-15")
  .lastInsertRowid;

const supplierId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Supplier", "Germany", "Europe", "Valves").lastInsertRowid;

const inquiryId = db
  .prepare(
    "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("INQ-TEST-1", rfqId, supplierId, "2026-01-05", "Sent").lastInsertRowid;

test("getInquiryForPrint returns the fields the print document needs", () => {
  const inquiry = getInquiryForPrint(db, inquiryId);
  assert.equal(inquiry.inquiry_number, "INQ-TEST-1");
  assert.equal(inquiry.supplier_name, "Test Supplier");
  assert.equal(inquiry.sales_rep_name, "Casey Test");
  assert.equal(inquiry.due_date, "2026-02-15");
  assert.equal(inquiry.job_number, "PM-TEST-1");
});

test("getInquiryForPrint never includes customer-identifying fields", () => {
  const inquiry = getInquiryForPrint(db, inquiryId);
  const keys = Object.keys(inquiry);

  assert.ok(!keys.includes("account_name"));
  assert.ok(!keys.includes("contact_name"));
  assert.ok(!keys.includes("account_id"));
  assert.ok(!keys.includes("contact_id"));
  assert.ok(!keys.includes("project_name"));

  // Sanity: confirm none of the actual customer-identifying VALUES leaked
  // into any field, in case of an accidental future column addition.
  const serialized = JSON.stringify(inquiry);
  assert.ok(!serialized.includes("Confidential Customer Co"));
  assert.ok(!serialized.includes("Secret Contact Name"));
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
