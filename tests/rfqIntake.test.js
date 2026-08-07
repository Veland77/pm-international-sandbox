// tests/rfqIntake.test.js
// Exercises the New RFQ creation queries against a scratch SQLite database,
// never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-intake-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  getNextRfqNumber,
  getNextJobNumber,
  getNextItemNumberSequence,
  createRfqWithLineItems,
} = require("../src/db/rfqIntakeQueries");

const db = getDb();
db.exec(SCHEMA);

const userId = db
  .prepare("INSERT INTO users (name, role, region) VALUES (?, ?, ?)")
  .run("Test Rep", "Inside Sales", "Test Region").lastInsertRowid;

const accountId = db
  .prepare("INSERT INTO accounts (name, industry_segment, region, account_status) VALUES (?, ?, ?, ?)")
  .run("Existing Account", "Offshore", "Test Region", "Active").lastInsertRowid;

const contactId = db
  .prepare("INSERT INTO contacts (account_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)")
  .run(accountId, "Existing Contact", "Buyer", "buyer@example.com", "+1 555 000 0000").lastInsertRowid;

const materialId = db.prepare("INSERT INTO materials (name) VALUES (?)").run("Titanium").lastInsertRowid;
const productFormId = db.prepare("INSERT INTO product_forms (name) VALUES (?)").run("Valves").lastInsertRowid;
const standardId = db
  .prepare("INSERT INTO standards (code, description) VALUES (?, ?)")
  .run("API 6D", "Specification for Pipeline Valves").lastInsertRowid;

test("getNextRfqNumber starts at RFQ-1001 when no RFQs exist", () => {
  assert.equal(getNextRfqNumber(db), "RFQ-1001");
});

test("getNextJobNumber starts at PM-100000 when no RFQs exist", () => {
  assert.equal(getNextJobNumber(db), "PM-100000");
});

test("getNextItemNumberSequence starts at 1 when no item numbers exist", () => {
  assert.equal(getNextItemNumberSequence(db), 1);
});

test("createRfqWithLineItems creates an RFQ for an existing account with generated item numbers", () => {
  const result = createRfqWithLineItems(db, {
    accountMode: "existing",
    accountId,
    contactId,
    salesRepId: userId,
    projectName: "Test Project",
    dueDate: "2026-09-01",
    customerRequestedDeliveryDate: "2026-10-01",
    lineItems: [
      { materialId, productFormId, standardId, description: "4\" Ball Valve", quantity: 5, unit: "EA", lengthM: null },
    ],
  });

  assert.equal(result.rfqNumber, "RFQ-1001");
  assert.equal(result.jobNumber, "PM-100000");

  const rfq = db.prepare("SELECT * FROM rfqs WHERE id = ?").get(result.rfqId);
  assert.equal(rfq.job_number, "PM-100000");
  assert.equal(rfq.account_id, accountId);
  assert.equal(rfq.contact_id, contactId);
  assert.equal(rfq.status, "New");
  assert.equal(rfq.pipeline_stage, "New");
  assert.equal(rfq.due_date, "2026-09-01");
  assert.equal(rfq.customer_requested_delivery_date, "2026-10-01");

  const lineItems = db.prepare("SELECT * FROM rfq_line_items WHERE rfq_id = ?").all(result.rfqId);
  assert.equal(lineItems.length, 1);
  assert.equal(lineItems[0].quantity, 5);

  const itemNumber = db.prepare("SELECT * FROM item_numbers WHERE rfq_line_item_id = ?").get(lineItems[0].id);
  assert.match(itemNumber.item_number, /^VL-TI2-\d{2}-00001$/);
  assert.equal(itemNumber.status, "Active");
});

test("createRfqWithLineItems creates a new account and contact when accountMode is 'new'", () => {
  const result = createRfqWithLineItems(db, {
    accountMode: "new",
    newAccount: { name: "Brand New Co", industry_segment: "Mining", region: "US", account_status: "Prospect" },
    newContact: { name: "New Contact", title: "Procurement", email: "new@example.com", phone: "+1 555 000 0001" },
    salesRepId: userId,
    projectName: "Second Test Project",
    dueDate: "2026-09-15",
    customerRequestedDeliveryDate: "2026-10-15",
    lineItems: [
      { materialId, productFormId, standardId: null, description: "6\" Ball Valve", quantity: 3, unit: "EA", lengthM: null },
    ],
  });

  const rfq = db.prepare("SELECT * FROM rfqs WHERE id = ?").get(result.rfqId);
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(rfq.account_id);
  const contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(rfq.contact_id);

  assert.equal(account.name, "Brand New Co");
  assert.equal(contact.name, "New Contact");
  assert.equal(contact.account_id, account.id);
});

test("getNextRfqNumber, getNextJobNumber, and getNextItemNumberSequence continue after prior submissions", () => {
  assert.equal(getNextRfqNumber(db), "RFQ-1003");
  assert.equal(getNextJobNumber(db), "PM-100002");
  assert.equal(getNextItemNumberSequence(db), 3);
});

test("createRfqWithLineItems with accountMode 'existingAccountNewContact' reuses the account but creates a new contact under it", () => {
  const result = createRfqWithLineItems(db, {
    accountMode: "existingAccountNewContact",
    accountId,
    newContact: { name: "Someone New", title: "Buyer", email: "someone.new@example.com", phone: "+1 555 000 0002" },
    salesRepId: userId,
    projectName: "Third Test Project",
    dueDate: "2026-09-20",
    customerRequestedDeliveryDate: null,
    lineItems: [
      { materialId, productFormId, standardId, description: '8" Ball Valve', quantity: 2, unit: "EA", lengthM: null },
    ],
  });

  assert.equal(result.accountId, accountId); // no second account created

  const rfq = db.prepare("SELECT * FROM rfqs WHERE id = ?").get(result.rfqId);
  assert.equal(rfq.account_id, accountId);

  const contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(rfq.contact_id);
  assert.equal(contact.name, "Someone New");
  assert.equal(contact.account_id, accountId);
  assert.notEqual(contact.id, contactId); // a genuinely new contact row, not the pre-existing one
});

test("createRfqWithLineItems stores catalog_match_note when a line item provides one, and leaves it null otherwise", () => {
  const result = createRfqWithLineItems(db, {
    accountMode: "existing",
    accountId,
    contactId,
    salesRepId: userId,
    projectName: "Fourth Test Project",
    dueDate: "2026-09-25",
    customerRequestedDeliveryDate: null,
    lineItems: [
      {
        materialId,
        productFormId,
        standardId: null,
        description: "Zirconium 702 Round Bar (forced stand-in)",
        quantity: 15,
        unit: "FT",
        lengthM: null,
        catalogMatchNote: 'AI Email Intake: material requested as "Zirconium 702" — not in catalog, mapped to "Titanium". Verify before quoting.',
      },
      { materialId, productFormId, standardId, description: "Ordinary matched line", quantity: 1, unit: "EA", lengthM: null },
    ],
  });

  const lineItems = db.prepare("SELECT * FROM rfq_line_items WHERE rfq_id = ? ORDER BY id").all(result.rfqId);
  assert.match(lineItems[0].catalog_match_note, /Zirconium 702/);
  assert.equal(lineItems[1].catalog_match_note, null);
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
