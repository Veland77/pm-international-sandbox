// tests/emailIntakeQueries.test.js
// Exercises AI Email Intake staging CRUD and contact-matching queries
// against a scratch SQLite database, never the real seed data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDbPath = path.join(os.tmpdir(), `pm-sandbox-email-intake-test-${process.pid}.db`);
process.env.DATABASE_PATH = scratchDbPath;

const { getDb } = require("../src/db/connection");
const { SCHEMA } = require("../src/db/schema");
const {
  createEmailIntakeSubmission,
  getEmailIntakeSubmission,
  listEmailIntakeSubmissions,
  markEmailIntakeConfirmed,
  markEmailIntakeDiscarded,
  findContactByEmail,
  findAccountByEmailDomain,
} = require("../src/db/emailIntakeQueries");

const db = getDb();
db.exec(SCHEMA);

const userId = db
  .prepare("INSERT INTO users (name, role, region) VALUES (?, ?, ?)")
  .run("Test Rep", "Inside Sales", "Test Region").lastInsertRowid;

const accountId = db
  .prepare("INSERT INTO accounts (name, industry_segment, region, account_status) VALUES (?, ?, ?, ?)")
  .run("Barrow Marine Fabrication", "Marine", "UK", "Active").lastInsertRowid;

const contactId = db
  .prepare("INSERT INTO contacts (account_id, name, title, email, phone) VALUES (?, ?, ?, ?, ?)")
  .run(accountId, "Ollie Bramwell", "Buyer", "o.bramwell@barrowmarine-example.com", "+44 1000 000002").lastInsertRowid;

const SAMPLE_EXTRACTED = {
  sender: { name: "Test Sender", email: "test@example.com", company: "Test Co", title: null },
  subject: "RFQ test",
  lineItems: [],
  notes: [],
};

let submissionId;

test("createEmailIntakeSubmission stores the raw text and JSON-serializes the extraction, defaulting to Pending Review", () => {
  submissionId = createEmailIntakeSubmission(db, { rawEmailText: "Hi, please quote...", extracted: SAMPLE_EXTRACTED });

  const row = db.prepare("SELECT * FROM rfq_email_intake WHERE id = ?").get(submissionId);
  assert.equal(row.raw_email_text, "Hi, please quote...");
  assert.equal(row.status, "Pending Review");
  assert.equal(JSON.parse(row.extracted_json).sender.name, "Test Sender");
});

test("createEmailIntakeSubmission accepts a null raw text for a screenshot-only submission", () => {
  const id = createEmailIntakeSubmission(db, { rawEmailText: null, extracted: SAMPLE_EXTRACTED });
  const row = db.prepare("SELECT raw_email_text FROM rfq_email_intake WHERE id = ?").get(id);
  assert.equal(row.raw_email_text, null);
});

test("getEmailIntakeSubmission parses extracted_json back into an object", () => {
  const submission = getEmailIntakeSubmission(db, submissionId);
  assert.equal(submission.extracted.sender.email, "test@example.com");
  assert.equal(submission.status, "Pending Review");
});

test("getEmailIntakeSubmission returns null for a submission that doesn't exist", () => {
  assert.equal(getEmailIntakeSubmission(db, 999999), null);
});

test("listEmailIntakeSubmissions returns every submission, newest first, each with extracted parsed", () => {
  const list = listEmailIntakeSubmissions(db);
  assert.ok(list.length >= 2);
  assert.ok(list[0].id > list[list.length - 1].id);
  assert.equal(list[0].extracted.sender.name, "Test Sender");
});

test("markEmailIntakeConfirmed sets status, confirmed_rfq_id, and confirmed_date", () => {
  const rfqId = db
    .prepare(
      `INSERT INTO rfqs (rfq_number, job_number, account_id, contact_id, sales_rep_id, project_name, status, pipeline_stage, created_date, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run("RFQ-TEST-EI", "PM-TEST-EI", accountId, contactId, userId, "Test Project", "New", "New", "2026-01-01", "2026-02-01")
    .lastInsertRowid;

  markEmailIntakeConfirmed(db, submissionId, rfqId);
  const row = db.prepare("SELECT * FROM rfq_email_intake WHERE id = ?").get(submissionId);
  assert.equal(row.status, "Confirmed");
  assert.equal(row.confirmed_rfq_id, rfqId);
  assert.ok(row.confirmed_date);
});

test("markEmailIntakeDiscarded sets status to Discarded", () => {
  const id = createEmailIntakeSubmission(db, { rawEmailText: "discard me", extracted: SAMPLE_EXTRACTED });
  markEmailIntakeDiscarded(db, id);
  const row = db.prepare("SELECT status FROM rfq_email_intake WHERE id = ?").get(id);
  assert.equal(row.status, "Discarded");
});

test("findContactByEmail matches case-insensitively and joins the account name", () => {
  const found = findContactByEmail(db, "O.BRAMWELL@barrowmarine-example.com");
  assert.equal(found.contact_id, contactId);
  assert.equal(found.account_name, "Barrow Marine Fabrication");
});

test("findContactByEmail returns undefined when no contact has that email", () => {
  assert.equal(findContactByEmail(db, "nobody@nowhere-example.com"), undefined);
});

test("findAccountByEmailDomain matches a new person at the same domain as an existing contact — the 'existing account, new contact' case", () => {
  const found = findAccountByEmailDomain(db, "s.whitcombe@barrowmarine-example.com");
  assert.equal(found.account_id, accountId);
  assert.equal(found.account_name, "Barrow Marine Fabrication");
});

test("findAccountByEmailDomain returns undefined for a domain nobody has ever used (a real query that found nothing), and null for a malformed email with no @ (never even queried)", () => {
  assert.equal(findAccountByEmailDomain(db, "someone@totally-unknown-example.com"), undefined);
  assert.equal(findAccountByEmailDomain(db, "not-an-email"), null);
});

test.after(() => {
  db.close();
  fs.rmSync(scratchDbPath, { force: true });
  fs.rmSync(`${scratchDbPath}-wal`, { force: true });
  fs.rmSync(`${scratchDbPath}-shm`, { force: true });
});
