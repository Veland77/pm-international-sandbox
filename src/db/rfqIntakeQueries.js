// src/db/rfqIntakeQueries.js
// Read helpers for the New RFQ form's dropdowns, plus the write path that
// creates an account/contact (if new), the RFQ, and its line items — all
// wrapped in one transaction so a failed write never leaves a partial RFQ.

const { formCodeForLineItem, materialCodeForName, buildItemNumber } = require("./itemNumbers");

function getFormOptions(db) {
  return {
    accounts: db.prepare("SELECT id, name FROM accounts ORDER BY name").all(),
    contacts: db.prepare("SELECT id, account_id, name, title FROM contacts ORDER BY name").all(),
    users: db.prepare("SELECT id, name, role FROM users ORDER BY name").all(),
    materials: db.prepare("SELECT id, name FROM materials ORDER BY name").all(),
    productForms: db.prepare("SELECT id, name FROM product_forms ORDER BY name").all(),
    standards: db.prepare("SELECT id, code, description FROM standards ORDER BY code").all(),
  };
}

// Existing rfq_number values look like "RFQ-1001" — take the highest
// trailing number and add one.
function getNextRfqNumber(db) {
  const rows = db.prepare("SELECT rfq_number FROM rfqs").all();
  const maxN = rows.reduce((max, r) => {
    const match = /(\d+)$/.exec(r.rfq_number);
    const n = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, n);
  }, 1000);
  return `RFQ-${maxN + 1}`;
}

// Same approach as getNextRfqNumber — existing job_number values look
// like "PM-100001", take the highest trailing number and add one. This is
// the stable, end-to-end reference for the deal (see schema.js's rfqs
// comment); rfq_number keeps being generated alongside it as the
// RFQ record's own internal sub-reference, unchanged.
//
// Base is 99999, not 100000, so the very first job_number ever assigned
// (on a genuinely empty rfqs table) comes out as PM-100000, matching
// seed.js's own first value — seed.js's counter literally starts at
// 100000 and is used as-is for RFQ #1, it doesn't add 1 to a prior max.
function getNextJobNumber(db) {
  const rows = db.prepare("SELECT job_number FROM rfqs").all();
  const maxN = rows.reduce((max, r) => {
    const match = /(\d+)$/.exec(r.job_number);
    const n = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, n);
  }, 99999);
  return `PM-${maxN + 1}`;
}

// item_numbers.id is a monotonically increasing, never-reused surrogate
// key, so it doubles as the traceability sequence — this continues cleanly
// from wherever the seed data (or prior form submissions) left off.
function getNextItemNumberSequence(db) {
  const row = db.prepare("SELECT COALESCE(MAX(id), 0) AS maxId FROM item_numbers").get();
  return row.maxId + 1;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function createRfqWithLineItems(db, input) {
  const insertAccount = db.prepare(
    "INSERT INTO accounts (name, industry_segment, region, account_status) VALUES (?, ?, ?, ?)"
  );
  const insertContact = db.prepare(
    "INSERT INTO contacts (account_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)"
  );
  const insertRfq = db.prepare(`
    INSERT INTO rfqs
      (rfq_number, job_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage,
       created_date, due_date, customer_requested_delivery_date)
    VALUES (?, ?, ?, ?, ?, ?, 'New', 'New', ?, ?, ?)
  `);
  const insertLineItem = db.prepare(`
    INSERT INTO rfq_line_items (rfq_id, material_id, product_form_id, standard_id, description, quantity, unit, length_m)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItemNumber = db.prepare(`
    INSERT INTO item_numbers (item_number, rfq_line_item_id, form_id, material_id, spec_summary, status, created_date)
    VALUES (?, ?, ?, ?, ?, 'Active', ?)
  `);

  const materialById = new Map(db.prepare("SELECT id, name FROM materials").all().map((m) => [m.id, m.name]));
  const productFormById = new Map(db.prepare("SELECT id, name FROM product_forms").all().map((f) => [f.id, f.name]));

  const run = db.transaction(() => {
    const accountId =
      input.accountMode === "new"
        ? insertAccount.run(
            input.newAccount.name,
            input.newAccount.industry_segment,
            input.newAccount.region,
            input.newAccount.account_status
          ).lastInsertRowid
        : input.accountId;

    const contactId =
      input.accountMode === "new"
        ? insertContact.run(
            accountId,
            input.newContact.name,
            input.newContact.title,
            input.newContact.email,
            input.newContact.phone
          ).lastInsertRowid
        : input.contactId;

    const rfqNumber = getNextRfqNumber(db);
    const jobNumber = getNextJobNumber(db);
    const today = todayDate();

    const rfqId = insertRfq.run(
      rfqNumber,
      jobNumber,
      accountId,
      contactId,
      input.salesRepId,
      input.projectName,
      today,
      input.dueDate,
      input.customerRequestedDeliveryDate
    ).lastInsertRowid;

    let itemNumberSequence = getNextItemNumberSequence(db);
    const itemNumberYear = new Date().getFullYear();

    input.lineItems.forEach((li) => {
      const lineId = insertLineItem.run(
        rfqId,
        li.materialId,
        li.productFormId,
        li.standardId,
        li.description,
        li.quantity,
        li.unit,
        li.lengthM
      ).lastInsertRowid;

      const materialName = materialById.get(li.materialId);
      const productFormName = productFormById.get(li.productFormId);
      const itemNumber = buildItemNumber({
        formCode: formCodeForLineItem(productFormName, li.description),
        materialCode: materialCodeForName(materialName),
        year: itemNumberYear,
        sequence: itemNumberSequence++,
      });

      insertItemNumber.run(itemNumber, lineId, li.productFormId, li.materialId, li.description, today);
    });

    return { rfqId, rfqNumber, jobNumber };
  });

  return run();
}

module.exports = {
  getFormOptions,
  getNextRfqNumber,
  getNextJobNumber,
  getNextItemNumberSequence,
  createRfqWithLineItems,
};
