// tests/shipmentDocumentStorage.test.js
// Pure filesystem tests for shipment document storage — no database
// involved, so this one actually runs locally.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-sandbox-shipment-documents-"));
process.env.ATTACHMENTS_DIR = scratchDir;

const { saveShipmentDocument, getShipmentDocumentPath } = require("../src/storage/shipmentDocumentStorage");

test("saveShipmentDocument randomizes the filename and preserves the extension", () => {
  const stored = saveShipmentDocument(Buffer.from("hello"), "mill-cert.pdf");
  assert.notEqual(stored, "mill-cert.pdf");
  assert.match(stored, /\.pdf$/);
});

test("saveShipmentDocument content round-trips correctly", () => {
  const content = "certificate contents";
  const stored = saveShipmentDocument(Buffer.from(content), "cert.txt");
  const readBack = fs.readFileSync(getShipmentDocumentPath(stored), "utf8");
  assert.equal(readBack, content);
});

test("two uploads with the same original filename get different stored filenames", () => {
  const first = saveShipmentDocument(Buffer.from("a"), "duplicate.txt");
  const second = saveShipmentDocument(Buffer.from("b"), "duplicate.txt");
  assert.notEqual(first, second);
});

test.after(() => {
  fs.rmSync(scratchDir, { recursive: true, force: true });
});
