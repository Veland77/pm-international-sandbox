// src/storage/shipmentDocumentStorage.js
// Filesystem storage for shipment paperwork (packing lists, certificates,
// etc.) as QA attaches them. Own directory, same randomized-filename
// pattern as the earlier attachment work. No confidentiality split needed
// here — this isn't customer- or supplier-facing, just internal order
// paperwork, so unlike rfq/supplier-inquiry attachments this is one plain
// module, not a duplicated pair.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || "./data/attachments";
const SHIPMENT_DOCUMENTS_DIR = path.join(ATTACHMENTS_DIR, "shipment-documents");

fs.mkdirSync(SHIPMENT_DOCUMENTS_DIR, { recursive: true });

function saveShipmentDocument(buffer, originalFilename) {
  const storedFilename = `${crypto.randomBytes(16).toString("hex")}${path.extname(originalFilename)}`;
  fs.writeFileSync(path.join(SHIPMENT_DOCUMENTS_DIR, storedFilename), buffer);
  return storedFilename;
}

function getShipmentDocumentPath(storedFilename) {
  return path.join(SHIPMENT_DOCUMENTS_DIR, storedFilename);
}

module.exports = { saveShipmentDocument, getShipmentDocumentPath };
