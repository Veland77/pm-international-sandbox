// tests/emailExtractionPrompt.test.js
// Pure unit tests for the AI Email Intake prompt/schema builder — no
// network, no database. The most important thing this file checks isn't
// grammar, it's that the non-negotiable "never guess a catalog match"
// rule is actually present in the text sent to the model, and that the
// tool schema structurally can't represent "matched with no real id" or
// an id outside the live catalog.

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSystemPrompt, buildExtractionToolSchema, buildCatalogMatchSchema } = require("../src/ai/emailExtractionPrompt");

const CATALOG = {
  materials: [{ id: 1, name: "Titanium" }, { id: 2, name: "6% Moly" }],
  productForms: [{ id: 10, name: "Valves" }, { id: 11, name: "Fasteners" }],
  standards: [{ id: 100, code: "API 6D", description: "Specification for Pipeline Valves" }],
};

test("buildSystemPrompt includes the non-negotiable never-guess rule explicitly", () => {
  const prompt = buildSystemPrompt(CATALOG);
  assert.match(prompt, /never guess/i);
  assert.match(prompt, /matched: false/);
  assert.match(prompt, /id: null/);
});

test("buildSystemPrompt lists every catalog material, product form, and standard by name/code", () => {
  const prompt = buildSystemPrompt(CATALOG);
  assert.match(prompt, /Titanium/);
  assert.match(prompt, /6% Moly/);
  assert.match(prompt, /Valves/);
  assert.match(prompt, /Fasteners/);
  assert.match(prompt, /API 6D/);
});

test("buildSystemPrompt instructs not to guess a missing quantity", () => {
  const prompt = buildSystemPrompt(CATALOG);
  assert.match(prompt, /do not guess a quantity/i);
});

test("buildCatalogMatchSchema's id enum is exactly the given ids plus null — nothing else is a valid value", () => {
  const schema = buildCatalogMatchSchema([1, 2, 3]);
  assert.deepEqual(schema.properties.id.enum, [1, 2, 3, null]);
});

test("buildExtractionToolSchema constrains each line item's material/productForm/standard id enum to that catalog's own ids", () => {
  const tool = buildExtractionToolSchema(CATALOG);
  const lineItemSchema = tool.input_schema.properties.lineItems.items.properties;
  assert.deepEqual(lineItemSchema.material.properties.id.enum, [1, 2, null]);
  assert.deepEqual(lineItemSchema.productForm.properties.id.enum, [10, 11, null]);
  assert.deepEqual(lineItemSchema.standard.properties.id.enum, [100, null]);
});

test("buildExtractionToolSchema forces tool_choice-compatible shape: a fixed name matching the schema", () => {
  const tool = buildExtractionToolSchema(CATALOG);
  assert.equal(tool.name, "record_rfq_extraction");
  assert.equal(tool.input_schema.type, "object");
  assert.deepEqual(tool.input_schema.required, ["sender", "lineItems", "subject", "notes"]);
});

test("buildExtractionToolSchema handles an empty catalog without crashing — enum is just [null]", () => {
  const tool = buildExtractionToolSchema({ materials: [], productForms: [], standards: [] });
  assert.deepEqual(tool.input_schema.properties.lineItems.items.properties.material.properties.id.enum, [null]);
});
