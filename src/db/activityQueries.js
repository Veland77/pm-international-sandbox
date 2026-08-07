// src/db/activityQueries.js
// Minimal write helper for the activities log. Nothing in src/ wrote to
// this table before AI Email Intake (only seed.js, directly) — pulled out
// as its own small module since logging an activity is a generic enough
// concept that other features will likely want it too, not something
// specific to email intake.

function createActivity(db, { rfqId, accountId, userId, activityType, note }) {
  const createdDate = new Date().toISOString().slice(0, 10);
  return db
    .prepare("INSERT INTO activities (rfq_id, account_id, user_id, activity_type, note, created_date) VALUES (?, ?, ?, ?, ?, ?)")
    .run(rfqId || null, accountId, userId, activityType, note, createdDate).lastInsertRowid;
}

module.exports = { createActivity };
