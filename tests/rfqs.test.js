// tests/rfqs.test.js
// Exercises the RFQ list/detail queries against a scratch SQLite database
// built fresh for this run. Never touches the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  listRfqs,
  getRfqById,
  getLineItems,
  getLatestQuote,
  getQuoteLineItems,
} = require("../src/db/rfqQueries");

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
const standardId = db
  .prepare("INSERT INTO standards (code, description) VALUES (?, ?)")
  .run("API 6D", "Specification for Pipeline Valves").lastInsertRowid;

const rfqId = db
  .prepare(
    `INSERT INTO rfqs (rfq_number, account_id, contact_id, sales_rep_id, project_name, status, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-1", accountId, contactId, userId, "Test Project", "Quoted", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const lineItemId = db
  .prepare(
    `INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, standard_id, description, quantity, unit)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run(rfqId, materialId, productFormId, standardId, "Test Valve", 5, "EA").lastInsertRowid;

const quoteId = db
  .prepare(
    `INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  .run("Q-TEST-1", rfqId, 1, "Sent", "2026-01-05", "2026-03-01").lastInsertRowid;

db.prepare(
  `INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, margin_pct)
   VALUES (?, ?, ?, ?, ?)`
).run(quoteId, lineItemId, 250.0, 21, 15.0);

test("listRfqs returns the RFQ joined with account and sales rep names", () => {
  const rfqs = listRfqs(db);
  const found = rfqs.find((r) => r.rfq_number === "RFQ-TEST-1");
  assert.ok(found, "expected test RFQ to appear in the list");
  assert.equal(found.account_name, "Test Account");
  assert.equal(found.sales_rep_name, "Test Rep");
});

test("getRfqById returns full account/contact detail", () => {
  const rfq = getRfqById(db, rfqId);
  assert.equal(rfq.account_name, "Test Account");
  assert.equal(rfq.contact_name, "Test Contact");
  assert.equal(rfq.sales_rep_name, "Test Rep");
});

test("getRfqById returns undefined for an unknown id", () => {
  const rfq = getRfqById(db, 999999);
  assert.equal(rfq, undefined);
});

test("getLineItems returns line items joined with material/product form/standard", () => {
  const items = getLineItems(db, rfqId);
  assert.equal(items.length, 1);
  assert.equal(items[0].material_name, "Titanium");
  assert.equal(items[0].product_form_name, "Valves");
  assert.equal(items[0].standard_code, "API 6D");
});

test("getLatestQuote and getQuoteLineItems return the linked quote", () => {
  const quote = getLatestQuote(db, rfqId);
  assert.equal(quote.quote_number, "Q-TEST-1");

  const quoteLines = getQuoteLineItems(db, quote.id);
  assert.equal(quoteLines.length, 1);
  assert.equal(quoteLines[0].unit_price_usd, 250.0);
  assert.equal(quoteLines[0].margin_pct, 15.0);
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
