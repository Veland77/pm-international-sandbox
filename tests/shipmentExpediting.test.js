// tests/shipmentExpediting.test.js
// Exercises the Expediting workscreen's read/write query functions against
// a scratch SQLite database, never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-shipment-expediting-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const { MILESTONE_TYPES } = require("../src/db/shipmentMilestoneTypes");
const { getShipmentById } = require("../src/db/shipmentQueries");
const { getMilestonesForShipment, getMilestoneById, updateMilestone } = require("../src/db/shipmentMilestoneQueries");
const { getLogEntriesForShipment, createLogEntry } = require("../src/db/expeditingLogQueries");
const { getDocumentsForShipment, getDocumentById, createDocument } = require("../src/db/shipmentDocumentQueries");

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

const rfqId = db
  .prepare(
    `INSERT INTO rfqs (rfq_number, job_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-5", "PM-TEST-5", accountId, contactId, userId, "Test Project", "Won", "PO Received", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const quoteId = db
  .prepare(
    `INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until, promised_delivery_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run("Q-TEST-2", rfqId, 1, "Accepted", "2026-01-05", "2026-03-01", "2026-04-01").lastInsertRowid;

const poId = db
  .prepare(
    `INSERT INTO purchase_orders (quote_id, po_number, customer_po_reference, received_date, total_value)
     VALUES (?, ?, ?, ?, ?)`
  )
  .run(quoteId, "PO-TEST-1", "CUST-PO-9", "2026-02-01", 1000).lastInsertRowid;

const orderId = db
  .prepare("INSERT INTO orders (po_id, order_date, pipeline_stage) VALUES (?, ?, 'PO Received')")
  .run(poId, "2026-02-01").lastInsertRowid;

const supplierId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Supplier", "Italy", "Europe", "Valves").lastInsertRowid;

const shipmentId = db
  .prepare("INSERT INTO shipments (order_id, supplier_id, origin) VALUES (?, ?, ?)")
  .run(orderId, supplierId, "Italy").lastInsertRowid;

// Mirrors what orderIntakeQueries.js/seed.js do at shipment-creation time —
// all 6 stages exist blank before the Expediting page ever loads.
MILESTONE_TYPES.forEach((type) => {
  db.prepare("INSERT INTO shipment_milestones (shipment_id, milestone_type) VALUES (?, ?)").run(shipmentId, type);
});

test("getShipmentById returns the shipment with order/PO/RFQ context", () => {
  const shipment = getShipmentById(db, shipmentId);
  assert.equal(shipment.po_number, "PO-TEST-1");
  assert.equal(shipment.rfq_id, rfqId);
  assert.equal(shipment.rfq_number, "RFQ-TEST-5");
  assert.equal(shipment.supplier_name, "Test Supplier");
});

test("getMilestonesForShipment returns all 6 stages in the fixed order, initially blank", () => {
  const milestones = getMilestonesForShipment(db, shipmentId);
  assert.equal(milestones.length, MILESTONE_TYPES.length);
  assert.deepEqual(
    milestones.map((m) => m.milestone_type),
    MILESTONE_TYPES
  );
  milestones.forEach((m) => assert.equal(m.actual_date, null));
});

test("updateMilestone sets estimated/actual dates and notes on one stage without touching the others", () => {
  const milestones = getMilestonesForShipment(db, shipmentId);
  const production = milestones.find((m) => m.milestone_type === "Production");

  updateMilestone(db, production.id, {
    estimatedDate: "2026-02-05",
    actualDate: "2026-02-06",
    notes: "Done early.",
  });

  const updated = getMilestoneById(db, production.id);
  assert.equal(updated.estimated_date, "2026-02-05");
  assert.equal(updated.actual_date, "2026-02-06");
  assert.equal(updated.notes, "Done early.");

  const others = getMilestonesForShipment(db, shipmentId).filter((m) => m.id !== production.id);
  others.forEach((m) => assert.equal(m.actual_date, null));
});

test("createLogEntry and getLogEntriesForShipment return newest first", () => {
  createLogEntry(db, { shipmentId, contactType: "Call", note: "First contact", followUpDate: null });
  createLogEntry(db, { shipmentId, contactType: "Email", note: "Second contact", followUpDate: "2026-03-01" });

  const entries = getLogEntriesForShipment(db, shipmentId);
  assert.equal(entries.length, 2);
  // Same real-world entry_date for both — id DESC breaks the tie, so the
  // one created second (higher id) still sorts first.
  assert.equal(entries[0].note, "Second contact");
  assert.equal(entries[1].note, "First contact");
  assert.equal(entries[0].follow_up_date, "2026-03-01");
});

test("createDocument and getDocumentsForShipment round-trip a shipment document", () => {
  const documentId = createDocument(db, {
    shipmentId,
    docType: "Mill Certificate",
    originalFilename: "cert.pdf",
    storedFilename: "abc123.pdf",
  });

  const documents = getDocumentsForShipment(db, shipmentId);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].original_filename, "cert.pdf");

  const byId = getDocumentById(db, documentId);
  assert.equal(byId.doc_type, "Mill Certificate");
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
