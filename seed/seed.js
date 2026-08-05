// seed/seed.js
// Fills the sandbox database with fictional CRM/RFQ data only. Never point this at real PM data.
// Run with: npm run seed           (always reseeds)
//           npm run seed:if-empty  (only seeds if the database has no tables yet)

const { getDb } = require("../src/db/connection");
const { SCHEMA, SCHEMA_VERSION } = require("../src/db/schema");
const { formCodeForLineItem, materialCodeForName, buildItemNumber, markAsNotConverted } = require("../src/db/itemNumbers");
const { SUPPLIERS, SUPPLIER_SCENARIOS_BY_RFQ_INDEX, LINE_ITEM_SOURCING_BY_RFQ_INDEX } = require("./supplierFixtures");
const { seedSuppliersForRfq } = require("./seedSuppliers");

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

// Child tables first, so dropping a table never leaves another table's
// foreign key pointing at something that no longer exists.
const TABLE_DROP_ORDER = [
  "customer_quote_options",
  "line_item_sourcing",
  "supplier_quote_line_items",
  "item_numbers",
  "quote_line_items",
  "supplier_inquiry_line_items",
  "supplier_quotes",
  "activities",
  "quotes",
  "rfq_line_items",
  "supplier_inquiries",
  "rfqs",
  "contacts",
  "suppliers",
  "accounts",
  "users",
  "materials",
  "product_forms",
  "standards",
  "currency_rates",
  "schema_meta",
];

if (anyTablesExist && needsReseed) {
  // Schema shape changed since this disk was last seeded. CREATE TABLE IF NOT
  // EXISTS won't add new columns to tables that already exist, so drop
  // everything and rebuild fresh — safe here since this is disposable
  // fictional demo data, never production data.
  console.log(`Schema changed (v${existingVersion} -> v${SCHEMA_VERSION}), dropping all tables before reseeding.`);
  TABLE_DROP_ORDER.forEach((name) => db.exec(`DROP TABLE IF EXISTS "${name}";`));
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

const seedTransaction = db.transaction(() => {
  db.exec(`
    DELETE FROM customer_quote_options; DELETE FROM line_item_sourcing;
    DELETE FROM supplier_quote_line_items;
    DELETE FROM supplier_quotes; DELETE FROM supplier_inquiry_line_items;
    DELETE FROM supplier_inquiries; DELETE FROM suppliers; DELETE FROM item_numbers;
    DELETE FROM currency_rates;
    DELETE FROM schema_meta;
    DELETE FROM activities; DELETE FROM quote_line_items; DELETE FROM quotes;
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

  fakeCurrencyRates.forEach((r) => {
    insertCurrencyRate.run(r.currency_code, r.rate_to_usd, r.as_of_date);
  });

  let rfqCounter = 1001;
  let quoteCounter = 5001;
  let inquiryCounter = 9001;
  let itemNumberSequence = 1;
  const itemNumberYear = new Date().getFullYear();

  // Generated the same way rfq_number is: a plain incrementing counter.
  function nextInquiryNumber() {
    return `INQ-${inquiryCounter++}`;
  }

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
  });

  setSchemaVersion.run(SCHEMA_VERSION);
});

seedTransaction();
console.log("Seeded fictional CRM/RFQ test data.");
