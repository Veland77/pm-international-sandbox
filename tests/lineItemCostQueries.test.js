// tests/lineItemCostQueries.test.js
// Exercises the shared line-item/freight-cost reads against a scratch
// SQLite database, never the real seed data. Includes a DB-level proof of
// the freight-coverage correction: a vendor's line item that isn't
// covered by a specific freight quote's own freight_inquiry must never
// dilute that quote's allocation across the lines it does cover.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-line-item-cost-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  getRfqLineItemsWithSourcing,
  getFreightCoverageForRfq,
  getLineCostsForRfq,
} = require("../src/db/lineItemCostQueries");

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
  .run("RFQ-TEST-9", accountId, contactId, userId, "Test Project", "Quoting", "Sourcing", "2026-01-01", "2026-02-01")
  .lastInsertRowid;

const lineAId = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, "Line A", 1, "EA").lastInsertRowid;

const lineBId = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, "Line B", 1, "EA").lastInsertRowid;

// Sourced from the SAME vendor as A and B, but deliberately left off of
// any freight_inquiry — a separate shipment/arrangement not made yet.
const lineCId = db
  .prepare(
    "INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, description, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)"
  )
  .run(rfqId, materialId, productFormId, "Line C", 1, "EA").lastInsertRowid;

const vendorId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Vendor", "Italy", "Europe", "Valves").lastInsertRowid;

function sourceLineItem(rfqLineItemId, unitPrice, weightKg) {
  const inquiryId = db
    .prepare(
      "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
    )
    .run(`INQ-TEST-${rfqLineItemId}`, rfqId, vendorId, "2026-01-02", "Quoted").lastInsertRowid;

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
    .run(supplierQuoteId, rfqLineItemId, unitPrice, "USD", weightKg, "10 x 10 x 10 cm", 20, 10).lastInsertRowid;

  db.prepare(
    "INSERT INTO line_item_sourcing (rfq_line_item_id, supplier_quote_line_item_id, selected_date, status) VALUES (?, ?, ?, 'Selected')"
  ).run(rfqLineItemId, supplierQuoteLineId, "2026-01-04");
}

sourceLineItem(lineAId, 80, 10);
sourceLineItem(lineBId, 60, 20);
sourceLineItem(lineCId, 50, 100); // much heavier — would badly dilute A/B's freight if incorrectly included

const forwarderId = db
  .prepare("INSERT INTO freight_forwarders (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Test Forwarder", "Italy", "Europe", "Ocean freight").lastInsertRowid;

const freightInquiryId = db
  .prepare(
    "INSERT INTO freight_inquiries (frq_number, rfq_id, freight_forwarder_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
  )
  .run("FRQ-TEST-1", rfqId, forwarderId, "2026-01-05", "Quoted").lastInsertRowid;

// Only A and B are covered by this freight_inquiry — C deliberately left out.
db.prepare("INSERT INTO freight_inquiry_line_items (freight_inquiry_id, rfq_line_item_id) VALUES (?, ?)").run(
  freightInquiryId,
  lineAId
);
db.prepare("INSERT INTO freight_inquiry_line_items (freight_inquiry_id, rfq_line_item_id) VALUES (?, ?)").run(
  freightInquiryId,
  lineBId
);

const freightQuoteId = db
  .prepare(
    `INSERT INTO freight_quotes (freight_inquiry_id, quote_ref, received_date, price, currency, transit_days, valid_until)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run(freightInquiryId, "FQ-1", "2026-01-06", 300, "USD", 18, "2026-06-01").lastInsertRowid;

db.prepare(
  "INSERT INTO freight_quote_selection (rfq_id, supplier_id, freight_quote_id, selected_date, status) VALUES (?, ?, ?, ?, 'Selected')"
).run(rfqId, vendorId, freightQuoteId, "2026-01-07");

test("getRfqLineItemsWithSourcing returns every line item with its selected vendor's cost data", () => {
  const rows = getRfqLineItemsWithSourcing(db, rfqId);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.supplier_id === vendorId));
  assert.equal(rows.find((r) => r.rfq_line_item_id === lineAId).weight_kg, 10);
});

test("getFreightCoverageForRfq only returns the lines the selected quote's own freight_inquiry actually covers", () => {
  const coverage = getFreightCoverageForRfq(db, rfqId);
  assert.equal(coverage.length, 2);
  const coveredIds = coverage.map((c) => c.rfq_line_item_id).sort();
  assert.deepEqual(coveredIds, [lineAId, lineBId].sort());
  assert.ok(!coveredIds.includes(lineCId));
});

test("getLineCostsForRfq splits the freight quote across only its covered lines — C's larger weight never dilutes A/B", () => {
  const { lineCosts } = getLineCostsForRfq(db, rfqId);

  // A (10kg) and B (20kg) split the $300 quote 1/3 : 2/3 between themselves —
  // if C's 100kg had incorrectly entered the denominator, these numbers
  // would come out much smaller.
  assert.equal(lineCosts.get(lineAId).freightUnitUsd, 300 * (10 / 30));
  assert.equal(lineCosts.get(lineBId).freightUnitUsd, 300 * (20 / 30));
  assert.equal(lineCosts.get(lineCId).freightUnitUsd, null);

  assert.equal(lineCosts.get(lineAId).buyUnitPriceUsd, 80);
  assert.equal(lineCosts.get(lineCId).buyUnitPriceUsd, 50);
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
