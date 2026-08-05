// tests/freightIntake.test.js
// Exercises the Freight Inquiry creation logic against a scratch SQLite
// database, never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-freight-intake-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  getSourcedLineItemsForFreight,
  getNextFrqNumber,
  createFreightInquiry,
} = require("../src/db/freightIntakeQueries");

const db = getDb();
db.exec(SCHEMA);

const userId = db
  .prepare("INSERT INTO users (name, role, region) VALUES (?, ?, ?)")
  .run("Test Rep", "Inside Sales", "Test Region").lastInsertRowid;

const accountId = db
  .prepare("INSERT INTO accounts (name, industry_segment, region, account_status) VALUES (?, ?, ?, ?)")
  .run("Test Account", "Mining", "Test Region", "Active").lastInsertRowid;

const contactId = db
  .prepare("INSERT INTO contacts (account_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)")
  .run(accountId, "Test Contact", "Buyer", "test@example.com", "+1 555 000 0000").lastInsertRowid;

const materialId = db.prepare("INSERT INTO materials (name) VALUES (?)").run("Titanium").lastInsertRowid;
const productFormId = db.prepare("INSERT INTO product_forms (name) VALUES (?)").run("Valves").lastInsertRowid;

const rfqId = db
  .prepare(
    `INSERT INTO rfqs (rfq_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-4", accountId, contactId, userId, "Test Project", "Quoting", "Sourcing", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const line1Id = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '4" Ball Valve', 10, "EA").lastInsertRowid;

const line2Id = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '6" Ball Valve', 5, "EA").lastInsertRowid;

// Deliberately left unsourced to confirm it's excluded from freight eligibility.
const line3Id = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '8" Ball Valve', 2, "EA").lastInsertRowid;

const supplierId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Supplier", "Italy", "Europe", "Valves").lastInsertRowid;

function sourceLineItem(rfqLineItemId, unitPrice) {
  const inquiryId = db
    .prepare(
      "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
    )
    .run(`INQ-TEST-${rfqLineItemId}`, rfqId, supplierId, "2026-01-02", "Quoted").lastInsertRowid;

  const supplierQuoteId = db
    .prepare(
      `INSERT INTO supplier_quotes (supplier_inquiry_id, quote_ref, received_date, availability, lead_time_days, valid_until, estimated_transit_days)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(inquiryId, `SQ-${inquiryId}`, "2026-01-03", "In Stock", 10, "2026-06-01", 7).lastInsertRowid;

  const supplierQuoteLineId = db
    .prepare(
      `INSERT INTO supplier_quote_line_items (supplier_quote_id, rfq_line_item_id, unit_price, currency, weight_kg, dimensions, crating_cost, lead_time_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(supplierQuoteId, rfqLineItemId, unitPrice, "USD", 20, "100 x 20 x 20 cm", 50, 10).lastInsertRowid;

  return db
    .prepare(
      "INSERT INTO line_item_sourcing (rfq_line_item_id, supplier_quote_line_item_id, selected_date, status) VALUES (?, ?, ?, 'Selected')"
    )
    .run(rfqLineItemId, supplierQuoteLineId, "2026-01-04").lastInsertRowid;
}

sourceLineItem(line1Id, 80);
sourceLineItem(line2Id, 160);

test("getSourcedLineItemsForFreight only returns line items with a selected vendor", () => {
  const rows = getSourcedLineItemsForFreight(db, rfqId);
  assert.equal(rows.length, 2);
  assert.ok(!rows.some((r) => r.rfq_line_item_id === line3Id));
});

test("getNextFrqNumber starts after 7000 when no freight inquiries exist", () => {
  assert.equal(getNextFrqNumber(db), "FRQ-7001");
});

test("createFreightInquiry creates the inquiry and its line items", () => {
  const result = createFreightInquiry(db, {
    rfqId,
    freightForwarderName: "Test Forwarder",
    rfqLineItemIds: [line1Id, line2Id],
  });

  assert.equal(result.frqNumber, "FRQ-7001");

  const inquiry = db.prepare("SELECT * FROM freight_inquiries WHERE id = ?").get(result.freightInquiryId);
  assert.equal(inquiry.rfq_id, rfqId);
  assert.equal(inquiry.freight_forwarder_name, "Test Forwarder");
  assert.equal(inquiry.status, "Sent");

  const lines = db
    .prepare("SELECT * FROM freight_inquiry_line_items WHERE freight_inquiry_id = ?")
    .all(result.freightInquiryId);
  assert.equal(lines.length, 2);
});

test("a second freight inquiry continues the FRQ number sequence", () => {
  const result = createFreightInquiry(db, {
    rfqId,
    freightForwarderName: "Second Forwarder",
    rfqLineItemIds: [line1Id],
  });
  assert.equal(result.frqNumber, "FRQ-7002");
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
