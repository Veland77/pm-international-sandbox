// src/ai/emailExtractionPrompt.js
// Builds the system prompt and the forced tool-use JSON schema for AI
// Email Intake extraction. Pure string/object building only — no network
// access, no DB access (the live catalog is passed in already fetched),
// so this is directly unit-testable. The one non-negotiable rule from the
// feature spec — never guess a catalog match, always flag unmatched
// instead — is written directly into the prompt text here, not left as
// an implicit assumption. emailExtractionValidation.js is the second,
// independent layer of defense: even if this prompt somehow failed to
// stop a bad guess, that module re-checks every claimed id against the
// live catalog and discards anything that isn't really there.

// One shared shape for material/productForm/standard matches — asWritten
// preserves the customer's own wording regardless of match outcome,
// which is what ends up in catalog_match_note if a human later has to
// force a mapping (see rfqIntakeQueries.js).
function buildCatalogMatchSchema(validIds) {
  return {
    type: "object",
    properties: {
      asWritten: {
        type: "string",
        description: "The material/product form/standard exactly as the customer wrote it, verbatim.",
      },
      matched: {
        type: "boolean",
        description: "true ONLY if this confidently and specifically matches one exact entry in the provided catalog list.",
      },
      id: {
        type: ["integer", "null"],
        enum: [...validIds, null],
        description: "The matched catalog id, or null when matched is false.",
      },
    },
    required: ["asWritten", "matched", "id"],
  };
}

function buildExtractionToolSchema(catalog) {
  const materialIds = catalog.materials.map((m) => m.id);
  const productFormIds = catalog.productForms.map((f) => f.id);
  const standardIds = catalog.standards.map((s) => s.id);

  return {
    name: "record_rfq_extraction",
    description: "Records structured RFQ data extracted from a customer email or a screenshot of one.",
    input_schema: {
      type: "object",
      properties: {
        sender: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            company: { type: ["string", "null"] },
            title: { type: ["string", "null"] },
          },
          required: ["name", "email", "company", "title"],
        },
        lineItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rawText: { type: "string", description: "The closest verbatim snippet from the source for this line item." },
              description: { type: "string" },
              quantity: { type: ["integer", "null"] },
              unit: { type: ["string", "null"] },
              material: buildCatalogMatchSchema(materialIds),
              productForm: buildCatalogMatchSchema(productFormIds),
              standard: buildCatalogMatchSchema(standardIds),
              missingInfo: { type: "array", items: { type: "string" } },
            },
            required: ["rawText", "description", "quantity", "unit", "material", "productForm", "standard", "missingInfo"],
          },
        },
        subject: {
          type: ["string", "null"],
          description: "The email's subject line, if there is one, used only to suggest a project name — null if there's no clear subject (e.g. a screenshot with no visible subject line).",
        },
        notes: {
          type: "array",
          items: { type: "string" },
          description: "Anything worth a human's attention that doesn't fit the line-item structure — never a resolution, only a flag.",
        },
      },
      required: ["sender", "lineItems", "subject", "notes"],
    },
  };
}

function formatCatalogList(catalog) {
  const materialsList = catalog.materials.map((m) => `- ${m.name} (id ${m.id})`).join("\n");
  const productFormsList = catalog.productForms.map((f) => `- ${f.name} (id ${f.id})`).join("\n");
  const standardsList = catalog.standards.map((s) => `- ${s.code}: ${s.description} (id ${s.id})`).join("\n");
  return { materialsList, productFormsList, standardsList };
}

function buildSystemPrompt(catalog) {
  const { materialsList, productFormsList, standardsList } = formatCatalogList(catalog);

  return `You are extracting structured RFQ (Request for Quote) data from a customer email, or a screenshot of one, for PM International Suppliers — a fictional sandbox company used to test this extraction feature. All data you see is fictional test data.

Your job: extract who sent it, what they're asking to be quoted (line items), and flag anything incomplete or uncertain. You are not deciding pricing, sourcing, or anything else — only extracting and matching against the catalog below.

## THE ONE NON-NEGOTIABLE RULE

For every line item, match its material, product form, and standard (if mentioned) against the catalog lists below — and ONLY the catalog lists below, nothing else.

- If something confidently and specifically matches one catalog entry, set matched: true and give its id.
- If it does NOT confidently match — including if it's merely similar to, adjacent to, or in the same general family as a catalog entry — set matched: false and id: null. Do NOT pick the "closest" or "nearest" catalog entry as a fallback. Never guess.
- A wrong silent match is far worse than an honest "not recognized." If you are uncertain at all, mark it unmatched. This rule applies even under pressure to seem complete or helpful — an unmatched flag is a correct, useful answer, not a failure.

## Catalog — the ONLY valid values for material/productForm/standard ids

Materials:
${materialsList}

Product Forms:
${productFormsList}

Standards:
${standardsList}

## Other extraction rules

- Extract sender name, email, and company from the email headers/signature. Title is optional — null if not stated.
- Extract the email's subject line as "subject", if there is one — used only to suggest a project name, never required.
- For each requested item, extract a clean one-line description, quantity, and unit as stated. If quantity is genuinely not stated anywhere for that item, set quantity to null and add "quantity" to that line's missingInfo array — do not guess a quantity.
- rawText should be the closest verbatim snippet from the source for that line item, for traceability.
- Use the notes array (not line items) for anything that doesn't fit the line-item-by-line-item structure: an attachment mentioned but not provided, the email appearing to describe more than one separate project/job that should probably be split later, unusual urgency, or anything else worth a human's attention. Do not attempt to resolve any of these yourself — only flag them.
- If the input is a screenshot image rather than typed text, apply every rule above identically — read the email content from the image the same way you would read pasted text.`;
}

module.exports = { buildSystemPrompt, buildExtractionToolSchema, buildCatalogMatchSchema };
