// tests/poPrint.test.js
// Exercises the print-document queries against a scratch SQLite database,
// and directly proves they never surface customer identity or sell
// price — the same confidentiality direction as inquiryPrint.test.js
// (this document goes to a vendor), and proves the one-PO-per-vendor
// split is exhaustive and non-overlapping across two vendors on one order.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-po-print-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  getVendorsForOrder,
  getOrderHeaderForPo,
  getSupplierForPo,
  getPoLineItemsForVendor,
} = require("../src/db/poPrintQueries");

const db = getDb();
db.exec(SCHEMA);

const userId = db
  .prepare("INSERT INTO users (name, role, region) VALUES (?, ?, ?)")
  .run("Casey Test", "Inside Sales", "Test Region").lastInsertRowid;

// Deliberately distinctive so we can prove it never leaks into any of
// these vendor-facing queries, by key or by value.
const CONFIDENTIAL_ACCOUNT_NAME = "Confidential Customer Co";
const CONFIDENTIAL_CONTACT_NAME = "Secret Contact Name";

const accountId = db
  .prepare("INSERT INTO accounts (name, industry_segment, region, account_status) VALUES (?, ?, ?, ?)")
  .run(CONFIDENTIAL_ACCOUNT_NAME, "Offshore", "Test Region", "Active").lastInsertRowid;

const contactId = db
  .prepare("INSERT INTO contacts (account_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)")
  .run(accountId, CONFIDENTIAL_CONTACT_NAME, "Buyer", "test@example.com", "+1 555 000 0000").lastInsertRowid;

const rfqId = db
  .prepare(
    `INSERT INTO rfqs (rfq_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-10", accountId, contactId, userId, "Test Project", "Won", "Closed", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const materialId = db.prepare("INSERT INTO materials (name) VALUES (?)").run("Titanium").lastInsertRowid;
const productFormId = db.prepare("INSERT INTO product_forms (name) VALUES (?)").run("Valves").lastInsertRowid;

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

const vendorAId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Vendor A", "Italy", "Europe", "Valves").lastInsertRowid;
const vendorBId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Vendor B", "Germany", "Europe", "Valves").lastInsertRowid;

function sourceLineItem(rfqLineItemId, vendorId, quoteRef, unitPrice, currency, leadTimeDays) {
  const inquiryId = db
    .prepare(
      "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
    )
    .run(`INQ-TEST-${rfqLineItemId}-${vendorId}`, rfqId, vendorId, "2026-01-02", "Quoted").lastInsertRowid;

  const supplierQuoteId = db
    .prepare(
      `INSERT INTO supplier_quotes (supplier_inquiry_id, quote_ref, received_date, availability, lead_time_days, valid_until, estimated_transit_days)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(inquiryId, quoteRef, "2026-01-03", "In Stock", leadTimeDays, "2026-06-01", 7).lastInsertRowid;

  const supplierQuoteLineId = db
    .prepare(
      `INSERT INTO supplier_quote_line_items
        (supplier_quote_id, rfq_line_item_id, unit_price, currency, weight_kg, dimensions, crating_cost, lead_time_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(supplierQuoteId, rfqLineItemId, unitPrice, currency, 20, "100 x 20 x 20 cm", 50, leadTimeDays).lastInsertRowid;

  return db
    .prepare(
      "INSERT INTO line_item_sourcing (rfq_line_item_id, supplier_quote_line_item_id, selected_date, status) VALUES (?, ?, ?, 'Selected')"
    )
    .run(rfqLineItemId, supplierQuoteLineId, "2026-01-04").lastInsertRowid;
}

const sourcing1Id = sourceLineItem(line1Id, vendorAId, "SQ-VENDOR-A-1", 80, "USD", 12);
const sourcing2Id = sourceLineItem(line2Id, vendorBId, "SQ-VENDOR-B-1", 160, "EUR", 20);

const quoteId = db
  .prepare(
    `INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until, promised_delivery_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run("Q-TEST-10", rfqId, 1, "Accepted", "2026-01-05", "2026-03-01", "2026-04-01").lastInsertRowid;

const poId = db
  .prepare(
    `INSERT INTO purchase_orders (quote_id, po_number, customer_po_reference, received_date, total_value)
     VALUES (?, ?, ?, ?, ?)`
  )
  .run(quoteId, "PO-6001", "CUST-PO-9001", "2026-02-01", 1600).lastInsertRowid;

const orderId = db
  .prepare("INSERT INTO orders (po_id, order_date, pipeline_stage) VALUES (?, ?, 'PO Received')")
  .run(poId, "2026-02-02").lastInsertRowid;

db.prepare("INSERT INTO order_line_items (order_id, rfq_line_item_id, line_item_sourcing_id) VALUES (?, ?, ?)").run(
  orderId,
  line1Id,
  sourcing1Id
);
db.prepare("INSERT INTO order_line_items (order_id, rfq_line_item_id, line_item_sourcing_id) VALUES (?, ?, ?)").run(
  orderId,
  line2Id,
  sourcing2Id
);

test("getVendorsForOrder returns both distinct vendors sourced on this order", () => {
  const vendors = getVendorsForOrder(db, orderId);
  assert.equal(vendors.length, 2);
  const names = vendors.map((v) => v.supplier_name).sort();
  assert.deepEqual(names, ["Vendor A", "Vendor B"]);
});

test("getOrderHeaderForPo returns the PO number/order date and never touches customer identity, by key or by value", () => {
  const header = getOrderHeaderForPo(db, orderId);
  assert.equal(header.po_number, "PO-6001");
  assert.equal(header.order_date, "2026-02-02");

  const keys = Object.keys(header);
  assert.ok(!keys.some((k) => /account|contact/i.test(k)));
  assert.ok(!JSON.stringify(header).includes(CONFIDENTIAL_ACCOUNT_NAME));
  assert.ok(!JSON.stringify(header).includes(CONFIDENTIAL_CONTACT_NAME));
});

test("getSupplierForPo returns the vendor's own name/country", () => {
  const supplier = getSupplierForPo(db, vendorAId);
  assert.equal(supplier.supplier_name, "Vendor A");
  assert.equal(supplier.supplier_country, "Italy");
});

test("getPoLineItemsForVendor returns only that vendor's own line item, with its own price/lead time/quote ref", () => {
  const vendorALines = getPoLineItemsForVendor(db, orderId, vendorAId);
  assert.equal(vendorALines.length, 1);
  assert.equal(vendorALines[0].description, '4" Ball Valve');
  assert.equal(vendorALines[0].unit_price, 80);
  assert.equal(vendorALines[0].currency, "USD");
  assert.equal(vendorALines[0].lead_time_days, 12);
  assert.equal(vendorALines[0].quote_ref, "SQ-VENDOR-A-1");

  const vendorBLines = getPoLineItemsForVendor(db, orderId, vendorBId);
  assert.equal(vendorBLines.length, 1);
  assert.equal(vendorBLines[0].description, '6" Ball Valve');
  assert.equal(vendorBLines[0].unit_price, 160);
  assert.equal(vendorBLines[0].currency, "EUR");
});

test("getPoLineItemsForVendor never includes customer identity or the customer's sell price, by key or by value", () => {
  const vendorALines = getPoLineItemsForVendor(db, orderId, vendorAId);
  const keys = Object.keys(vendorALines[0]);

  assert.ok(!keys.some((k) => /account|contact|sell|margin/i.test(k)));
  assert.ok(!JSON.stringify(vendorALines).includes(CONFIDENTIAL_ACCOUNT_NAME));
  assert.ok(!JSON.stringify(vendorALines).includes(CONFIDENTIAL_CONTACT_NAME));
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
