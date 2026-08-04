// src/db/connection.js
// Single place that knows how to open the database. Everything else imports from here.

const Database = require("better-sqlite3");
const path = require("node:path");

const DB_PATH = process.env.DATABASE_PATH || "./data/sandbox.db";

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    // TEMPORARY diagnostic logging — remove once the table-not-found issue is resolved.
    console.log("DEBUG connection.js DB_PATH:", path.resolve(DB_PATH));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log("DEBUG connection.js tables:", tables.map((t) => t.name));
  }
  return db;
}

module.exports = { getDb, DB_PATH };
