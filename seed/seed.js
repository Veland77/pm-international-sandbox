// seed/seed.js
// Fills the sandbox database with fictional CRM/RFQ data only. Never point this at real PM data.
// Run with: npm run seed           (always reseeds)
//           npm run seed:if-empty  (only seeds if the database has no tables yet)

const { getDb } = require("../src/db/connection");
const { SCHEMA, SCHEMA_VERSION } = require("../src/db/schema");
const { formCodeForLineItem, materialCodeForName, buildItemNumber, markAsNotConverted } = require("../src/db/itemNumbers");
const { SUPPLIERS, SUPPLIER_SCENARIOS_BY_RFQ_INDEX, LINE_ITEM_SOURCING_BY_RFQ_INDEX } = require("./supplierFixtures");
const { FREIGHT_FORWARDERS } = require("./freightForwarderFixtures");
const { seedSuppliersForRfq } = require("./seedSuppliers");
const { MILESTONE_TYPES } = require("../src/db/shipmentMilestoneTypes");
const { saveShipmentDocument } = require("../src/storage/shipmentDocumentStorage");

const db = getDb();
const seedOnlyIfEmpty = process.argv.includes("--if-empty");

function currentSchemaVersion() {
  const schemaMetaExists = db
    .prepare("SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='schema_meta'")
    .get().n > 0;
  if (!schemaMetaExists) return 0;
  const row = db.prepare("SELECT version FROM schema_meta LIMIT 1").get();
  return row ? row.version : 0;
}

const existingVersion = currentSchemaVersion();
const needsReseed = existingVersion < SCHEMA_VERSION;

if (seedOnlyIfEmpty && !needsReseed) {
  console.log(`Database already at schema version ${existingVersion}, skipping seed.`);
  process.exit(0);
}

const anyTablesExist = db.prepare("SELECT count(*) as n FROM sqlite_master WHERE type='table'").get().n > 0;

if (anyTablesExist && needsReseed) {
  // Schema shape changed since this disk was last seeded. CREATE TABLE IF NOT
  // EXISTS won't add new columns to tables that already exist, so drop
  // everything and rebuild fresh — safe here since this is disposable
  // fictional demo data, never production data.
  //
  // Drop whatever tables actually exist right now, not a hand-maintained
  // name list: a list drifts out of sync the moment a table gets renamed
  // (an old-named table stays undropped but still holds live foreign keys
  // into tables the list DOES drop). Disabling foreign key checks for the
  // wipe also means drop order doesn't matter, which is the same fix for
  // the same underlying problem either way.
  console.log(`Schema changed (v${existingVersion} -> v${SCHEMA_VERSION}), dropping all tables before reseeding.`);
  db.pragma("foreign_keys = OFF");
  const existingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  existingTables.forEach((t) => db.exec(`DROP TABLE IF EXISTS "${t.name}";`));
  db.pragma("foreign_keys = ON");
}

db.exec(SCHEMA);

const fakeUsers = [
  { name: "Casey Nordahl", role: "Inside Sales", region: "Lakeland FL" },
  { name: "Marcus Ellery", role: "Inside Sales", region: "Houston TX" },
  { name: "Priya Sandhu", role: "Sales Manager", region: "Cheshire UK" },
];

const fakeAccounts = [
  { name: "Northgate Offshore Ltd", industry_segment: "Offshore", region: "UK", account_status: "Active" },
  { name: "Barrow Marine Fabrication", industry_segment: "Marine", region: "UK", account_status: "Active" },
  { name: "Delta Ridge Mining Co", industry_segment: "Mining", region: "US", account_status: "Prospect" },
  { name: "Gulfstream E&P Services", industry_segment: "Oil & Gas", region: "US", account_status: "Active" },
  { name: "Cascadia Subsea Systems", industry_segment: "Offshore", region: "US", account_status: "Active" },
  { name: "Tyneburn Industrial Supply", industry_segment: "Oil & Gas", region: "UK", account_status: "Inactive" },
];

const fakeContactsByAccount = [
  [{ name: "Elena Voss", title: "Procurement Lead", email: "e.voss@northgate-example.com", phone: "+44 1000 000001" }],
  [{ name: "Ollie Bramwell", title: "Buyer", email: "o.bramwell@barrowmarine-example.com", phone: "+44 1000 000002" }],
  [{ name: "Grace Whitfield", title: "Supply Chain Manager", email: "g.whitfield@deltaridge-example.com", phone: "+1 555 010 0003" }],
  [{ name: "Adam Kessler", title: "Procurement Director", email: "a.kessler@gulfstream-example.com", phone: "+1 555 010 0004" }],
  [{ name: "Nina Alvarez", title: "Buyer", email: "n.alvarez@cascadia-example.com", phone: "+1 555 010 0005" }],
  [{ name: "Colin Marsh", title: "Purchasing Agent", email: "c.marsh@tyneburn-example.com", phone: "+44 1000 000006" }],
];

// Material and product-form names match PM's real published catalog structure
// (public site navigation, pmfirst.com/materials and /products) — structure only, no supplier data.
const fakeMaterials = [
  "Duplex Stainless Steel",
  "Super Duplex Stainless Steel",
  "6% Moly",
  "Titanium",
  "Copper Nickel",
  "Nickel Alloys",
  "AISI 4130 Alloy Steel",
  "Stainless Steel 316",
];

const fakeProductForms = [
  "Pipe & Pipe Fittings",
  "Tubing",
  "Round Bar",
  "Plate & Sheet",
  "Flanges",
  "Fasteners",
  "Valves",
  "Specialty Forgings",
];

// Standards pulled from PM's published reference charts (Standards / NORSOK / EN 10204 pages) —
// public technical reference data, not sourcing or pricing information.
const fakeStandards = [
  { code: "ASTM A790", description: "Standard Specification for Duplex Stainless Steel Pipe" },
  { code: "ASME B16.5", description: "Pipe Flanges and Flanged Fittings" },
  { code: "API 6D", description: "Specification for Pipeline Valves" },
  { code: "MSS-SP-75", description: "Specifications for High Test Wrought Butt Weld Fittings" },
  { code: "NORSOK M-650", description: "Qualification of Manufacturers of Special Materials" },
  { code: "EN 10204 3.1", description: "Inspection Certificate — test results per product specification" },
];

// A small catalog combining material + product form + a representative standard,
// used to build believable RFQ line items below.
const catalogLines = [
  { material: "Duplex Stainless Steel", form: "Pipe & Pipe Fittings", standard: "ASTM A790", description: '6" Duplex 2205 Seamless Pipe', unit: "FT", length_m: 12.2 },
  { material: "Super Duplex Stainless Steel", form: "Flanges", standard: "ASME B16.5", description: '8" 300# Super Duplex Weld Neck Flange', unit: "EA", length_m: null },
  { material: "Titanium", form: "Fasteners", standard: "MSS-SP-75", description: "Titanium Gr 2 Hex Bolt Set", unit: "EA", length_m: null },
  { material: "6% Moly", form: "Valves", standard: "API 6D", description: '4" 6% Moly Ball Valve', unit: "EA", length_m: null },
  { material: "Copper Nickel", form: "Tubing", standard: "EN 10204 3.1", description: '2" Copper Nickel 90/10 Tubing', unit: "FT", length_m: 5.8 },
];

// Approximate real-world market rates (public reference data), not a live
// feed. "1 unit of this currency equals this many USD."
const fakeCurrencyRates = [
  { currency_code: "USD", rate_to_usd: 1.0, as_of_date: "2026-01-01" },
  { currency_code: "EUR", rate_to_usd: 1.08, as_of_date: "2026-01-01" },
  { currency_code: "CNY", rate_to_usd: 0.139, as_of_date: "2026-01-01" },
  { currency_code: "KRW", rate_to_usd: 0.000725, as_of_date: "2026-01-01" },
];

const rfqStatuses = ["New", "Quoting", "Quoted", "Won", "Lost"];

// How the legacy status field maps onto the new, more granular pipeline_stage.
const PIPELINE_STAGE_BY_STATUS = {
  New: "New",
  Quoting: "Sourcing",
  Quoted: "Quoted to Customer",
  Won: "Closed",
  Lost: "Lost",
};

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const insertUser = db.prepare("INSERT INTO users (name, role, region) VALUES (?, ?, ?)");
const insertAccount = db.prepare(
  "INSERT INTO accounts (name, industry_segment, region, account_status) VALUES (?, ?, ?, ?)"
);
const insertContact = db.prepare(
  "INSERT INTO contacts (account_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)"
);
const insertMaterial = db.prepare("INSERT INTO materials (name) VALUES (?)");
const insertProductForm = db.prepare("INSERT INTO product_forms (name) VALUES (?)");
const insertStandard = db.prepare("INSERT INTO standards (code, description) VALUES (?, ?)");
const insertRfq = db.prepare(`
  INSERT INTO rfqs
    (rfq_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage,
     created_date, due_date, customer_requested_delivery_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertRfqLine = db.prepare(`
  INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, standard_id, description, quantity, unit, length_m)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertQuote = db.prepare(`
  INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until, promised_delivery_date)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertQuoteLine = db.prepare(`
  INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, target_margin_pct)
  VALUES (?, ?, ?, ?, ?)
`);
const insertActivity = db.prepare(`
  INSERT INTO activities (rfq_id, account_id, user_id, activity_type, note, created_date)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertSupplier = db.prepare(
  "INSERT INTO suppliers (name, country, region, specialty) VALUES (?, ?, ?, ?)"
);
const insertFreightForwarder = db.prepare(
  "INSERT INTO freight_forwarders (name, country, region, specialty) VALUES (?, ?, ?, ?)"
);
const insertCurrencyRate = db.prepare(
  "INSERT INTO currency_rates (currency_code, rate_to_usd, as_of_date) VALUES (?, ?, ?)"
);
const insertItemNumber = db.prepare(`
  INSERT INTO item_numbers (item_number, rfq_line_item_id, form_id, material_id, spec_summary, status, created_date)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const markItemNumberNotConverted = db.prepare(
  "UPDATE item_numbers SET item_number = ?, status = 'Not Converted' WHERE id = ?"
);
const setSchemaVersion = db.prepare("INSERT INTO schema_meta (version) VALUES (?)");

const insertPurchaseOrder = db.prepare(`
  INSERT INTO purchase_orders (quote_id, po_number, customer_po_reference, received_date, total_value)
  VALUES (?, ?, ?, ?, ?)
`);
const insertOrder = db.prepare(
  "INSERT INTO orders (po_id, order_date, pipeline_stage) VALUES (?, ?, ?)"
);
const insertOrderLineItem = db.prepare(`
  INSERT INTO order_line_items (order_id, rfq_line_item_id, line_item_sourcing_id)
  VALUES (?, ?, ?)
`);
const insertShipment = db.prepare(`
  INSERT INTO shipments
    (order_id, supplier_id, freight_forwarder, tracking_number, mode, origin, destination,
     ship_date, eta, pod_received, freight_quote_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertShipmentLineItem = db.prepare(
  "INSERT INTO shipment_line_items (shipment_id, order_line_item_id) VALUES (?, ?)"
);
const insertFreightInquiry = db.prepare(`
  INSERT INTO freight_inquiries (frq_number, rfq_id, freight_forwarder_id, sent_date, status)
  VALUES (?, ?, ?, ?, ?)
`);
const insertFreightInquiryLine = db.prepare(
  "INSERT INTO freight_inquiry_line_items (freight_inquiry_id, rfq_line_item_id) VALUES (?, ?)"
);
const insertFreightQuote = db.prepare(`
  INSERT INTO freight_quotes
    (freight_inquiry_id, quote_ref, received_date, price, currency, transit_days, valid_until, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertFreightQuoteSelection = db.prepare(`
  INSERT INTO freight_quote_selection (rfq_id, supplier_id, freight_quote_id, selected_date, status)
  VALUES (?, ?, ?, ?, 'Selected')
`);
const insertShipmentMilestone = db.prepare(`
  INSERT INTO shipment_milestones (shipment_id, milestone_type, estimated_date, actual_date, notes)
  VALUES (?, ?, ?, ?, ?)
`);
const insertExpeditingLogEntry = db.prepare(`
  INSERT INTO expediting_log (shipment_id, entry_date, contact_type, note, follow_up_date)
  VALUES (?, ?, ?, ?, ?)
`);
const insertShipmentDocument = db.prepare(`
  INSERT INTO shipment_documents (shipment_id, doc_type, original_filename, stored_filename, uploaded_date)
  VALUES (?, ?, ?, ?, ?)
`);

const seedTransaction = db.transaction(() => {
  // Child tables first throughout — see src/db/schema.js for the full
  // dependency graph. The order fulfillment tables added a genuinely deep
  // chain here (order_line_items -> line_item_sourcing -> supplier_quote_line_items,
  // and shipments -> freight_quotes, which is itself layered under
  // freight_inquiries -> rfqs), so this list is order-sensitive in a way
  // that's easy to get wrong — double-check against schema.js before
  // reordering anything.
  db.exec(`
    DELETE FROM customer_quote_options;
    DELETE FROM shipment_documents;
    DELETE FROM expediting_log;
    DELETE FROM shipment_milestones;
    DELETE FROM shipment_line_items;
    DELETE FROM order_line_items;
    DELETE FROM shipments;
    DELETE FROM freight_inquiry_line_items;
    DELETE FROM freight_quote_selection;
    DELETE FROM freight_quotes;
    DELETE FROM freight_inquiries;
    DELETE FROM freight_forwarders;
    DELETE FROM orders;
    DELETE FROM purchase_orders;
    DELETE FROM line_item_sourcing;
    DELETE FROM supplier_quote_line_items;
    DELETE FROM supplier_inquiry_attachments;
    DELETE FROM supplier_quotes;
    DELETE FROM supplier_inquiry_line_items;
    DELETE FROM supplier_inquiries;
    DELETE FROM suppliers;
    DELETE FROM item_numbers;
    DELETE FROM currency_rates;
    DELETE FROM schema_meta;
    DELETE FROM activities; DELETE FROM quote_line_items; DELETE FROM quotes;
    DELETE FROM rfq_attachments;
    DELETE FROM rfq_line_items; DELETE FROM rfqs; DELETE FROM contacts;
    DELETE FROM accounts; DELETE FROM users;
    DELETE FROM materials; DELETE FROM product_forms; DELETE FROM standards;
  `);

  const userIds = fakeUsers.map((u) => insertUser.run(u.name, u.role, u.region).lastInsertRowid);

  const accountIds = fakeAccounts.map(
    (a) => insertAccount.run(a.name, a.industry_segment, a.region, a.account_status).lastInsertRowid
  );

  const contactIdsByAccount = fakeContactsByAccount.map((contacts, i) =>
    contacts.map(
      (c) => insertContact.run(accountIds[i], c.name, c.title, c.email, c.phone).lastInsertRowid
    )
  );

  const materialIdByName = {};
  fakeMaterials.forEach((name) => {
    materialIdByName[name] = insertMaterial.run(name).lastInsertRowid;
  });

  const productFormIdByName = {};
  fakeProductForms.forEach((name) => {
    productFormIdByName[name] = insertProductForm.run(name).lastInsertRowid;
  });

  const standardIdByCode = {};
  fakeStandards.forEach((s) => {
    standardIdByCode[s.code] = insertStandard.run(s.code, s.description).lastInsertRowid;
  });

  const supplierIds = SUPPLIERS.map(
    (s) => insertSupplier.run(s.name, s.country, s.region, s.specialty).lastInsertRowid
  );

  const freightForwarderIdByName = {};
  FREIGHT_FORWARDERS.forEach((f) => {
    freightForwarderIdByName[f.name] = insertFreightForwarder.run(f.name, f.country, f.region, f.specialty).lastInsertRowid;
  });

  fakeCurrencyRates.forEach((r) => {
    insertCurrencyRate.run(r.currency_code, r.rate_to_usd, r.as_of_date);
  });

  let rfqCounter = 1001;
  let quoteCounter = 5001;
  let inquiryCounter = 9001;
  let poCounter = 6001;
  let frqCounter = 7001;
  let itemNumberSequence = 1;
  const itemNumberYear = new Date().getFullYear();

  // Generated the same way rfq_number is: a plain incrementing counter.
  function nextInquiryNumber() {
    return `INQ-${inquiryCounter++}`;
  }
  function nextFrqNumber() {
    return `FRQ-${frqCounter++}`;
  }

  // Captured per RFQ so the end-to-end order seed below (after this loop)
  // can reference a specific RFQ's line items/quote without re-querying —
  // index matches accountIds/fakeAccounts position.
  const rfqDataByIndex = [];

  accountIds.forEach((accountId, i) => {
    const contactId = contactIdsByAccount[i][0];
    const salesRepId = userIds[i % userIds.length];
    const status = rfqStatuses[i % rfqStatuses.length];
    const pipelineStage = PIPELINE_STAGE_BY_STATUS[status];

    const rfqNumber = `RFQ-${rfqCounter++}`;
    const rfqId = insertRfq.run(
      rfqNumber,
      accountId,
      contactId,
      salesRepId,
      `${fakeAccounts[i].name.split(" ")[0]} Pipework Package`,
      status,
      pipelineStage,
      daysFromNow(-14 + i),
      daysFromNow(7 + i),
      daysFromNow(45 + i)
    ).lastInsertRowid;

    // Give each RFQ 2-3 line items drawn from the material/product-form catalog,
    // each assigned a traceability item number as it's worked into the RFQ.
    const lineCount = 2 + (i % 2);
    const rfqLineIds = [];
    const lineItemsForSuppliers = [];
    const itemNumbersForRfq = [];
    for (let j = 0; j < lineCount; j++) {
      const c = catalogLines[(i + j) % catalogLines.length];
      const quantity = (j + 1) * 10;
      const lineId = insertRfqLine.run(
        rfqId,
        materialIdByName[c.material],
        productFormIdByName[c.form],
        standardIdByCode[c.standard],
        c.description,
        quantity,
        c.unit,
        c.length_m
      ).lastInsertRowid;
      rfqLineIds.push(lineId);
      // Kept alongside the line item so insertQuoteLine below reads the
      // same value it inserts, rather than recomputing the formula twice.
      const customerUnitPriceUsd = 100 + j * 37.5;
      lineItemsForSuppliers.push({ id: lineId, quantity, unitPriceUsd: customerUnitPriceUsd });

      const itemNumber = buildItemNumber({
        formCode: formCodeForLineItem(c.form, c.description),
        materialCode: materialCodeForName(c.material),
        year: itemNumberYear,
        sequence: itemNumberSequence++,
      });
      const itemNumberId = insertItemNumber.run(
        itemNumber,
        lineId,
        productFormIdByName[c.form],
        materialIdByName[c.material],
        c.description,
        "Active",
        daysFromNow(-14 + i)
      ).lastInsertRowid;
      itemNumbersForRfq.push({ id: itemNumberId, itemNumber });
    }

    insertActivity.run(
      rfqId,
      accountId,
      salesRepId,
      "Status Change",
      `RFQ ${rfqNumber} created and assigned.`,
      daysFromNow(-14 + i)
    );

    // Only quote RFQs that have moved past 'New'.
    let quoteId = null;
    if (status !== "New") {
      const quoteNumber = `Q-${quoteCounter++}`;
      quoteId = insertQuote.run(
        quoteNumber,
        rfqId,
        1,
        status === "Won" ? "Accepted" : status === "Lost" ? "Rejected" : "Sent",
        daysFromNow(-7 + i),
        daysFromNow(21 + i),
        daysFromNow(35 + i)
      ).lastInsertRowid;

      rfqLineIds.forEach((rfqLineId, j) => {
        insertQuoteLine.run(
          quoteId,
          rfqLineId,
          lineItemsForSuppliers[j].unitPriceUsd,
          14 + j * 3,
          18.5 // flat target margin at quoting time — actual sourced margin varies once a vendor is selected
        );
      });

      insertActivity.run(
        rfqId,
        accountId,
        salesRepId,
        "Note",
        `Quote ${quoteNumber} issued against ${rfqNumber}.`,
        daysFromNow(-7 + i)
      );
    }

    // A lost RFQ's item numbers stay on record but are marked not converted.
    if (status === "Lost") {
      itemNumbersForRfq.forEach(({ id, itemNumber }) => {
        markItemNumberNotConverted.run(markAsNotConverted(itemNumber), id);
      });
    }

    const scenario = SUPPLIER_SCENARIOS_BY_RFQ_INDEX[i];
    if (scenario) {
      // Relative to this RFQ's own timeline (daysFromNow(-14 + i) creation),
      // not fixed calendar strings — fixed dates drift into the RFQ's past
      // as real time moves on, producing an arrival date before the RFQ
      // even existed.
      const dates = {
        sentDate: daysFromNow(-10 + i),
        receivedDate: daysFromNow(-3 + i),
        validUntil: daysFromNow(60 + i),
        selectedDate: daysFromNow(2 + i),
      };
      seedSuppliersForRfq(
        db,
        supplierIds,
        { rfqId, lineItems: lineItemsForSuppliers, quoteId, dates, nextInquiryNumber },
        scenario,
        LINE_ITEM_SOURCING_BY_RFQ_INDEX[i]
      );
    }

    rfqDataByIndex.push({ rfqId, quoteId, rfqNumber, lineItems: lineItemsForSuppliers, status });
  });

  // --- Seed one complete order end-to-end (Delta Ridge Mining Co, index 2) ---
  // Gives the Convert-to-Order and Expediting screens something real to show
  // immediately. Delta Ridge is single-vendor (both lines sourced from Ferro
  // Adriatica S.p.A. — see LINE_ITEM_SOURCING_BY_RFQ_INDEX[2] in
  // supplierFixtures.js), which keeps this one shipment simple.
  const deltaRidge = rfqDataByIndex[2];

  const freightInquiryId = insertFreightInquiry.run(
    nextFrqNumber(),
    deltaRidge.rfqId,
    freightForwarderIdByName["Mediterranean Freight Solutions"],
    daysFromNow(-30),
    "Quoted"
  ).lastInsertRowid;

  deltaRidge.lineItems.forEach((li) => {
    insertFreightInquiryLine.run(freightInquiryId, li.id);
  });

  const freightQuoteId = insertFreightQuote.run(
    freightInquiryId,
    "MFS-Q-4471",
    daysFromNow(-28),
    850,
    "EUR",
    18,
    daysFromNow(30),
    "Ocean freight — standard transit, most economical option"
  ).lastInsertRowid;

  // A second, competing freight quote for the SAME pickup location (Ferro
  // Adriatica), sent to a different forwarder — a genuine ocean-vs-air
  // tradeoff, so the Compare Freight Quotes screen has more than one row
  // to actually compare rather than a single-quote list.
  const secondFreightInquiryId = insertFreightInquiry.run(
    nextFrqNumber(),
    deltaRidge.rfqId,
    freightForwarderIdByName["Rheinland Express Cargo"],
    daysFromNow(-29),
    "Quoted"
  ).lastInsertRowid;

  deltaRidge.lineItems.forEach((li) => {
    insertFreightInquiryLine.run(secondFreightInquiryId, li.id);
  });

  insertFreightQuote.run(
    secondFreightInquiryId,
    "REC-Q-9931",
    daysFromNow(-27),
    2400,
    "EUR",
    4,
    daysFromNow(25),
    "Air freight — faster transit, premium pricing"
  );

  // Ferro Adriatica's ocean quote is the one actually in use (matches the
  // shipment's freight_quote_id below) — recorded as Selected so the RFQ
  // page and this new table agree; the air-freight quote stays available
  // for comparison, not deleted or hidden.
  insertFreightQuoteSelection.run(deltaRidge.rfqId, supplierIds[1], freightQuoteId, daysFromNow(-27));

  const deltaRidgeTotalValue = deltaRidge.lineItems.reduce(
    (sum, li) => sum + li.unitPriceUsd * li.quantity,
    0
  );
  const poId = insertPurchaseOrder.run(
    deltaRidge.quoteId,
    `PO-${poCounter++}`,
    "DR-2026-0472",
    daysFromNow(-3),
    deltaRidgeTotalValue
  ).lastInsertRowid;

  // pipeline_stage "Shipped" is deliberately picked so this order shows a mix
  // of completed and upcoming milestones, not an all-done or all-pending timeline.
  const orderId = insertOrder.run(poId, daysFromNow(-3), "Shipped").lastInsertRowid;

  const ferroSupplierId = supplierIds[1]; // Ferro Adriatica S.p.A. — see supplierFixtures.js SUPPLIERS[1]

  const sourcingPlaceholders = deltaRidge.lineItems.map(() => "?").join(",");
  const sourcingRows = db
    .prepare(
      `SELECT id, rfq_line_item_id FROM line_item_sourcing
       WHERE rfq_line_item_id IN (${sourcingPlaceholders}) AND status = 'Selected'`
    )
    .all(...deltaRidge.lineItems.map((li) => li.id));
  const sourcingIdByLineItemId = new Map(sourcingRows.map((r) => [r.rfq_line_item_id, r.id]));

  const orderLineItemIds = deltaRidge.lineItems.map(
    (li) => insertOrderLineItem.run(orderId, li.id, sourcingIdByLineItemId.get(li.id)).lastInsertRowid
  );

  const shipmentId = insertShipment.run(
    orderId,
    ferroSupplierId,
    "Mediterranean Freight Solutions",
    "MFS-IT-88213",
    "Ocean",
    "Genoa, Italy",
    "Lakeland, FL",
    daysFromNow(-16),
    daysFromNow(15),
    null,
    freightQuoteId
  ).lastInsertRowid;

  orderLineItemIds.forEach((orderLineItemId) => {
    insertShipmentLineItem.run(shipmentId, orderLineItemId);
  });

  // Three completed milestones, three upcoming — matches the "Shipped" stage above.
  const milestoneDetailsByType = {
    "Production": {
      estimated: daysFromNow(-25),
      actual: daysFromNow(-24),
      notes: "Production completed on schedule.",
    },
    "Ready for Pickup/FCA": {
      estimated: daysFromNow(-20),
      actual: daysFromNow(-19),
      notes: "Goods ready for pickup at Ferro's facility.",
    },
    "Transit to Port/Airport": {
      estimated: daysFromNow(-17),
      actual: daysFromNow(-16),
      notes: "Trucked to Genoa port.",
    },
    "Ocean/Air Transport": {
      estimated: daysFromNow(5),
      actual: null,
      notes: "In transit via ocean freight.",
    },
    "Customs Clearance": { estimated: daysFromNow(12), actual: null, notes: null },
    "Final Delivery": { estimated: daysFromNow(15), actual: null, notes: null },
  };
  MILESTONE_TYPES.forEach((type) => {
    const m = milestoneDetailsByType[type];
    insertShipmentMilestone.run(shipmentId, type, m.estimated, m.actual, m.notes);
  });

  insertExpeditingLogEntry.run(
    shipmentId,
    daysFromNow(-18),
    "Call",
    "Confirmed FCA pickup date with Ferro Adriatica's logistics desk.",
    null
  );
  insertExpeditingLogEntry.run(
    shipmentId,
    daysFromNow(-10),
    "Email",
    "Requested updated ETA from Mediterranean Freight Solutions.",
    daysFromNow(3)
  );

  const millCertificateFilename = saveShipmentDocument(
    Buffer.from("Fictional Mill Certificate -- sandbox test data only, not a real certification.\n"),
    "mill-certificate.txt"
  );
  insertShipmentDocument.run(
    shipmentId,
    "Mill Certificate",
    "mill-certificate.txt",
    millCertificateFilename,
    daysFromNow(-16)
  );

  // --- Seed one more RFQ: fully sourced (vendor + freight both selected)
  // but deliberately NOT yet quoted to the customer. Every RFQ seeded
  // above through the main loop gets a quote the moment it's created (see
  // "status !== 'New'" above), so none of them can ever reach the Create
  // Quote screen — this one exists specifically so that screen (and the
  // sell-price markup split) is reachable and clickable, not just
  // unit-tested. Kept outside the main loop rather than added to
  // fakeAccounts, since going through that loop would auto-create a quote
  // for any status other than "New."
  const meridianAccountId = insertAccount.run("Meridian Fabrication Works", "Marine", "US", "Active").lastInsertRowid;

  const meridianContactId = insertContact.run(
    meridianAccountId,
    "Derek Holt",
    "Procurement Manager",
    "d.holt@meridianfab-example.com",
    "+1 555 010 0007"
  ).lastInsertRowid;

  const meridianRfqNumber = `RFQ-${rfqCounter++}`;
  const meridianRfqId = insertRfq.run(
    meridianRfqNumber,
    meridianAccountId,
    meridianContactId,
    userIds[0],
    "Meridian Pipework Package",
    "Quoting",
    "Sourcing",
    daysFromNow(-5),
    daysFromNow(16),
    daysFromNow(50)
  ).lastInsertRowid;

  insertActivity.run(
    meridianRfqId,
    meridianAccountId,
    userIds[0],
    "Status Change",
    `RFQ ${meridianRfqNumber} created and assigned.`,
    daysFromNow(-5)
  );

  // Titanium fastener set + Moly ball valve — matches Hanul Precision
  // Metals' "Valves and fasteners" specialty below.
  const meridianCatalog = [catalogLines[2], catalogLines[3]];
  const meridianQuantities = [10, 20];
  const meridianLineItems = meridianCatalog.map((c, j) => {
    const lineId = insertRfqLine.run(
      meridianRfqId,
      materialIdByName[c.material],
      productFormIdByName[c.form],
      standardIdByCode[c.standard],
      c.description,
      meridianQuantities[j],
      c.unit,
      c.length_m
    ).lastInsertRowid;

    const itemNumber = buildItemNumber({
      formCode: formCodeForLineItem(c.form, c.description),
      materialCode: materialCodeForName(c.material),
      year: itemNumberYear,
      sequence: itemNumberSequence++,
    });
    insertItemNumber.run(
      itemNumber,
      lineId,
      productFormIdByName[c.form],
      materialIdByName[c.material],
      c.description,
      "Active",
      daysFromNow(-5)
    );

    return { id: lineId, quantity: meridianQuantities[j] };
  });

  // Reuses the same seeding helper the main loop uses — single vendor
  // (Hanul Precision Metals, South Korea), both lines Selected, no
  // customer quote passed in (quoteId: null), so no customer_quote_options
  // row gets created either.
  seedSuppliersForRfq(
    db,
    supplierIds,
    {
      rfqId: meridianRfqId,
      lineItems: meridianLineItems,
      quoteId: null,
      dates: {
        sentDate: daysFromNow(-4),
        receivedDate: daysFromNow(-2),
        validUntil: daysFromNow(55),
        selectedDate: daysFromNow(-1),
      },
      nextInquiryNumber,
    },
    [
      {
        supplierIndex: 2,
        outreachStatus: "Quoted",
        availability: "In Stock",
        leadTimeDays: 10,
        unitPrices: [95000, 145000],
        currency: "KRW",
        estimatedTransitDays: 20,
      },
    ],
    [2, 2]
  );

  const hanulSupplierId = supplierIds[2]; // Hanul Precision Metals — see supplierFixtures.js SUPPLIERS[2]

  const meridianFreightInquiryId = insertFreightInquiry.run(
    nextFrqNumber(),
    meridianRfqId,
    freightForwarderIdByName["Pacific Rim Ocean Carriers"],
    daysFromNow(-3),
    "Quoted"
  ).lastInsertRowid;

  meridianLineItems.forEach((li) => {
    insertFreightInquiryLine.run(meridianFreightInquiryId, li.id);
  });

  const meridianFreightQuoteId = insertFreightQuote.run(
    meridianFreightInquiryId,
    "PRO-Q-2201",
    daysFromNow(-2),
    520,
    "USD",
    20,
    daysFromNow(25),
    "Ocean freight — Busan to Lakeland, standard transit"
  ).lastInsertRowid;

  insertFreightQuoteSelection.run(meridianRfqId, hanulSupplierId, meridianFreightQuoteId, daysFromNow(-1));

  setSchemaVersion.run(SCHEMA_VERSION);
});

seedTransaction();
console.log("Seeded fictional CRM/RFQ test data.");
