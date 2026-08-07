// src/db/emailIntakeQueries.js
// Staging CRUD for AI Email Intake submissions, plus the contact-matching
// reads used to pre-select "existing contact" / "existing account, new
// contact" / "new account entirely" on the review screen. extracted_json
// is stored as a plain TEXT column (no JSON column type in SQLite) — this
// module owns the JSON.parse/stringify boundary so nothing else in the
// app has to know that detail.

function createEmailIntakeSubmission(db, { rawEmailText, extracted }) {
  const createdDate = new Date().toISOString().slice(0, 10);
  return db
    .prepare("INSERT INTO rfq_email_intake (raw_email_text, extracted_json, status, created_date) VALUES (?, ?, 'Pending Review', ?)")
    .run(rawEmailText || null, JSON.stringify(extracted), createdDate).lastInsertRowid;
}

function parseSubmissionRow(row) {
  if (!row) return null;
  return { ...row, extracted: JSON.parse(row.extracted_json) };
}

function getEmailIntakeSubmission(db, id) {
  return parseSubmissionRow(db.prepare("SELECT * FROM rfq_email_intake WHERE id = ?").get(id));
}

function listEmailIntakeSubmissions(db) {
  return db
    .prepare("SELECT * FROM rfq_email_intake ORDER BY id DESC")
    .all()
    .map(parseSubmissionRow);
}

function markEmailIntakeConfirmed(db, id, rfqId) {
  const confirmedDate = new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE rfq_email_intake SET status = 'Confirmed', confirmed_rfq_id = ?, confirmed_date = ? WHERE id = ?").run(
    rfqId,
    confirmedDate,
    id
  );
}

function markEmailIntakeDiscarded(db, id) {
  db.prepare("UPDATE rfq_email_intake SET status = 'Discarded' WHERE id = ?").run(id);
}

// Exact (case-insensitive) email match — the strongest signal, pre-selects
// "Use matched contact" on the review screen.
function findContactByEmail(db, email) {
  return db
    .prepare(
      `SELECT c.id AS contact_id, c.name AS contact_name, c.title AS contact_title,
              a.id AS account_id, a.name AS account_name
       FROM contacts c
       JOIN accounts a ON a.id = c.account_id
       WHERE LOWER(c.email) = LOWER(?)`
    )
    .get(email);
}

// No exact contact, but another contact at the same account shares this
// email's domain (e.g. a new buyer at a company PM already works with —
// see Email 9 in the AI Email Intake test fixtures: a new person at an
// existing account) — pre-selects "Existing account, new contact."
// Domain is taken as everything after the last "@"; a malformed email
// with no "@" at all just never matches anything here.
function findAccountByEmailDomain(db, email) {
  const domain = email.includes("@") ? email.slice(email.lastIndexOf("@") + 1) : null;
  if (!domain) return null;
  return db
    .prepare(
      `SELECT a.id AS account_id, a.name AS account_name
       FROM contacts c
       JOIN accounts a ON a.id = c.account_id
       WHERE LOWER(c.email) LIKE '%@' || LOWER(?)
       LIMIT 1`
    )
    .get(domain);
}

module.exports = {
  createEmailIntakeSubmission,
  getEmailIntakeSubmission,
  listEmailIntakeSubmissions,
  markEmailIntakeConfirmed,
  markEmailIntakeDiscarded,
  findContactByEmail,
  findAccountByEmailDomain,
};
