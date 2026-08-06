// tests/quoteIntake.test.js
// Exercises the Offer to Customer quote create/edit/mark-sent logic
// against a scratch SQLite database, never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-quote-intake-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  getRfqLineItemsWithSourcing,
  getLandedPricesForRfq,
  getNextQuoteNumber,
  createQuote,
  updateDraftQuote,
  markQuoteAsSent,
} = require("../src/db/quoteBuildQueries");

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
  .run("RFQ-TEST-8", accountId, contactId, userId, "Test Project", "Quoting", "Sourcing", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const sourcedLineId = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '4" Ball Valve', 10, "EA").lastInsertRowid;

// Deliberately left unsourced to confirm it's excluded/flagged.
const unsourcedLineId = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, '6" Ball Valve', 5, "EA").lastInsertRowid;

const vendorId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Vendor", "Italy", "Europe", "Valves").lastInsertRowid;

const inquiryId = db
  .prepare(
    "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("INQ-TEST-1", rfqId, vendorId, "2026-01-02", "Quoted").lastInsertRowid;

const supplierQuoteId = db
  .prepare(
    `INSERT INTO supplier_quotes (supplier_inquiry_id, quote_ref, received_date, availability, lead_time_days, valid_until, estimated_transit_days)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run(inquiryId, "SQ-1", "2026-01-03", "In Stock", 12, "2026-06-01", 7).lastInsertRowid;

const supplierQuoteLineId = db
  .prepare(
    `INSERT INTO supplier_quote_line_items
      (supplier_quote_id, rfq_line_item_id, unit_price, currency, weight_kg, dimensions, crating_cost, lead_time_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run(supplierQuoteId, sourcedLineId, 80, "USD", 20, "100 x 20 x 20 cm", 50, 12).lastInsertRowid;

db.prepare(
  "INSERT INTO line_item_sourcing (rfq_line_item_id, supplier_quote_line_item_id, selected_date, status) VALUES (?, ?, ?, 'Selected')"
).run(sourcedLineId, supplierQuoteLineId, "2026-01-04");

const forwarderId = db
  .prepare("INSERT INTO freight_forwarders (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Forwarder", "Italy", "Europe", "Ocean freight").lastInsertRowid;

const freightInquiryId = db
  .prepare(
    "INSERT INTO freight_inquiries (frq_number, rfq_id, freight_forwarder_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("FRQ-TEST-1", rfqId, forwarderId, "2026-01-05", "Quoted").lastInsertRowid;
db.prepare("INSERT INTO freight_inquiry_line_items (freight_inquiry_id, rfq_line_item_id) VALUES (?, ?)").run(
  freightInquiryId,
  sourcedLineId
);

const freightQuoteId = db
  .prepare(
    `INSERT INTO freight_quotes (freight_inquiry_id, quote_ref, received_date, price, currency, transit_days, valid_until)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run(freightInquiryId, "FQ-1", "2026-01-06", 200, "USD", 18, "2026-06-01").lastInsertRowid;

db.prepare(
  "INSERT INTO freight_quote_selection (rfq_id, supplier_id, freight_quote_id, selected_date, status) VALUES (?, ?, ?, ?, 'Selected')"
).run(rfqId, vendorId, freightQuoteId, "2026-01-07");

test("getRfqLineItemsWithSourcing distinguishes sourced from unsourced lines", () => {
  const rows = getRfqLineItemsWithSourcing(db, rfqId);
  assert.equal(rows.length, 2);
  const sourced = rows.find((r) => r.rfq_line_item_id === sourcedLineId);
  assert.equal(sourced.supplier_id, vendorId);
  assert.equal(sourced.weight_kg, 20);
  assert.equal(sourced.lead_time_days, 12);

  const unsourced = rows.find((r) => r.rfq_line_item_id === unsourcedLineId);
  assert.equal(unsourced.supplier_id, null);
});

test("getLandedPricesForRfq includes buy price plus allocated freight (single line gets the whole quote)", () => {
  const { landedPrices } = getLandedPricesForRfq(db, rfqId);
  const landed = landedPrices.get(sourcedLineId);
  assert.equal(landed.buyUnitPriceUsd, 80);
  assert.equal(landed.freightPerUnitUsd, 200 / 10); // $200 quote / 10 units, single line on this vendor
  assert.equal(landed.landedUnitPriceUsd, 80 + 200 / 10);
});

test("getNextQuoteNumber starts after 5000 when no quotes exist", () => {
  assert.equal(getNextQuoteNumber(db), "Q-5001");
});

let quoteId;

test("createQuote creates a Draft quote with only the sourced line", () => {
  quoteId = createQuote(db, {
    rfqId,
    validUntil: "2026-03-01",
    promisedDeliveryDate: "2026-04-01",
    lines: [{ rfqLineItemId: sourcedLineId, sellUnitPriceUsd: 120, leadTimeDays: 12, targetMarginPct: 20 }],
  });

  const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(quoteId);
  assert.equal(quote.rfq_id, rfqId);
  assert.equal(quote.version, 1);
  assert.equal(quote.status, "Draft");
  assert.equal(quote.quote_number, "Q-5001");

  const lines = db.prepare("SELECT * FROM quote_line_items WHERE quote_id = ?").all(quoteId);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].rfq_line_item_id, sourcedLineId);
  assert.equal(lines[0].unit_price_usd, 120);
});

test("updateDraftQuote replaces the line items in place — no second quotes row created", () => {
  updateDraftQuote(db, {
    quoteId,
    validUntil: "2026-03-15",
    promisedDeliveryDate: "2026-04-01",
    lines: [{ rfqLineItemId: sourcedLineId, sellUnitPriceUsd: 135, leadTimeDays: 12, targetMarginPct: 22 }],
  });

  const allQuotesForRfq = db.prepare("SELECT * FROM quotes WHERE rfq_id = ?").all(rfqId);
  assert.equal(allQuotesForRfq.length, 1); // still just one quote — edited, not versioned

  const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(quoteId);
  assert.equal(quote.valid_until, "2026-03-15");

  const lines = db.prepare("SELECT * FROM quote_line_items WHERE quote_id = ?").all(quoteId);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].unit_price_usd, 135);
});

test("markQuoteAsSent transitions Draft to Sent", () => {
  markQuoteAsSent(db, quoteId);
  const quote = db.prepare("SELECT status FROM quotes WHERE id = ?").get(quoteId);
  assert.equal(quote.status, "Sent");
});

test("updateDraftQuote is a no-op once the quote is no longer Draft", () => {
  const before = db.prepare("SELECT * FROM quotes WHERE id = ?").get(quoteId);
  const linesBefore = db.prepare("SELECT * FROM quote_line_items WHERE quote_id = ?").all(quoteId);

  updateDraftQuote(db, {
    quoteId,
    validUntil: "2099-01-01",
    promisedDeliveryDate: null,
    lines: [{ rfqLineItemId: sourcedLineId, sellUnitPriceUsd: 999, leadTimeDays: 1, targetMarginPct: 1 }],
  });

  const after = db.prepare("SELECT * FROM quotes WHERE id = ?").get(quoteId);
  const linesAfter = db.prepare("SELECT * FROM quote_line_items WHERE quote_id = ?").all(quoteId);

  assert.equal(after.valid_until, before.valid_until);
  assert.equal(after.status, "Sent");
  assert.deepEqual(linesAfter, linesBefore);
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
