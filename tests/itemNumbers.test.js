// tests/itemNumbers.test.js
// Pure unit tests for item-number generation — no database involved.

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formCodeForLineItem,
  materialCodeForName,
  buildItemNumber,
  markAsNotConverted,
} = require("../src/db/itemNumbers");

test("formCodeForLineItem maps direct product forms", () => {
  assert.equal(formCodeForLineItem("Flanges", '8" 300# Weld Neck Flange'), "FL");
  assert.equal(formCodeForLineItem("Valves", '4" Ball Valve'), "VL");
  assert.equal(formCodeForLineItem("Fasteners", "Hex Bolt Set"), "FS");
  assert.equal(formCodeForLineItem("Tubing", '2" Tubing'), "TB");
  assert.equal(formCodeForLineItem("Round Bar", '1" Round Bar'), "RB");
  assert.equal(formCodeForLineItem("Plate & Sheet", "10mm Plate"), "PL");
  assert.equal(formCodeForLineItem("Specialty Forgings", "Custom Forging"), "FG");
});

test("formCodeForLineItem splits Pipe & Pipe Fittings by description keyword", () => {
  assert.equal(formCodeForLineItem("Pipe & Pipe Fittings", '6" Duplex 2205 Seamless Pipe'), "SP");
  assert.equal(formCodeForLineItem("Pipe & Pipe Fittings", '6" Welded Pipe'), "WP");
  assert.equal(formCodeForLineItem("Pipe & Pipe Fittings", "90-degree Elbow Fitting"), "FT");
  assert.equal(formCodeForLineItem("Pipe & Pipe Fittings", "Unlabeled description"), "SP");
});

test("formCodeForLineItem throws for an unmapped product form", () => {
  assert.throws(() => formCodeForLineItem("Something Unknown", "x"));
});

test("materialCodeForName maps known materials", () => {
  assert.equal(materialCodeForName("Duplex Stainless Steel"), "DX22");
  assert.equal(materialCodeForName("Titanium"), "TI2");
  assert.equal(materialCodeForName("Stainless Steel 316"), "SS316");
});

test("materialCodeForName throws for an unmapped material", () => {
  assert.throws(() => materialCodeForName("Unobtainium"));
});

test("buildItemNumber assembles the expected format", () => {
  assert.equal(
    buildItemNumber({ formCode: "SP", materialCode: "DX22", year: 2026, sequence: 42 }),
    "SP-DX22-26-00042"
  );
});

test("markAsNotConverted appends X once", () => {
  assert.equal(markAsNotConverted("SP-DX22-26-00042"), "SP-DX22-26-00042X");
  assert.equal(markAsNotConverted("SP-DX22-26-00042X"), "SP-DX22-26-00042X");
});
