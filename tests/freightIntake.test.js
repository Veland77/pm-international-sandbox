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
  getFreightForwardersList,
  getNextFrqNumber,
  createFreightInquiries,
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
    `INSERT INTO rfqs (rfq_number, job_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-4", "PM-TEST-4", accountId, contactId, userId, "Test Project", "Quoting", "Sourcing", "2026-01-01", "2026-02-01")
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

// Sourced from a second, different vendor — used to confirm a multi-vendor
// selection splits into separate freight inquiries.
const line3Id = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '2" Ball Valve', 8, "EA").lastInsertRowid;

// Deliberately left unsourced to confirm it's excluded from freight eligibility.
const line4Id = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '8" Ball Valve', 2, "EA").lastInsertRowid;

const supplierAId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Supplier A", "Italy", "Europe", "Valves").lastInsertRowid;

const supplierBId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Supplier B", "Germany", "Europe", "Valves").lastInsertRowid;

const forwarderId = db
  .prepare("INSERT INTO freight_forwarders (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Forwarder", "United Kingdom", "Europe", "General freight").lastInsertRowid;

function sourceLineItem(rfqLineItemId, supplierId, unitPrice) {
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

sourceLineItem(line1Id, supplierAId, 80);
sourceLineItem(line2Id, supplierAId, 160);
sourceLineItem(line3Id, supplierBId, 60);

test("getSourcedLineItemsForFreight only returns line items with a selected vendor, including supplier id", () => {
  const rows = getSourcedLineItemsForFreight(db, rfqId);
  assert.equal(rows.length, 3);
  assert.ok(!rows.some((r) => r.rfq_line_item_id === line4Id));
  assert.ok(rows.every((r) => r.supplier_id != null));
});

test("getFreightForwardersList returns forwarders ordered by name", () => {
  const forwarders = getFreightForwardersList(db);
  assert.equal(forwarders.length, 1);
  assert.equal(forwarders[0].name, "Test Forwarder");
});

test("getNextFrqNumber starts after 7000 when no freight inquiries exist", () => {
  assert.equal(getNextFrqNumber(db), "FRQ-7001");
});

test("a single-vendor selection creates exactly one freight inquiry", () => {
  const created = createFreightInquiries(db, {
    rfqId,
    freightForwarderId: forwarderId,
    sourcedLineItems: getSourcedLineItemsForFreight(db, rfqId).filter((li) => li.rfq_line_item_id !== line3Id),
  });

  assert.equal(created.length, 1);
  assert.equal(created[0].frqNumber, "FRQ-7001");
  assert.equal(created[0].supplierName, "Test Supplier A");

  const inquiry = db.prepare("SELECT * FROM freight_inquiries WHERE id = ?").get(created[0].freightInquiryId);
  assert.equal(inquiry.rfq_id, rfqId);
  assert.equal(inquiry.freight_forwarder_id, forwarderId);
  assert.equal(inquiry.status, "Sent");

  const lines = db
    .prepare("SELECT * FROM freight_inquiry_line_items WHERE freight_inquiry_id = ?")
    .all(created[0].freightInquiryId);
  assert.equal(lines.length, 2);
});

test("a selection spanning two vendors creates two separate freight inquiries, correctly scoped", () => {
  const allSourced = getSourcedLineItemsForFreight(db, rfqId);

  const created = createFreightInquiries(db, {
    rfqId,
    freightForwarderId: forwarderId,
    sourcedLineItems: allSourced, // all 3 sourced lines — 2 from supplier A, 1 from supplier B
  });

  assert.equal(created.length, 2);
  assert.deepEqual(
    created.map((c) => c.frqNumber).sort(),
    ["FRQ-7002", "FRQ-7003"]
  );

  const supplierAInquiry = created.find((c) => c.supplierName === "Test Supplier A");
  const supplierBInquiry = created.find((c) => c.supplierName === "Test Supplier B");

  const supplierALines = db
    .prepare("SELECT rfq_line_item_id FROM freight_inquiry_line_items WHERE freight_inquiry_id = ?")
    .all(supplierAInquiry.freightInquiryId)
    .map((r) => r.rfq_line_item_id);
  assert.deepEqual(supplierALines.sort(), [line1Id, line2Id].sort());

  const supplierBLines = db
    .prepare("SELECT rfq_line_item_id FROM freight_inquiry_line_items WHERE freight_inquiry_id = ?")
    .all(supplierBInquiry.freightInquiryId)
    .map((r) => r.rfq_line_item_id);
  assert.deepEqual(supplierBLines, [line3Id]);

  // Both inquiries went to the same forwarder — only the pickup location differs.
  const inquiries = created.map((c) =>
    db.prepare("SELECT freight_forwarder_id FROM freight_inquiries WHERE id = ?").get(c.freightInquiryId)
  );
  inquiries.forEach((i) => assert.equal(i.freight_forwarder_id, forwarderId));
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
