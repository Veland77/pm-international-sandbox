// tests/freightQuoteSelection.test.js
// Exercises the "Compare Freight Quotes & Select Winner" read/write logic
// against a scratch SQLite database, never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-freight-quote-selection-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  getFreightInquiryForCompare,
  getFreightQuotesForPickupLocation,
  getSelectedFreightQuotesForRfq,
  selectFreightQuote,
} = require("../src/db/freightQuoteSelectionQueries");

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
  .run("RFQ-TEST-7", "PM-TEST-7", accountId, contactId, userId, "Test Project", "Quoting", "Sourcing", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const line1Id = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '4" Ball Valve', 10, "EA").lastInsertRowid;

// A second RFQ line item, sourced from a DIFFERENT vendor — used to prove
// a freight inquiry covering it resolves to an independent pickup location.
const line2Id = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '6" Ball Valve', 5, "EA").lastInsertRowid;

const vendorId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Vendor", "Italy", "Europe", "Valves").lastInsertRowid;
const otherVendorId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Other Vendor", "Germany", "Europe", "Valves").lastInsertRowid;

function sourceLineItem(rfqLineItemId, supplierId) {
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
      `INSERT INTO supplier_quote_line_items
        (supplier_quote_id, rfq_line_item_id, unit_price, currency, weight_kg, dimensions, crating_cost, lead_time_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(supplierQuoteId, rfqLineItemId, 80, "USD", 20, "100 x 20 x 20 cm", 50, 10).lastInsertRowid;
  return db
    .prepare(
      "INSERT INTO line_item_sourcing (rfq_line_item_id, supplier_quote_line_item_id, selected_date, status) VALUES (?, ?, ?, 'Selected')"
    )
    .run(rfqLineItemId, supplierQuoteLineId, "2026-01-04").lastInsertRowid;
}

sourceLineItem(line1Id, vendorId);
sourceLineItem(line2Id, otherVendorId);

const forwarderAId = db
  .prepare("INSERT INTO freight_forwarders (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Forwarder A", "Italy", "Europe", "Ocean freight").lastInsertRowid;
const forwarderBId = db
  .prepare("INSERT INTO freight_forwarders (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Forwarder B", "Germany", "Europe", "Air freight").lastInsertRowid;

// Two freight_inquiries, both covering line1 (same vendor pickup location),
// sent to two different forwarders — the multi-forwarder comparison case.
const freightInquiry1Id = db
  .prepare(
    "INSERT INTO freight_inquiries (frq_number, rfq_id, freight_forwarder_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("FRQ-TEST-1", rfqId, forwarderAId, "2026-01-05", "Quoted").lastInsertRowid;
db.prepare("INSERT INTO freight_inquiry_line_items (freight_inquiry_id, rfq_line_item_id) VALUES (?, ?)").run(
  freightInquiry1Id,
  line1Id
);

const freightInquiry2Id = db
  .prepare(
    "INSERT INTO freight_inquiries (frq_number, rfq_id, freight_forwarder_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("FRQ-TEST-2", rfqId, forwarderBId, "2026-01-06", "Quoted").lastInsertRowid;
db.prepare("INSERT INTO freight_inquiry_line_items (freight_inquiry_id, rfq_line_item_id) VALUES (?, ?)").run(
  freightInquiry2Id,
  line1Id
);

// A third freight_inquiry covering the OTHER vendor's line item — must
// never show up when comparing line1's pickup location.
const freightInquiry3Id = db
  .prepare(
    "INSERT INTO freight_inquiries (frq_number, rfq_id, freight_forwarder_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("FRQ-TEST-3", rfqId, forwarderAId, "2026-01-05", "Quoted").lastInsertRowid;
db.prepare("INSERT INTO freight_inquiry_line_items (freight_inquiry_id, rfq_line_item_id) VALUES (?, ?)").run(
  freightInquiry3Id,
  line2Id
);

const quoteFromAId = db
  .prepare(
    `INSERT INTO freight_quotes (freight_inquiry_id, quote_ref, received_date, price, currency, transit_days, valid_until, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run(freightInquiry1Id, "A-Q1", "2026-01-10", 850, "EUR", 18, "2026-06-01", "Ocean freight").lastInsertRowid;

const quoteFromBId = db
  .prepare(
    `INSERT INTO freight_quotes (freight_inquiry_id, quote_ref, received_date, price, currency, transit_days, valid_until, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run(freightInquiry2Id, "B-Q1", "2026-01-11", 2400, "EUR", 4, "2026-06-01", "Air freight — faster").lastInsertRowid;

db.prepare(
  `INSERT INTO freight_quotes (freight_inquiry_id, quote_ref, received_date, price, currency, transit_days, valid_until)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).run(freightInquiry3Id, "OTHER-Q1", "2026-01-10", 500, "USD", 10, "2026-06-01");

test("getFreightInquiryForCompare resolves the covering vendor", () => {
  const inquiry = getFreightInquiryForCompare(db, freightInquiry1Id);
  assert.equal(inquiry.rfq_id, rfqId);
  assert.equal(inquiry.supplier_id, vendorId);
  assert.equal(inquiry.supplier_name, "Test Vendor");
});

test("getFreightQuotesForPickupLocation pools quotes across sibling inquiries for the same vendor, excluding other vendors", () => {
  const quotes = getFreightQuotesForPickupLocation(db, { rfqId, supplierId: vendorId });
  assert.equal(quotes.length, 2);
  assert.ok(quotes.every((q) => q.freight_quote_id !== undefined));
  assert.ok(!quotes.some((q) => q.quote_ref === "OTHER-Q1"));

  const fromA = quotes.find((q) => q.quote_ref === "A-Q1");
  assert.equal(fromA.freight_forwarder_name, "Forwarder A");
  assert.equal(fromA.notes, "Ocean freight");
  assert.equal(fromA.is_selected, 0);

  const fromB = quotes.find((q) => q.quote_ref === "B-Q1");
  assert.equal(fromB.freight_forwarder_name, "Forwarder B");
});

test("selectFreightQuote marks exactly one quote as selected for this pickup location", () => {
  selectFreightQuote(db, { rfqId, supplierId: vendorId, freightQuoteId: quoteFromAId });

  const quotes = getFreightQuotesForPickupLocation(db, { rfqId, supplierId: vendorId });
  assert.equal(quotes.find((q) => q.freight_quote_id === quoteFromAId).is_selected, 1);
  assert.equal(quotes.find((q) => q.freight_quote_id === quoteFromBId).is_selected, 0);

  const selectedRows = db
    .prepare("SELECT * FROM freight_quote_selection WHERE rfq_id = ? AND supplier_id = ? AND status = 'Selected'")
    .all(rfqId, vendorId);
  assert.equal(selectedRows.length, 1);
});

test("re-selecting a different forwarder rejects the old choice instead of deleting it", () => {
  selectFreightQuote(db, { rfqId, supplierId: vendorId, freightQuoteId: quoteFromBId });

  const quotes = getFreightQuotesForPickupLocation(db, { rfqId, supplierId: vendorId });
  assert.equal(quotes.find((q) => q.freight_quote_id === quoteFromBId).is_selected, 1);
  assert.equal(quotes.find((q) => q.freight_quote_id === quoteFromAId).is_selected, 0);

  const rejectedRows = db
    .prepare("SELECT * FROM freight_quote_selection WHERE rfq_id = ? AND supplier_id = ? AND status = 'Rejected'")
    .all(rfqId, vendorId);
  assert.equal(rejectedRows.length, 1);
  assert.equal(rejectedRows[0].freight_quote_id, quoteFromAId);
});

test("getSelectedFreightQuotesForRfq reports the current winner per vendor pickup location", () => {
  const selections = getSelectedFreightQuotesForRfq(db, rfqId);
  assert.equal(selections.length, 1);
  assert.equal(selections[0].supplier_id, vendorId);
  assert.equal(selections[0].freight_forwarder_name, "Forwarder B");
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
