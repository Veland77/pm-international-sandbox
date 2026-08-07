// src/ai/emailExtractionValidation.js
// The second, independent layer of defense behind the non-negotiable
// "never silently guess a catalog match" rule. emailExtractionPrompt.js
// asks the model not to guess, and constrains its tool schema to only the
// catalog's own ids — but this module never trusts that either: every
// claimed material/productForm/standard id is re-checked here against the
// SAME live catalog lists, and anything that isn't genuinely present
// (including a hallucinated id, or matched: true with no real id) gets
// forced back to unmatched. Pure data in, pure data out — no DB, no
// network — so this is directly unit-testable, and it's the one place in
// the whole feature actually enforcing the rule in code rather than
// just asking the model nicely.

function sanitizeMatch(match, validIds) {
  if (!match || typeof match !== "object") {
    return { asWritten: "", matched: false, id: null };
  }
  const idIsValid = match.id != null && validIds.has(match.id);
  return {
    asWritten: typeof match.asWritten === "string" ? match.asWritten : "",
    matched: Boolean(match.matched) && idIsValid,
    id: Boolean(match.matched) && idIsValid ? match.id : null,
  };
}

// raw: the AI's parsed tool_use input, already shaped like
// emailExtractionPrompt.js's schema — but treated as untrusted input here,
// not assumed to be well-formed.
// catalog: { materials: [{id,name}], productForms: [{id,name}], standards: [{id,code,description}] }
// — the SAME live catalog rows the prompt was built from, fetched fresh.
function sanitizeExtraction(raw, catalog) {
  const materialIds = new Set(catalog.materials.map((m) => m.id));
  const productFormIds = new Set(catalog.productForms.map((f) => f.id));
  const standardIds = new Set(catalog.standards.map((s) => s.id));

  const sender = (raw && raw.sender) || {};
  const lineItems = raw && Array.isArray(raw.lineItems) ? raw.lineItems : [];
  const notes = raw && Array.isArray(raw.notes) ? raw.notes : [];

  return {
    sender: {
      name: typeof sender.name === "string" ? sender.name : "",
      email: typeof sender.email === "string" ? sender.email : "",
      company: typeof sender.company === "string" ? sender.company : null,
      title: typeof sender.title === "string" ? sender.title : null,
    },
    subject: raw && typeof raw.subject === "string" ? raw.subject : null,
    lineItems: lineItems.map((li) => ({
      rawText: typeof li.rawText === "string" ? li.rawText : "",
      description: typeof li.description === "string" ? li.description : "",
      quantity: typeof li.quantity === "number" && Number.isFinite(li.quantity) ? li.quantity : null,
      unit: typeof li.unit === "string" ? li.unit : null,
      material: sanitizeMatch(li.material, materialIds),
      productForm: sanitizeMatch(li.productForm, productFormIds),
      standard: sanitizeMatch(li.standard, standardIds),
      missingInfo: Array.isArray(li.missingInfo) ? li.missingInfo.filter((m) => typeof m === "string") : [],
    })),
    notes: notes.filter((n) => typeof n === "string"),
  };
}

module.exports = { sanitizeExtraction };
