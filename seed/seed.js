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
const { FRESH_RFQ_JOBS, SOURCED_NO_QUOTE_JOBS, PENDING_PO_ORDER_JOBS } = require("./additionalJobFixtures");
const { MILESTONE_TYPES } = require("../src/db/shipmentMilestoneTypes");
const { saveShipmentDocument } = require("../src/storage/shipmentDocumentStorage");
const { toUsd } = require("../src/db/orderSummary");

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
// used to build believable RFQ line items below. `key` is only used by the
// additional-jobs blocks near the end of this file (see catalogLineByKey) —
// adding it here doesn't change this array's order or length, so it can't
// affect the positional `catalogLines[(i + j) % catalogLines.length]" picks
// the main RFQ loop and the Meridian block already make above.
const catalogLines = [
  { key: "duplexPipe", material: "Duplex Stainless Steel", form: "Pipe & Pipe Fittings", standard: "ASTM A790", description: '6" Duplex 2205 Seamless Pipe', unit: "FT", length_m: 12.2 },
  { key: "superDuplexFlange", material: "Super Duplex Stainless Steel", form: "Flanges", standard: "ASME B16.5", description: '8" 300# Super Duplex Weld Neck Flange', unit: "EA", length_m: null },
  { key: "titaniumFasteners", material: "Titanium", form: "Fasteners", standard: "MSS-SP-75", description: "Titanium Gr 2 Hex Bolt Set", unit: "EA", length_m: null },
  { key: "molyValve", material: "6% Moly", form: "Valves", standard: "API 6D", description: '4" 6% Moly Ball Valve', unit: "EA", length_m: null },
  { key: "copperNickelTubing", material: "Copper Nickel", form: "Tubing", standard: "EN 10204 3.1", description: '2" Copper Nickel 90/10 Tubing', unit: "FT", length_m: 5.8 },
];

// Three more catalog entries, used only by the additional-jobs blocks near
// the end of this file — kept out of `catalogLines` itself so its length
// (and therefore the main loop's/Meridian's positional picks above) never
// changes. Uses materials/forms/standards already declared above that the
// original 5 catalog lines don't touch.
const additionalCatalogLines = [
  { key: "nickelRoundBar", material: "Nickel Alloys", form: "Round Bar", standard: "NORSOK M-650", description: "Alloy 625 Round Bar, NORSOK Qualified", unit: "FT", length_m: 6.0 },
  { key: "alloySteelPlate", material: "AISI 4130 Alloy Steel", form: "Plate & Sheet", standard: "EN 10204 3.1", description: '1" AISI 4130 Alloy Steel Plate, Q&T', unit: "EA", length_m: null },
  { key: "ss316Forging", material: "Stainless Steel 316", form: "Specialty Forgings", standard: "ASME B16.5", description: "Stainless Steel 316 Custom Forged Adapter", unit: "EA", length_m: null },
];

const catalogLineByKey = {};
[...catalogLines, ...additionalCatalogLines].forEach((c) => {
  catalogLineByKey[c.key] = c;
});

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

// Milestone-progress presets for the "Group 3" order jobs near the end of
// this file — each maps a milestone type to [estimatedOffsetDays,
// actualOffsetDays or null, notes or null], same shape as the Delta Ridge
// block's own milestoneDetailsByType above.
const MILESTONE_PRESETS_BY_STAGE = {
  early: {
    "Production": [-6, -5, "Production underway."],
    "Ready for Pickup/FCA": [2, null, null],
    "Transit to Port/Airport": [6, null, null],
    "Ocean/Air Transport": [20, null, null],
    "Customs Clearance": [27, null, null],
    "Final Delivery": [30, null, null],
  },
  mid: {
    "Production": [-25, -24, "Production completed on schedule."],
    "Ready for Pickup/FCA": [-20, -19, "Goods ready for pickup."],
    "Transit to Port/Airport": [-17, -16, "Trucked to port."],
    "Ocean/Air Transport": [5, null, "In transit."],
    "Customs Clearance": [12, null, null],
    "Final Delivery": [15, null, null],
  },
  late: {
    "Production": [-35, -34, "Production completed on schedule."],
    "Ready for Pickup/FCA": [-30, -29, "Goods ready for pickup."],
    "Transit to Port/Airport": [-27, -26, "Trucked to port."],
    "Ocean/Air Transport": [-10, -9, "Arrived at destination port."],
    "Customs Clearance": [-3, -2, "Cleared customs."],
    "Final Delivery": [2, null, "Final delivery scheduled."],
  },
  delivered: {
    "Production": [-45, -44, "Production completed on schedule."],
    "Ready for Pickup/FCA": [-40, -39, "Goods ready for pickup."],
    "Transit to Port/Airport": [-37, -36, "Trucked to port."],
    "Ocean/Air Transport": [-20, -19, "Arrived at destination port."],
    "Customs Clearance": [-12, -11, "Cleared customs."],
    "Final Delivery": [-5, -4, "Delivered and signed for."],
  },
};

const ORDER_PIPELINE_STAGE_BY_MILESTONE_STAGE = {
  early: "In Production",
  mid: "Shipped",
  late: "Shipped",
  delivered: "Delivered",
};

// When a multi-vendor order's shipments are at different points, the
// order's own single pipeline_stage reflects whichever vendor is furthest
// along — same as a real dispatcher would report the order overall.
const MILESTONE_STAGE_RANK = { early: 0, mid: 1, late: 2, delivered: 3 };

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
    (rfq_number, job_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage,
     created_date, due_date, customer_requested_delivery_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    DELETE FROM vendor_po_issuances;
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
    DELETE FROM customer_facing_attachments;
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
  // Used only by the Group 3 additional-jobs block below, to compute a
  // customer sell price that's always above the selected vendor's own
  // USD-converted buy cost — same conversion logic used live (toUsd).
  const rateMap = new Map(fakeCurrencyRates.map((r) => [r.currency_code, r.rate_to_usd]));

  let rfqCounter = 1001;
  let jobCounter = 100000;
  let quoteCounter = 5001;
  let inquiryCounter = 9001;
  let poCounter = 6001;
  let frqCounter = 7001;
  let itemNumberSequence = 1;
  const itemNumberYear = new Date().getFullYear();
  // Rotates the sales rep assignment across every job in the three
  // additional-jobs blocks below, independent of the main loop's own i-based assignment.
  let extraJobCounter = 0;

  // Generated the same way rfq_number is: a plain incrementing counter.
  function nextInquiryNumber() {
    return `INQ-${inquiryCounter++}`;
  }
  function nextFrqNumber() {
    return `FRQ-${frqCounter++}`;
  }
  // job_number: the stable, end-to-end reference for the deal — assigned
  // once per RFQ, same as rfq_number, in the same order it's created.
  function nextJobNumber() {
    return `PM-${jobCounter++}`;
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
    const jobNumber = nextJobNumber();
    const rfqId = insertRfq.run(
      rfqNumber,
      jobNumber,
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
  const meridianJobNumber = nextJobNumber();
  const meridianRfqId = insertRfq.run(
    meridianRfqNumber,
    meridianJobNumber,
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

  // --- Additional seed jobs (Group 1): fresh RFQs, nothing sent to any
  // vendor yet — ready for "New Sourcing Inquiry" to be clicked by hand.
  // See seed/additionalJobFixtures.js for the full list. Purely additive:
  // doesn't touch any account/RFQ created above.
  FRESH_RFQ_JOBS.forEach((job) => {
    const accountId = insertAccount.run(job.accountName, job.industry, job.region, job.accountStatus).lastInsertRowid;
    const contactId = insertContact.run(
      accountId, job.contact.name, job.contact.title, job.contact.email, job.contact.phone
    ).lastInsertRowid;
    const salesRepId = userIds[extraJobCounter % userIds.length];
    extraJobCounter++;

    const rfqNumber = `RFQ-${rfqCounter++}`;
    const jobNumber = nextJobNumber();
    const createdDate = daysFromNow(-3);
    const rfqId = insertRfq.run(
      rfqNumber,
      jobNumber,
      accountId,
      contactId,
      salesRepId,
      `${job.accountName.split(" ")[0]} ${job.projectSuffix}`,
      "New",
      "New",
      createdDate,
      daysFromNow(21),
      daysFromNow(55)
    ).lastInsertRowid;

    job.lines.forEach((line) => {
      const c = catalogLineByKey[line.key];
      const lineId = insertRfqLine.run(
        rfqId, materialIdByName[c.material], productFormIdByName[c.form], standardIdByCode[c.standard],
        c.description, line.quantity, c.unit, c.length_m
      ).lastInsertRowid;

      const itemNumber = buildItemNumber({
        formCode: formCodeForLineItem(c.form, c.description),
        materialCode: materialCodeForName(c.material),
        year: itemNumberYear,
        sequence: itemNumberSequence++,
      });
      insertItemNumber.run(
        itemNumber, lineId, productFormIdByName[c.form], materialIdByName[c.material], c.description, "Active", createdDate
      );
    });

    insertActivity.run(rfqId, accountId, salesRepId, "Status Change", `RFQ ${rfqNumber} created and assigned.`, createdDate);
  });

  // --- Additional seed jobs (Group 2): fully sourced (vendor + freight
  // selected), no customer quote yet — same state as the Meridian job
  // above, ready for repeated "Create Quote" practice.
  SOURCED_NO_QUOTE_JOBS.forEach((job) => {
    const accountId = insertAccount.run(job.accountName, job.industry, job.region, job.accountStatus).lastInsertRowid;
    const contactId = insertContact.run(
      accountId, job.contact.name, job.contact.title, job.contact.email, job.contact.phone
    ).lastInsertRowid;
    const salesRepId = userIds[extraJobCounter % userIds.length];
    extraJobCounter++;

    const rfqNumber = `RFQ-${rfqCounter++}`;
    const jobNumber = nextJobNumber();
    const createdDate = daysFromNow(-6);
    const rfqId = insertRfq.run(
      rfqNumber,
      jobNumber,
      accountId,
      contactId,
      salesRepId,
      `${job.accountName.split(" ")[0]} ${job.projectSuffix}`,
      "Quoting",
      "Sourcing",
      createdDate,
      daysFromNow(17),
      daysFromNow(50)
    ).lastInsertRowid;

    insertActivity.run(rfqId, accountId, salesRepId, "Status Change", `RFQ ${rfqNumber} created and assigned.`, createdDate);

    const lineItems = job.lines.map((line) => {
      const c = catalogLineByKey[line.key];
      const lineId = insertRfqLine.run(
        rfqId, materialIdByName[c.material], productFormIdByName[c.form], standardIdByCode[c.standard],
        c.description, line.quantity, c.unit, c.length_m
      ).lastInsertRowid;

      const itemNumber = buildItemNumber({
        formCode: formCodeForLineItem(c.form, c.description),
        materialCode: materialCodeForName(c.material),
        year: itemNumberYear,
        sequence: itemNumberSequence++,
      });
      insertItemNumber.run(
        itemNumber, lineId, productFormIdByName[c.form], materialIdByName[c.material], c.description, "Active", createdDate
      );

      return { id: lineId, quantity: line.quantity };
    });

    seedSuppliersForRfq(
      db,
      supplierIds,
      {
        rfqId,
        lineItems,
        quoteId: null,
        dates: {
          sentDate: daysFromNow(-5),
          receivedDate: daysFromNow(-3),
          validUntil: daysFromNow(55),
          selectedDate: daysFromNow(-1),
        },
        nextInquiryNumber,
      },
      [
        {
          supplierIndex: job.supplierIndex,
          outreachStatus: "Quoted",
          availability: job.availability,
          leadTimeDays: job.leadTimeDays,
          unitPrices: job.unitPrices,
          currency: job.currency,
          estimatedTransitDays: job.estimatedTransitDays,
        },
      ],
      lineItems.map(() => job.supplierIndex)
    );

    const freightInquiryId = insertFreightInquiry.run(
      nextFrqNumber(), rfqId, freightForwarderIdByName[job.freightForwarderName], daysFromNow(-4), "Quoted"
    ).lastInsertRowid;
    lineItems.forEach((li) => insertFreightInquiryLine.run(freightInquiryId, li.id));

    const freightQuoteId = insertFreightQuote.run(
      freightInquiryId,
      job.freightQuoteRef,
      daysFromNow(-3),
      job.freightPrice,
      job.freightCurrency,
      job.freightTransitDays,
      daysFromNow(30),
      job.freightNotes
    ).lastInsertRowid;

    insertFreightQuoteSelection.run(rfqId, supplierIds[job.supplierIndex], freightQuoteId, daysFromNow(-1));
  });

  // --- Additional seed jobs (Group 3): quoted, PO received, converted to
  // an Order — with at least one vendor's PO not yet generated (seed.js
  // never writes to vendor_po_issuances; only the app's own "Generate
  // Purchase Order" button does), ready for repeated practice with that
  // action. Mirrors the Delta Ridge order built above, generalized to
  // support more than one vendor per order (see additionalJobFixtures.js).
  PENDING_PO_ORDER_JOBS.forEach((job) => {
    const accountId = insertAccount.run(job.accountName, job.industry, job.region, job.accountStatus).lastInsertRowid;
    const contactId = insertContact.run(
      accountId, job.contact.name, job.contact.title, job.contact.email, job.contact.phone
    ).lastInsertRowid;
    const salesRepId = userIds[extraJobCounter % userIds.length];
    extraJobCounter++;

    const rfqNumber = `RFQ-${rfqCounter++}`;
    const jobNumber = nextJobNumber();
    const createdDate = daysFromNow(job.createdOffsetDays);
    const rfqId = insertRfq.run(
      rfqNumber,
      jobNumber,
      accountId,
      contactId,
      salesRepId,
      `${job.accountName.split(" ")[0]} ${job.projectSuffix}`,
      "Won",
      "Closed",
      createdDate,
      daysFromNow(job.createdOffsetDays + 20),
      daysFromNow(job.createdOffsetDays + 35)
    ).lastInsertRowid;

    insertActivity.run(rfqId, accountId, salesRepId, "Status Change", `RFQ ${rfqNumber} created and assigned.`, createdDate);

    // Flattened, RFQ-wide line item order (job.lines) — each line records
    // which vendor wins it (line.wins); every vendor in job.vendors quotes
    // a price for every line (see additionalJobFixtures.js comment).
    const lineItems = job.lines.map((line) => {
      const c = catalogLineByKey[line.key];
      const lineId = insertRfqLine.run(
        rfqId, materialIdByName[c.material], productFormIdByName[c.form], standardIdByCode[c.standard],
        c.description, line.quantity, c.unit, c.length_m
      ).lastInsertRowid;

      const itemNumber = buildItemNumber({
        formCode: formCodeForLineItem(c.form, c.description),
        materialCode: materialCodeForName(c.material),
        year: itemNumberYear,
        sequence: itemNumberSequence++,
      });
      insertItemNumber.run(
        itemNumber, lineId, productFormIdByName[c.form], materialIdByName[c.material], c.description, "Active", createdDate
      );

      return { id: lineId, quantity: line.quantity, wins: line.wins };
    });

    // Customer sell price is always derived from the WINNING vendor's own
    // USD-converted buy cost (never the comparison-only prices from a
    // non-winning vendor) with a flat ~25% markup on top — guarantees sell
    // price lands above cost price on every line, rather than risking a
    // hand-picked number landing below it.
    const quoteNumber = `Q-${quoteCounter++}`;
    const quoteSentDate = daysFromNow(job.quoteSentOffsetDays);
    const quoteId = insertQuote.run(
      quoteNumber, rfqId, 1, "Accepted", quoteSentDate, daysFromNow(job.quoteSentOffsetDays + 30), daysFromNow(job.quoteSentOffsetDays + 25)
    ).lastInsertRowid;
    lineItems.forEach((li, j) => {
      const winningVendor = job.vendors.find((v) => v.supplierIndex === li.wins);
      const buyUsd = toUsd(winningVendor.unitPrices[j], winningVendor.currency, rateMap);
      const sellPriceUsd = Math.round(buyUsd * 1.25 * 100) / 100;
      insertQuoteLine.run(quoteId, li.id, sellPriceUsd, winningVendor.leadTimeDays, 18.5);
      li.sellPriceUsd = sellPriceUsd;
    });
    insertActivity.run(rfqId, accountId, salesRepId, "Note", `Quote ${quoteNumber} issued against ${rfqNumber}.`, quoteSentDate);

    // One scenario entry per vendor — each quotes every line in `lineItems`
    // (some are comparison-only), matching how seedSuppliersForRfq already
    // works for the existing multi-vendor Barrow job above.
    const scenario = job.vendors.map((vendor) => ({
      supplierIndex: vendor.supplierIndex,
      outreachStatus: "Quoted",
      availability: vendor.availability,
      leadTimeDays: vendor.leadTimeDays,
      unitPrices: vendor.unitPrices,
      currency: vendor.currency,
      estimatedTransitDays: vendor.estimatedTransitDays,
    }));
    const sourcingSpec = lineItems.map((li) => li.wins);

    seedSuppliersForRfq(
      db,
      supplierIds,
      {
        rfqId,
        lineItems,
        quoteId,
        dates: {
          sentDate: quoteSentDate,
          receivedDate: daysFromNow(job.quoteSentOffsetDays + 3),
          validUntil: daysFromNow(job.quoteSentOffsetDays + 60),
          selectedDate: daysFromNow(job.quoteSentOffsetDays + 5),
        },
        nextInquiryNumber,
      },
      scenario,
      sourcingSpec
    );

    const totalValue = lineItems.reduce((sum, li) => sum + li.sellPriceUsd * li.quantity, 0);
    const poId = insertPurchaseOrder.run(
      quoteId, `PO-${poCounter++}`, job.customerPoReference, daysFromNow(job.poReceivedOffsetDays), totalValue
    ).lastInsertRowid;

    // The order's own pipeline_stage reflects whichever vendor is furthest
    // along, for a multi-vendor order (see MILESTONE_STAGE_RANK above).
    const furthestVendor = job.vendors.reduce((a, b) =>
      MILESTONE_STAGE_RANK[b.milestoneStage] > MILESTONE_STAGE_RANK[a.milestoneStage] ? b : a
    );
    const orderId = insertOrder.run(
      poId, daysFromNow(job.poReceivedOffsetDays), ORDER_PIPELINE_STAGE_BY_MILESTONE_STAGE[furthestVendor.milestoneStage]
    ).lastInsertRowid;

    const lineItemIds = lineItems.map((li) => li.id);
    const sourcingPlaceholders = lineItemIds.map(() => "?").join(",");
    const sourcingRows = db
      .prepare(
        `SELECT id, rfq_line_item_id FROM line_item_sourcing
         WHERE rfq_line_item_id IN (${sourcingPlaceholders}) AND status = 'Selected'`
      )
      .all(...lineItemIds);
    const sourcingIdByLineItemId = new Map(sourcingRows.map((r) => [r.rfq_line_item_id, r.id]));

    const orderLineItemIdByLineItemId = new Map(
      lineItems.map((li) => [li.id, insertOrderLineItem.run(orderId, li.id, sourcingIdByLineItemId.get(li.id)).lastInsertRowid])
    );

    // One shipment per vendor — each covers only the lines that vendor
    // actually won.
    job.vendors.forEach((vendor) => {
      const vendorSupplierId = supplierIds[vendor.supplierIndex];
      const vendorLineItems = lineItems.filter((li) => li.wins === vendor.supplierIndex);

      const freightInquiryId = insertFreightInquiry.run(
        nextFrqNumber(), rfqId, freightForwarderIdByName[vendor.freightForwarderName], quoteSentDate, "Quoted"
      ).lastInsertRowid;
      vendorLineItems.forEach((li) => insertFreightInquiryLine.run(freightInquiryId, li.id));

      const freightQuoteId = insertFreightQuote.run(
        freightInquiryId,
        vendor.freightQuoteRef,
        daysFromNow(job.quoteSentOffsetDays + 2),
        vendor.freightPrice,
        vendor.freightCurrency,
        vendor.freightTransitDays,
        daysFromNow(job.quoteSentOffsetDays + 60),
        vendor.freightNotes
      ).lastInsertRowid;

      insertFreightQuoteSelection.run(rfqId, vendorSupplierId, freightQuoteId, daysFromNow(job.quoteSentOffsetDays + 5));

      const preset = MILESTONE_PRESETS_BY_STAGE[vendor.milestoneStage];
      const shipmentId = insertShipment.run(
        orderId,
        vendorSupplierId,
        vendor.freightForwarderName,
        vendor.trackingNumber,
        "Ocean",
        vendor.originCity,
        "Lakeland, FL",
        daysFromNow(preset["Transit to Port/Airport"][0]),
        daysFromNow(preset["Final Delivery"][0]),
        vendor.milestoneStage === "delivered" ? daysFromNow(preset["Final Delivery"][1]) : null,
        freightQuoteId
      ).lastInsertRowid;

      vendorLineItems.forEach((li) => {
        insertShipmentLineItem.run(shipmentId, orderLineItemIdByLineItemId.get(li.id));
      });

      MILESTONE_TYPES.forEach((type) => {
        const [estOffset, actualOffset, notes] = preset[type];
        insertShipmentMilestone.run(
          shipmentId, type, daysFromNow(estOffset), actualOffset == null ? null : daysFromNow(actualOffset), notes
        );
      });
    });
  });

  setSchemaVersion.run(SCHEMA_VERSION);
});

seedTransaction();
console.log("Seeded fictional CRM/RFQ test data.");
