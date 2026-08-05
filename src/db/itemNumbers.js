// src/db/itemNumbers.js
// Builds and updates traceability item numbers: {FORM}-{MATERIAL}-{YY}-{SEQUENCE}
// Pure string/lookup logic only — no database access — so it's testable on its own.

const FORM_CODE_BY_PRODUCT_FORM = {
  "Plate & Sheet": "PL",
  Tubing: "TB",
  "Round Bar": "RB",
  Flanges: "FL",
  Fasteners: "FS",
  Valves: "VL",
  "Specialty Forgings": "FG",
};

// "Pipe & Pipe Fittings" covers three of the ten form codes (Seamless Pipe,
// Welded Pipe, Fitting), so it's split further by keyword in the description.
function formCodeForLineItem(productFormName, description) {
  if (productFormName in FORM_CODE_BY_PRODUCT_FORM) {
    return FORM_CODE_BY_PRODUCT_FORM[productFormName];
  }

  if (productFormName === "Pipe & Pipe Fittings") {
    const text = description.toLowerCase();
    if (text.includes("fitting")) return "FT";
    if (text.includes("welded")) return "WP";
    return "SP";
  }

  throw new Error(`No item-number form code mapped for product form "${productFormName}"`);
}

const MATERIAL_CODE_BY_NAME = {
  "Duplex Stainless Steel": "DX22",
  "Super Duplex Stainless Steel": "SD25",
  "6% Moly": "6MO",
  Titanium: "TI2",
  "Copper Nickel": "CN9010",
  "Nickel Alloys": "NI200",
  "AISI 4130 Alloy Steel": "A4130",
  "Stainless Steel 316": "SS316",
};

function materialCodeForName(materialName) {
  const code = MATERIAL_CODE_BY_NAME[materialName];
  if (!code) {
    throw new Error(`No item-number material code mapped for material "${materialName}"`);
  }
  return code;
}

function buildItemNumber({ formCode, materialCode, year, sequence }) {
  const yy = String(year).slice(-2);
  const seq = String(sequence).padStart(5, "0");
  return `${formCode}-${materialCode}-${yy}-${seq}`;
}

// Marks a lost item's number as not converted: 00042 becomes 00042X.
function markAsNotConverted(itemNumber) {
  return itemNumber.endsWith("X") ? itemNumber : `${itemNumber}X`;
}

module.exports = {
  formCodeForLineItem,
  materialCodeForName,
  buildItemNumber,
  markAsNotConverted,
};
