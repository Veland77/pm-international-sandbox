// tests/quotePrint.test.js
// Exercises the print-document queries against a scratch SQLite database,
// and directly proves they never surface Buy Price or Margin — the
// opposite confidentiality direction from inquiryPrint.test.js (this
// document is customer-facing, so customer identity is fine; vendor buy
// price is what must never appear).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-quote-print-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  getQuoteForPrint,
  getQuoteLineItemsForPrint,
  getQuoteShipmentSizeLineItemsForPrint,
} = require("../src/db/quotePrintQueries");

const db = getDb();
db.exec(SCHEMA);

const userId = db
  .prepare("INSERT INTO users (name, role, region) VALUES (?, ?, ?)")
  .run("Casey Test", "Inside Sales", "Test Region").lastInsertRowid;

const accountId = db
  .prepare("INSERT INTO accounts (name, industry_segment, region, account_status) VALUES (?, ?, ?, ?)")
  .run("Test Customer Co", "Offshore", "Test Region", "Active").lastInsertRowid;

const contactId = db
  .prepare("INSERT INTO contacts (account_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)")
  .run(accountId, "Test Contact", "Buyer", "test@example.com", "+1 555 000 0000").lastInsertRowid;

const rfqId = db
  .prepare(
    `INSERT INTO rfqs (rfq_number, job_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("RFQ-TEST-9", "PM-TEST-9", accountId, contactId, userId, "Test Project", "Quoting", "Sourcing", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const lineItemId = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(
    rfqId,
    db.prepare("INSERT INTO materials (name) VALUES (?)").run("Titanium").lastInsertRowid,
    db.prepare("INSERT INTO product_forms (name) VALUES (?)").run("Valves").lastInsertRowid,
    '4" Ball Valve',
    10,
    "EA"
  ).lastInsertRowid;

const vendorId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Vendor", "Italy", "Europe", "Valves").lastInsertRowid;

const inquiryId = db
  .prepare(
    "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("INQ-TEST-9", rfqId, vendorId, "2026-01-02", "Quoted").lastInsertRowid;

const supplierQuoteId = db
  .prepare(
    `INSERT INTO supplier_quotes (supplier_inquiry_id, quote_ref, received_date, availability, lead_time_days, valid_until, estimated_transit_days)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run(inquiryId, "SQ-9", "2026-01-03", "In Stock", 12, "2026-06-01", 7).lastInsertRowid;

// A deliberately distinctive buy price/currency so we can prove it never
// leaks into the print queries' output, by key or by value.
const CONFIDENTIAL_BUY_PRICE = 66613.13;

const supplierQuoteLineId = db
  .prepare(
    `INSERT INTO supplier_quote_line_items
      (supplier_quote_id, rfq_line_item_id, unit_price, currency, weight_kg, dimensions, crating_cost, lead_time_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run(supplierQuoteId, lineItemId, CONFIDENTIAL_BUY_PRICE, "USD", 20, "100 x 20 x 20 cm", 50, 12).lastInsertRowid;

db.prepare(
  "INSERT INTO line_item_sourcing (rfq_line_item_id, supplier_quote_line_item_id, selected_date, status) VALUES (?, ?, ?, 'Selected')"
).run(lineItemId, supplierQuoteLineId, "2026-01-04");

const quoteId = db
  .prepare(
    `INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until, promised_delivery_date, freight_sell_price_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run("Q-TEST-9", rfqId, 1, "Sent", "2026-01-05", "2026-03-01", "2026-04-01", 75).lastInsertRowid;

db.prepare(
  "INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, target_margin_pct) VALUES (?, ?, ?, ?, ?)"
).run(quoteId, lineItemId, 145, 12, 20);

test("getQuoteForPrint returns customer identity and quote metadata — customer identity is fine here", () => {
  const quote = getQuoteForPrint(db, quoteId);
  assert.equal(quote.quote_number, "Q-TEST-9");
  assert.equal(quote.job_number, "PM-TEST-9");
  assert.equal(quote.account_name, "Test Customer Co");
  assert.equal(quote.contact_name, "Test Contact");
  assert.equal(quote.sales_rep_name, "Casey Test");
  assert.equal(quote.freight_sell_price_usd, 75);
});

test("getQuoteForPrint never includes a buy-price-shaped field, by key or by value", () => {
  const quote = getQuoteForPrint(db, quoteId);
  const keys = Object.keys(quote);
  assert.ok(!keys.some((k) => /buy|margin|unit_price\b/i.test(k)));
  assert.ok(!JSON.stringify(quote).includes(String(CONFIDENTIAL_BUY_PRICE)));
});

test("getQuoteLineItemsForPrint returns only description/quantity/unit/sell price — no join path to buy price exists", () => {
  const lineItems = getQuoteLineItemsForPrint(db, quoteId);
  assert.equal(lineItems.length, 1);
  assert.equal(lineItems[0].description, '4" Ball Valve');
  assert.equal(lineItems[0].quantity, 10);
  assert.equal(lineItems[0].sell_unit_price_usd, 145);

  const keys = Object.keys(lineItems[0]);
  assert.ok(!keys.some((k) => /buy|margin/i.test(k)));
  assert.ok(!JSON.stringify(lineItems).includes(String(CONFIDENTIAL_BUY_PRICE)));
});

test("getQuoteShipmentSizeLineItemsForPrint returns weight/dimensions but never unit_price from the same table", () => {
  const rows = getQuoteShipmentSizeLineItemsForPrint(db, rfqId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].weight_kg, 20);
  assert.equal(rows[0].dimensions, "100 x 20 x 20 cm");

  const keys = Object.keys(rows[0]);
  assert.ok(!keys.includes("unit_price"));
  assert.ok(!JSON.stringify(rows).includes(String(CONFIDENTIAL_BUY_PRICE)));
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
