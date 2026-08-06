// tests/orderIntake.test.js
// Exercises the Convert-to-Order flow (purchase order + order + order line
// items + grouped shipments with blank milestones) against a scratch
// SQLite database, never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-order-intake-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const { MILESTONE_TYPES } = require("../src/db/shipmentMilestoneTypes");
const {
  getSourcedLineItemsForConversion,
  getNextPoNumber,
  createOrderFromRfq,
} = require("../src/db/orderIntakeQueries");
const { getOrderForRfq, getShipmentsForOrder } = require("../src/db/orderQueries");

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
  .run("RFQ-TEST-2", "PM-TEST-2", accountId, contactId, userId, "Test Project", "Won", "Closed", "2026-01-01", "2026-02-01")
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

const quoteId = db
  .prepare(
    `INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until, promised_delivery_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run("Q-TEST-1", rfqId, 1, "Accepted", "2026-01-05", "2026-03-01", "2026-04-01").lastInsertRowid;

db.prepare(
  "INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, target_margin_pct) VALUES (?, ?, ?, ?, ?)"
).run(quoteId, line1Id, 100, 14, 20);
db.prepare(
  "INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, target_margin_pct) VALUES (?, ?, ?, ?, ?)"
).run(quoteId, line2Id, 200, 14, 20);

const supplierAId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Vendor A", "Italy", "Europe", "Valves").lastInsertRowid;
const supplierBId = db
  .prepare("INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)")
  .run("Vendor B", "Germany", "Europe", "Valves").lastInsertRowid;

function sourceLineItem(rfqLineItemId, supplierId, unitPrice) {
  const inquiryId = db
    .prepare(
      "INSERT INTO supplier_inquiries (inquiry_number, rfq_id, supplier_id, sent_date, status) VALUES (?, ?, ?, ?, ?)"
    )
    .run(`INQ-TEST-${rfqLineItemId}-${supplierId}`, rfqId, supplierId, "2026-01-02", "Quoted").lastInsertRowid;

  const supplierQuoteId = db
    .prepare(
      `INSERT INTO supplier_quotes (supplier_inquiry_id, quote_ref, received_date, availability, lead_time_days, valid_until, estimated_transit_days)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(inquiryId, `SQ-${inquiryId}`, "2026-01-03", "In Stock", 10, "2026-06-01", 7).lastInsertRowid;

  const supplierQuoteLineId = db
    .prepare(
      `INSERT INTO supplier_quote_line_items (supplier_quote_id, rfq_line_item_id, unit_price, currency, weight_kg, dimensions, crating_cost, lead_time_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(supplierQuoteId, rfqLineItemId, unitPrice, "USD", 20, "100 x 20 x 20 cm", 50, 10).lastInsertRowid;

  return db
    .prepare(
      "INSERT INTO line_item_sourcing (rfq_line_item_id, supplier_quote_line_item_id, selected_date, status) VALUES (?, ?, ?, 'Selected')"
    )
    .run(rfqLineItemId, supplierQuoteLineId, "2026-01-04").lastInsertRowid;
}

sourceLineItem(line1Id, supplierAId, 80);
sourceLineItem(line2Id, supplierBId, 160);

test("getSourcedLineItemsForConversion returns each line item with its selected vendor and sell price", () => {
  const rows = getSourcedLineItemsForConversion(db, rfqId, quoteId);
  assert.equal(rows.length, 2);
  const row1 = rows.find((r) => r.rfq_line_item_id === line1Id);
  assert.equal(row1.supplier_id, supplierAId);
  assert.equal(row1.unit_price_usd, 100);
});

test("getNextPoNumber starts after 6000 when no purchase orders exist", () => {
  assert.equal(getNextPoNumber(db), "PO-6001");
});

test("createOrderFromRfq creates one shipment per distinct vendor by default, each with 6 blank milestones", () => {
  const sourcedLineItems = getSourcedLineItemsForConversion(db, rfqId, quoteId);

  const { orderId, poNumber } = createOrderFromRfq(db, {
    rfqId,
    quoteId,
    customerPoReference: "CUST-PO-0001",
    receivedDate: "2026-02-01",
    sourcedLineItems,
    chosenSupplierIdByLineItemId: {},
  });

  assert.equal(poNumber, "PO-6001");

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  assert.equal(order.pipeline_stage, "PO Received");

  const po = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(order.po_id);
  assert.equal(po.customer_po_reference, "CUST-PO-0001");
  assert.equal(po.total_value, 100 * 10 + 200 * 5);

  const orderLineItems = db.prepare("SELECT * FROM order_line_items WHERE order_id = ?").all(orderId);
  assert.equal(orderLineItems.length, 2);

  const shipments = getShipmentsForOrder(db, orderId);
  assert.equal(shipments.length, 2); // one per distinct vendor

  shipments.forEach((shipment) => {
    assert.equal(shipment.milestones.length, MILESTONE_TYPES.length);
    shipment.milestones.forEach((m) => assert.equal(m.actual_date, null));
  });

  const rfq = db.prepare("SELECT pipeline_stage FROM rfqs WHERE id = ?").get(rfqId);
  assert.equal(rfq.pipeline_stage, "PO Received");

  const orderForRfq = getOrderForRfq(db, rfqId);
  assert.equal(orderForRfq.id, orderId);
});

test("createOrderFromRfq folds the quote's freight sell price into the PO's total_value", () => {
  const sourcedLineItems = getSourcedLineItemsForConversion(db, rfqId, quoteId);

  const { orderId } = createOrderFromRfq(db, {
    rfqId,
    quoteId,
    customerPoReference: "CUST-PO-0002",
    receivedDate: "2026-02-02",
    sourcedLineItems,
    chosenSupplierIdByLineItemId: {},
    freightSellPriceUsd: 75,
  });

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  const po = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(order.po_id);
  // Item sell prices alone (100*10 + 200*5) no longer include freight —
  // it has to be added back in explicitly, same as orderNewForm.js does.
  assert.equal(po.total_value, 100 * 10 + 200 * 5 + 75);
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
