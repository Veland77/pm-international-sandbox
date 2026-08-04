// src/db/connection.js
// Single place that knows how to open the database. Everything else imports from here.

const Database = require("better-sqlite3");

const DB_PATH = process.env.DATABASE_PATH || "./data/sandbox.db";

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

module.exports = { getDb, DB_PATH };
