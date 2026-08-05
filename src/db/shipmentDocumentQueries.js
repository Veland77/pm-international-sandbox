// src/db/shipmentDocumentQueries.js
// Reads and writes for shipment paperwork (packing lists, certificates,
// etc.). No confidentiality split needed here — see
// src/storage/shipmentDocumentStorage.js.

function getDocumentsForShipment(db, shipmentId) {
  return db.prepare("SELECT * FROM shipment_documents WHERE shipment_id = ? ORDER BY uploaded_date").all(shipmentId);
}

function getDocumentById(db, id) {
  return db.prepare("SELECT * FROM shipment_documents WHERE id = ?").get(id);
}

function createDocument(db, { shipmentId, docType, originalFilename, storedFilename }) {
  const uploadedDate = new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      "INSERT INTO shipment_documents (shipment_id, doc_type, original_filename, stored_filename, uploaded_date) VALUES (?, ?, ?, ?, ?)"
    )
    .run(shipmentId, docType, originalFilename, storedFilename, uploadedDate).lastInsertRowid;
}

module.exports = { getDocumentsForShipment, getDocumentById, createDocument };
