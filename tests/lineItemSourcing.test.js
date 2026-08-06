// tests/lineItemSourcing.test.js
// Exercises the "Compare Vendors & Select Winner" read/write logic against
// a scratch SQLite database, never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-line-item-sourcing-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  getLineItemForCompare,
  getVendorQuotesForLineItem,
  selectVendorForLineItem,
} = require("../src/db/lineItemSourcingQueries");

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
  .run("RFQ-TEST-6", accountId, contactId, userId, "Test Project", "Quoting", "Sourcing", "2026-01-01", "2026-02-01")
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

const supplierAId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Vendor A", "Italy", "Europe", "Valves").lastInsertRowid;
const supplierBId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Vendor B", "Germany", "Europe", "Valves").lastInsertRowid;

function quoteLineItem(supplierId, rfqLineItemId, unitPrice, notes) {
  const inquiryId = db
    .prepare(
      "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
    )
    .run(`INQ-TEST-${supplierId}-${rfqLineItemId}`, rfqId, supplierId, "2026-01-02", "Quoted").lastInsertRowid;

  const supplierQuoteId = db
    .prepare(
      `INSERT INTO supplier_quotes (supplier_inquiry_id, quote_ref, received_date, availability, lead_time_days, valid_until, estimated_transit_days)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(inquiryId, `SQ-${inquiryId}`, "2026-01-03", "In Stock", 10, "2026-06-01", 7).lastInsertRowid;

  return db
    .prepare(
      `INSERT INTO supplier_quote_line_items
        (supplier_quote_id, rfq_line_item_id, unit_price, currency, weight_kg, dimensions, crating_cost, lead_time_days, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(supplierQuoteId, rfqLineItemId, unitPrice, "USD", 20, "100 x 20 x 20 cm", 50, 10, notes || null)
    .lastInsertRowid;
}

// Line 1 gets quotes from both vendors (comparison scenario). Line 2 gets a
// quote from only one vendor, and is selected independently of line 1.
const line1QuoteA = quoteLineItem(supplierAId, line1Id, 80, "Rush slot available");
const line1QuoteB = quoteLineItem(supplierBId, line1Id, 95, null);
const line2QuoteA = quoteLineItem(supplierAId, line2Id, 60, null);

test("getLineItemForCompare returns the line item with its parent rfq_id", () => {
  const lineItem = getLineItemForCompare(db, line1Id);
  assert.equal(lineItem.rfq_id, rfqId);
  assert.equal(lineItem.description, '4" Ball Valve');
});

test("getVendorQuotesForLineItem returns every vendor who quoted, none selected yet", () => {
  const quotes = getVendorQuotesForLineItem(db, line1Id);
  assert.equal(quotes.length, 2);
  assert.ok(quotes.every((q) => q.is_selected === 0));

  const vendorA = quotes.find((q) => q.supplier_name === "Vendor A");
  assert.equal(vendorA.notes, "Rush slot available");
  const vendorB = quotes.find((q) => q.supplier_name === "Vendor B");
  assert.equal(vendorB.notes, null);
});

test("selectVendorForLineItem marks exactly one quote as selected", () => {
  selectVendorForLineItem(db, { rfqLineItemId: line1Id, supplierQuoteLineItemId: line1QuoteA });

  const quotes = getVendorQuotesForLineItem(db, line1Id);
  const vendorA = quotes.find((q) => q.supplier_quote_line_item_id === line1QuoteA);
  const vendorB = quotes.find((q) => q.supplier_quote_line_item_id === line1QuoteB);
  assert.equal(vendorA.is_selected, 1);
  assert.equal(vendorB.is_selected, 0);

  const selectedRows = db
    .prepare("SELECT * FROM line_item_sourcing WHERE rfq_line_item_id = ? AND status = 'Selected'")
    .all(line1Id);
  assert.equal(selectedRows.length, 1);
});

test("re-selecting a different vendor rejects the old choice instead of deleting it", () => {
  selectVendorForLineItem(db, { rfqLineItemId: line1Id, supplierQuoteLineItemId: line1QuoteB });

  const quotes = getVendorQuotesForLineItem(db, line1Id);
  const vendorA = quotes.find((q) => q.supplier_quote_line_item_id === line1QuoteA);
  const vendorB = quotes.find((q) => q.supplier_quote_line_item_id === line1QuoteB);
  assert.equal(vendorB.is_selected, 1);
  assert.equal(vendorA.is_selected, 0);

  // Still exactly one Selected row for this line item...
  const selectedRows = db
    .prepare("SELECT * FROM line_item_sourcing WHERE rfq_line_item_id = ? AND status = 'Selected'")
    .all(line1Id);
  assert.equal(selectedRows.length, 1);
  assert.equal(selectedRows[0].supplier_quote_line_item_id, line1QuoteB);

  // ...but the original choice is still on record, just rejected, not deleted.
  const rejectedRows = db
    .prepare("SELECT * FROM line_item_sourcing WHERE rfq_line_item_id = ? AND status = 'Rejected'")
    .all(line1Id);
  assert.equal(rejectedRows.length, 1);
  assert.equal(rejectedRows[0].supplier_quote_line_item_id, line1QuoteA);
});

test("selecting a vendor on one line item never affects another line item's selection", () => {
  selectVendorForLineItem(db, { rfqLineItemId: line2Id, supplierQuoteLineItemId: line2QuoteA });

  const line2Quotes = getVendorQuotesForLineItem(db, line2Id);
  assert.equal(line2Quotes.find((q) => q.supplier_quote_line_item_id === line2QuoteA).is_selected, 1);

  // Line 1's selection (Vendor B, from the previous test) is untouched.
  const line1Quotes = getVendorQuotesForLineItem(db, line1Id);
  assert.equal(line1Quotes.find((q) => q.supplier_quote_line_item_id === line1QuoteB).is_selected, 1);
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
