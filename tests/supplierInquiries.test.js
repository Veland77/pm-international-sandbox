// tests/supplierInquiries.test.js
// Exercises the Sourcing Inquiry detail page queries against a scratch
// SQLite database, never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-inquiry-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  getSupplierInquiryById,
  getInquiryLineItems,
  getInquiryQuote,
  getInquiryQuoteLineItems,
} = require("../src/db/supplierInquiryQueries");

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
    `INSERT INTO rfqs (rfq_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-1", accountId, contactId, userId, "Test Project", "Sourcing", "Sourcing", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const lineItemId = db
  .prepare(
    `INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  .run(rfqId, materialId, productFormId, "4\" Ball Valve", 5, "EA").lastInsertRowid;

const supplierId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Supplier GmbH", "Germany", "Europe", "Valves and fittings").lastInsertRowid;

const quotedInquiryId = db
  .prepare(
    "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("INQ-TEST-1", rfqId, supplierId, "2026-01-05", "Quoted").lastInsertRowid;

db.prepare(
  "INSERT INTO supplier_inquiry_line_items (supplier_inquiry_id, rfq_line_item_id, quantity_requested) VALUES (?, ?, ?)"
).run(quotedInquiryId, lineItemId, 5);

const quoteId = db
  .prepare(
    `INSERT INTO supplier_quotes (supplier_inquiry_id, quote_ref, received_date, availability, lead_time_days, valid_until, estimated_transit_days)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run(quotedInquiryId, "SQ-TEST-1", "2026-01-10", "In Stock", 14, "2026-03-01", 7).lastInsertRowid;

const quoteLineItemId = db
  .prepare(
    `INSERT INTO supplier_quote_line_items (supplier_quote_id, rfq_line_item_id, unit_price, currency, weight_kg, dimensions, crating_cost, lead_time_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run(quoteId, lineItemId, 90, "EUR", 12, "40 x 40 x 40 cm", 20, 14).lastInsertRowid;

db.prepare(
  "INSERT INTO line_item_sourcing (rfq_line_item_id, supplier_quote_line_item_id, selected_date, status) VALUES (?, ?, ?, 'Selected')"
).run(lineItemId, quoteLineItemId, "2026-01-12");

// A second inquiry with no quote yet, to cover the "not quoted" path.
const unquotedInquiryId = db
  .prepare(
    "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("INQ-TEST-2", rfqId, supplierId, "2026-01-05", "Sent").lastInsertRowid;

test("getSupplierInquiryById returns inquiry, supplier, and parent RFQ info", () => {
  const inquiry = getSupplierInquiryById(db, quotedInquiryId);
  assert.equal(inquiry.inquiry_number, "INQ-TEST-1");
  assert.equal(inquiry.supplier_name, "Test Supplier GmbH");
  assert.equal(inquiry.rfq_number, "RFQ-TEST-1");
  assert.equal(inquiry.rfq_id, rfqId);
});

test("getInquiryLineItems returns the requested line item with quantity_requested", () => {
  const lineItems = getInquiryLineItems(db, quotedInquiryId);
  assert.equal(lineItems.length, 1);
  assert.equal(lineItems[0].quantity_requested, 5);
  assert.equal(lineItems[0].material_name, "Titanium");
  assert.equal(lineItems[0].product_form_name, "Valves");
});

test("getInquiryQuote returns the vendor's quote when one exists", () => {
  const quote = getInquiryQuote(db, quotedInquiryId);
  assert.equal(quote.quote_ref, "SQ-TEST-1");
  assert.equal(quote.availability, "In Stock");
});

test("getInquiryQuote returns undefined when no quote has been received yet", () => {
  const quote = getInquiryQuote(db, unquotedInquiryId);
  assert.equal(quote, undefined);
});

test("getInquiryQuoteLineItems flags the selected line item", () => {
  const quoteLineItems = getInquiryQuoteLineItems(db, quoteId);
  assert.equal(quoteLineItems.length, 1);
  assert.equal(quoteLineItems[0].is_selected, 1);
  assert.equal(quoteLineItems[0].unit_price, 90);
  assert.equal(quoteLineItems[0].currency, "EUR");
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
