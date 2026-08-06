// tests/inquiryIntake.test.js
// Exercises the Sourcing Inquiry creation logic against a scratch SQLite
// database, never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-inquiry-intake-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const { getSuppliersList, getNextInquiryNumber, createSupplierInquiry } = require("../src/db/inquiryIntakeQueries");

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

const materialId = db.prepare("INSERT INTO materials (name) VALUES (?)").run("Titanium").lastInsertRowid;
const productFormId = db.prepare("INSERT INTO product_forms (name) VALUES (?)").run("Valves").lastInsertRowid;

const rfqId = db
  .prepare(
    `INSERT INTO rfqs (rfq_number, job_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-1", "PM-TEST-1", accountId, contactId, userId, "Test Project", "New", "New", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const lineItem1Id = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '4" Ball Valve', 5, "EA").lastInsertRowid;

const lineItem2Id = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '6" Ball Valve', 3, "EA").lastInsertRowid;

const supplierId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Supplier", "Germany", "Europe", "Valves").lastInsertRowid;

test("getSuppliersList returns suppliers ordered by name", () => {
  const suppliers = getSuppliersList(db);
  assert.equal(suppliers.length, 1);
  assert.equal(suppliers[0].name, "Test Supplier");
});

test("getNextInquiryNumber starts after 9000 when no inquiries exist", () => {
  assert.equal(getNextInquiryNumber(db), "INQ-9001");
});

test("createSupplierInquiry creates the inquiry and its line items", () => {
  const result = createSupplierInquiry(db, {
    rfqId,
    supplierId,
    lineItems: [
      { rfqLineItemId: lineItem1Id, quantity: 5 },
      { rfqLineItemId: lineItem2Id, quantity: 3 },
    ],
  });

  assert.equal(result.inquiryNumber, "INQ-9001");

  const inquiry = db.prepare("SELECT * FROM supplier_inquiries WHERE id = ?").get(result.inquiryId);
  assert.equal(inquiry.rfq_id, rfqId);
  assert.equal(inquiry.supplier_id, supplierId);
  assert.equal(inquiry.status, "Sent");

  const lines = db.prepare("SELECT * FROM supplier_inquiry_line_items WHERE supplier_inquiry_id = ?").all(result.inquiryId);
  assert.equal(lines.length, 2);
  assert.equal(lines.find((l) => l.rfq_line_item_id === lineItem1Id).quantity_requested, 5);
});

test("a line item can be included on a second inquiry to a different vendor", () => {
  const supplier2Id = db
    .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
    .run("Second Supplier", "Italy", "Europe", "Valves").lastInsertRowid;

  const result = createSupplierInquiry(db, {
    rfqId,
    supplierId: supplier2Id,
    lineItems: [{ rfqLineItemId: lineItem1Id, quantity: 5 }],
  });

  assert.equal(result.inquiryNumber, "INQ-9002");

  const linesForLineItem1 = db
    .prepare("SELECT * FROM supplier_inquiry_line_items WHERE rfq_line_item_id = ?")
    .all(lineItem1Id);
  assert.equal(linesForLineItem1.length, 2); // now on two separate inquiries
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
