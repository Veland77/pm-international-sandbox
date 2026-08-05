// tests/attachmentStorage.test.js
// Pure filesystem tests for both attachment storage modules — no database
// involved, so this one actually runs locally.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-sandbox-attachments-"));
process.env.ATTACHMENTS_DIR = scratchDir;

const { saveRfqAttachment, getRfqAttachmentPath } = require("../src/storage/rfqAttachmentStorage");
const {
  saveSupplierInquiryAttachment,
  getSupplierInquiryAttachmentPath,
} = require("../src/storage/supplierInquiryAttachmentStorage");

test("saveRfqAttachment randomizes the filename and preserves the extension", () => {
  const stored = saveRfqAttachment(Buffer.from("hello"), "customer-po.pdf");
  assert.notEqual(stored, "customer-po.pdf");
  assert.match(stored, /\.pdf$/);
});

test("saveRfqAttachment content round-trips correctly", () => {
  const content = "test file content";
  const stored = saveRfqAttachment(Buffer.from(content), "notes.txt");
  const readBack = fs.readFileSync(getRfqAttachmentPath(stored), "utf8");
  assert.equal(readBack, content);
});

test("two uploads with the same original filename get different stored filenames", () => {
  const first = saveRfqAttachment(Buffer.from("a"), "duplicate.txt");
  const second = saveRfqAttachment(Buffer.from("b"), "duplicate.txt");
  assert.notEqual(first, second);
});

test("saveSupplierInquiryAttachment randomizes the filename and preserves the extension", () => {
  const stored = saveSupplierInquiryAttachment(Buffer.from("hello"), "vendor-spec.docx");
  assert.notEqual(stored, "vendor-spec.docx");
  assert.match(stored, /\.docx$/);
});

test("rfq and supplier-inquiry attachments are stored in separate directories", () => {
  const rfqStored = saveRfqAttachment(Buffer.from("x"), "a.txt");
  const supplierStored = saveSupplierInquiryAttachment(Buffer.from("x"), "a.txt");

  const rfqPath = getRfqAttachmentPath(rfqStored);
  const supplierPath = getSupplierInquiryAttachmentPath(supplierStored);

  assert.notEqual(path.dirname(rfqPath), path.dirname(supplierPath));
});

test.after(() => {
  fs.rmSync(scratchDir, { recursive: true, force: true });
});
