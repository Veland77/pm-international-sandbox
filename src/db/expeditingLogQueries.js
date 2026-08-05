// src/db/expeditingLogQueries.js
// Reads and writes for a shipment's running contact log. Newest first, per
// schema.js's comment on expediting_log.

function getLogEntriesForShipment(db, shipmentId) {
  return db
    .prepare("SELECT * FROM expediting_log WHERE shipment_id = ? ORDER BY entry_date DESC, id DESC")
    .all(shipmentId);
}

function createLogEntry(db, { shipmentId, contactType, note, followUpDate }) {
  const entryDate = new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      "INSERT INTO expediting_log (shipment_id, entry_date, contact_type, note, follow_up_date) VALUES (?, ?, ?, ?, ?)"
    )
    .run(shipmentId, entryDate, contactType, note, followUpDate || null).lastInsertRowid;
}

module.exports = { getLogEntriesForShipment, createLogEntry };
