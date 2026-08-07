// tests/emailExtractionValidation.test.js
// Pure unit tests for sanitizeExtraction — the actual code enforcement of
// the non-negotiable "never silently trust a catalog match" rule, as
// opposed to just asking the model nicely in the prompt. These tests
// simulate a model that ignores its instructions (hallucinated ids,
// matched:true with no id, an id from a completely different catalog) to
// prove the sanitizer catches it regardless of what the AI actually says.

const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeExtraction } = require("../src/ai/emailExtractionValidation");

const CATALOG = {
  materials: [{ id: 1, name: "Titanium" }, { id: 2, name: "6% Moly" }],
  productForms: [{ id: 10, name: "Valves" }, { id: 11, name: "Fasteners" }],
  standards: [{ id: 100, code: "API 6D" }],
};

function baseLineItem(overrides = {}) {
  return {
    rawText: "raw",
    description: "desc",
    quantity: 5,
    unit: "EA",
    material: { asWritten: "Titanium", matched: true, id: 1 },
    productForm: { asWritten: "Valves", matched: true, id: 10 },
    standard: { asWritten: "API 6D", matched: true, id: 100 },
    missingInfo: [],
    ...overrides,
  };
}

test("sanitizeExtraction passes through a genuinely valid, catalog-matched line item unchanged", () => {
  const result = sanitizeExtraction({ sender: {}, lineItems: [baseLineItem()], subject: null, notes: [] }, CATALOG);
  assert.equal(result.lineItems[0].material.matched, true);
  assert.equal(result.lineItems[0].material.id, 1);
});

test("sanitizeExtraction forces a hallucinated id (not present in the live catalog) back to unmatched", () => {
  const result = sanitizeExtraction(
    { sender: {}, lineItems: [baseLineItem({ material: { asWritten: "Titanium", matched: true, id: 9999 } })], notes: [] },
    CATALOG
  );
  assert.equal(result.lineItems[0].material.matched, false);
  assert.equal(result.lineItems[0].material.id, null);
});

test("sanitizeExtraction forces matched:true with no id at all back to unmatched — never invents an id", () => {
  const result = sanitizeExtraction(
    { sender: {}, lineItems: [baseLineItem({ material: { asWritten: "Zirconium 702", matched: true, id: null } })], notes: [] },
    CATALOG
  );
  assert.equal(result.lineItems[0].material.matched, false);
  assert.equal(result.lineItems[0].material.id, null);
});

test("sanitizeExtraction respects an honest matched:false — id stays null, asWritten preserved for traceability", () => {
  const result = sanitizeExtraction(
    { sender: {}, lineItems: [baseLineItem({ material: { asWritten: "Zirconium 702", matched: false, id: null } })], notes: [] },
    CATALOG
  );
  assert.equal(result.lineItems[0].material.matched, false);
  assert.equal(result.lineItems[0].material.id, null);
  assert.equal(result.lineItems[0].material.asWritten, "Zirconium 702");
});

test("sanitizeExtraction independently sanitizes material, productForm, and standard — one field's problem doesn't affect the others", () => {
  const result = sanitizeExtraction(
    {
      sender: {},
      lineItems: [
        baseLineItem({
          material: { asWritten: "Hastelloy C276", matched: false, id: null },
          productForm: { asWritten: "Y-Strainer", matched: true, id: 777 }, // hallucinated id
          standard: { asWritten: "API 6D", matched: true, id: 100 }, // genuinely fine
        }),
      ],
      notes: [],
    },
    CATALOG
  );
  assert.equal(result.lineItems[0].material.matched, false);
  assert.equal(result.lineItems[0].productForm.matched, false);
  assert.equal(result.lineItems[0].productForm.id, null);
  assert.equal(result.lineItems[0].standard.matched, true);
  assert.equal(result.lineItems[0].standard.id, 100);
});

test("sanitizeExtraction treats a missing/malformed match object as unmatched rather than crashing", () => {
  const result = sanitizeExtraction({ sender: {}, lineItems: [baseLineItem({ material: undefined })], notes: [] }, CATALOG);
  assert.equal(result.lineItems[0].material.matched, false);
  assert.equal(result.lineItems[0].material.id, null);
  assert.equal(result.lineItems[0].material.asWritten, "");
});

test("sanitizeExtraction defends against a completely malformed top-level response — no lineItems array, no sender", () => {
  const result = sanitizeExtraction({}, CATALOG);
  assert.deepEqual(result.lineItems, []);
  assert.equal(result.sender.name, "");
  assert.equal(result.sender.email, "");
  assert.deepEqual(result.notes, []);
});

test("sanitizeExtraction preserves a null quantity (genuinely not stated) rather than coercing it to 0", () => {
  const result = sanitizeExtraction({ sender: {}, lineItems: [baseLineItem({ quantity: null, missingInfo: ["quantity"] })], notes: [] }, CATALOG);
  assert.equal(result.lineItems[0].quantity, null);
  assert.deepEqual(result.lineItems[0].missingInfo, ["quantity"]);
});

test("sanitizeExtraction drops a non-numeric quantity the model might have sent as a string", () => {
  const result = sanitizeExtraction({ sender: {}, lineItems: [baseLineItem({ quantity: "five" })], notes: [] }, CATALOG);
  assert.equal(result.lineItems[0].quantity, null);
});

test("sanitizeExtraction filters non-string entries out of notes rather than passing through garbage", () => {
  const result = sanitizeExtraction({ sender: {}, lineItems: [], notes: ["a real note", 42, null, "another note"] }, CATALOG);
  assert.deepEqual(result.notes, ["a real note", "another note"]);
});

test("sanitizeExtraction passes through subject when it's a string, and null otherwise", () => {
  const withSubject = sanitizeExtraction({ sender: {}, lineItems: [], subject: "RFQ — Site 4", notes: [] }, CATALOG);
  assert.equal(withSubject.subject, "RFQ — Site 4");

  const withoutSubject = sanitizeExtraction({ sender: {}, lineItems: [], subject: 12345, notes: [] }, CATALOG);
  assert.equal(withoutSubject.subject, null);
});
