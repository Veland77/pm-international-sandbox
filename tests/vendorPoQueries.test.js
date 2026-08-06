// tests/vendorPoQueries.test.js
// Exercises the "Generate Purchase Order" issuance tracking against a
// scratch SQLite database — the real, one-time action distinct from the
// print document itself (poPrint.test.js covers that).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-vendor-po-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const { getVendorPoIssuance, getVendorPoIssuancesForOrder, createVendorPoIssuance } = require("../src/db/vendorPoQueries");

const db = getDb();
db.exec(SCHEMA);

const userId = db
  .prepare("INSERT INTO users (name, role, region) VALUES (?, ?, ?)")
  .run("Casey Test", "Inside Sales", "Test Region").lastInsertRowid;

const accountId = db
  .prepare("INSERT INTO accounts (name, industry_segment, region, account_status) VALUES (?, ?, ?, ?)")
  .run("Test Account", "Offshore", "Test Region", "Active").lastInsertRowid;

const contactId = db
  .prepare("INSERT INTO contacts (account_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)")
  .run(accountId, "Test Contact", "Buyer", "test@example.com", "+1 555 000 0000").lastInsertRowid;

const rfqId = db
  .prepare(
    `INSERT INTO rfqs (rfq_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-11", accountId, contactId, userId, "Test Project", "Won", "Closed", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const quoteId = db
  .prepare(
    `INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until, promised_delivery_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run("Q-TEST-11", rfqId, 1, "Accepted", "2026-01-05", "2026-03-01", "2026-04-01").lastInsertRowid;

const poId = db
  .prepare(
    `INSERT INTO purchase_orders (quote_id, po_number, customer_po_reference, received_date, total_value)
     VALUES (?, ?, ?, ?, ?)`
  )
  .run(quoteId, "PO-6001", "CUST-PO-9001", "2026-02-01", 1000).lastInsertRowid;

const orderId = db
  .prepare("INSERT INTO orders (po_id, order_date, pipeline_stage) VALUES (?, ?, 'PO Received')")
  .run(poId, "2026-02-02").lastInsertRowid;

const vendorAId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Vendor A", "Italy", "Europe", "Valves").lastInsertRowid;
const vendorBId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Vendor B", "Germany", "Europe", "Valves").lastInsertRowid;

test("getVendorPoIssuance returns nothing before it's been generated", () => {
  assert.equal(getVendorPoIssuance(db, orderId, vendorAId), undefined);
});

test("createVendorPoIssuance issues the PO, then getVendorPoIssuance finds it", () => {
  createVendorPoIssuance(db, { orderId, supplierId: vendorAId, issuedDate: "2026-08-06" });

  const issuance = getVendorPoIssuance(db, orderId, vendorAId);
  assert.ok(issuance);
  assert.equal(issuance.issued_date, "2026-08-06");
});

test("createVendorPoIssuance is idempotent — generating the same vendor's PO twice doesn't duplicate or overwrite the date", () => {
  createVendorPoIssuance(db, { orderId, supplierId: vendorAId, issuedDate: "2026-09-01" });

  const issuance = getVendorPoIssuance(db, orderId, vendorAId);
  assert.equal(issuance.issued_date, "2026-08-06"); // unchanged — first generation wins

  const all = db.prepare("SELECT COUNT(*) AS n FROM vendor_po_issuances WHERE order_id = ? AND supplier_id = ?").get(orderId, vendorAId);
  assert.equal(all.n, 1); // no duplicate row
});

test("getVendorPoIssuancesForOrder returns a Map covering only the vendors actually generated", () => {
  const issuances = getVendorPoIssuancesForOrder(db, orderId);
  assert.equal(issuances.get(vendorAId), "2026-08-06");
  assert.equal(issuances.has(vendorBId), false); // vendor B's PO was never generated
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
