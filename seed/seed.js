// seed/seed.js
// Fills the sandbox database with fictional CRM/RFQ data only. Never point this at real PM data.
// Run with: npm run seed           (always reseeds)
//           npm run seed:if-empty  (only seeds if the database has no tables yet)

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");

const db = getDb();
const seedOnlyIfEmpty = process.argv.includes("--if-empty");

const tableCount = db
  .prepare("SELECT count(*) as n FROM sqlite_master WHERE type='table'")
  .get().n;

if (seedOnlyIfEmpty && tableCount > 0) {
  console.log("Database already has tables, skipping seed.");
  process.exit(0);
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
  { material: "Duplex Stainless Steel", form: "Pipe & Pipe Fittings", standard: "ASTM A790", description: '6" Duplex 2205 Seamless Pipe', unit: "FT" },
  { material: "Super Duplex Stainless Steel", form: "Flanges", standard: "ASME B16.5", description: '8" 300# Super Duplex Weld Neck Flange', unit: "EA" },
  { material: "Titanium", form: "Fasteners", standard: "MSS-SP-75", description: "Titanium Gr 2 Hex Bolt Set", unit: "EA" },
  { material: "6% Moly", form: "Valves", standard: "API 6D", description: '4" 6% Moly Ball Valve', unit: "EA" },
  { material: "Copper Nickel", form: "Tubing", standard: "EN 10204 3.1", description: '2" Copper Nickel 90/10 Tubing', unit: "FT" },
];

const rfqStatuses = ["New", "Quoting", "Quoted", "Won", "Lost"];

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
  INSERT INTO rfqs (rfq_number, account_id, contact_id, sales_rep_id, project_name, status, created_date, due_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertRfqLine = db.prepare(`
  INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, standard_id, description, quantity, unit)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertQuote = db.prepare(`
  INSERT INTO quotes (quote_number, rfq_id, version, status, created_date, valid_until)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertQuoteLine = db.prepare(`
  INSERT INTO quote_line_items (quote_id, rfq_line_item_id, unit_price_usd, lead_time_days, margin_pct)
  VALUES (?, ?, ?, ?, ?)
`);
const insertActivity = db.prepare(`
  INSERT INTO activities (rfq_id, account_id, user_id, activity_type, note, created_date)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const seedTransaction = db.transaction(() => {
  db.exec(`
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

  let rfqCounter = 1001;
  let quoteCounter = 5001;

  accountIds.forEach((accountId, i) => {
    const contactId = contactIdsByAccount[i][0];
    const salesRepId = userIds[i % userIds.length];
    const status = rfqStatuses[i % rfqStatuses.length];

    const rfqNumber = `RFQ-${rfqCounter++}`;
    const rfqId = insertRfq.run(
      rfqNumber,
      accountId,
      contactId,
      salesRepId,
      `${fakeAccounts[i].name.split(" ")[0]} Pipework Package`,
      status,
      daysFromNow(-14 + i),
      daysFromNow(7 + i)
    ).lastInsertRowid;

    // Give each RFQ 2-3 line items drawn from the material/product-form catalog.
    const lineCount = 2 + (i % 2);
    const rfqLineIds = [];
    for (let j = 0; j < lineCount; j++) {
      const c = catalogLines[(i + j) % catalogLines.length];
      const lineId = insertRfqLine.run(
        rfqId,
        materialIdByName[c.material],
        productFormIdByName[c.form],
        standardIdByCode[c.standard],
        c.description,
        (j + 1) * 10,
        c.unit
      ).lastInsertRowid;
      rfqLineIds.push(lineId);
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
    if (status !== "New") {
      const quoteNumber = `Q-${quoteCounter++}`;
      const quoteId = insertQuote.run(
        quoteNumber,
        rfqId,
        1,
        status === "Won" ? "Accepted" : status === "Lost" ? "Rejected" : "Sent",
        daysFromNow(-7 + i),
        daysFromNow(21 + i)
      ).lastInsertRowid;

      rfqLineIds.forEach((rfqLineId, j) => {
        insertQuoteLine.run(
          quoteId,
          rfqLineId,
          100 + j * 37.5,
          14 + j * 3,
          18.5
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
  });
});

seedTransaction();
console.log("Seeded fictional CRM/RFQ test data.");
