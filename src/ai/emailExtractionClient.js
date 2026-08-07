// src/ai/emailExtractionClient.js
// Thin IO wrapper around the Anthropic Messages API — no new npm
// dependency, uses Node's built-in fetch. All the actual extraction logic
// (prompt, schema, the non-negotiable "never guess" rule) lives in
// emailExtractionPrompt.js; this file only builds the HTTP request and
// parses the response. Kept deliberately thin so the interesting logic
// stays in pure, unit-tested modules — this file itself isn't
// meaningfully testable without a live network call or a mock.
//
// Forces the response through tool-use (tool_choice) rather than parsing
// free-text JSON — the reliable way to get schema-shaped output instead
// of hoping the model formats prose-embedded JSON correctly.

const { buildSystemPrompt, buildExtractionToolSchema } = require("./emailExtractionPrompt");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;

// screenshot: { buffer, mimeType } or null/undefined. At least one of
// rawEmailText/screenshot is expected to be present — enforced by the
// route before this is ever called, not re-checked here.
function buildUserContent({ rawEmailText, screenshot }) {
  const content = [];
  if (rawEmailText && rawEmailText.trim()) {
    content.push({ type: "text", text: rawEmailText });
  }
  if (screenshot) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: screenshot.mimeType,
        data: screenshot.buffer.toString("base64"),
      },
    });
  }
  return content;
}

// catalog: { materials, productForms, standards } — fetched fresh by the
// caller so the prompt and the later validation pass both see the exact
// same live catalog, not a stale/mismatched snapshot.
// Returns the AI's raw tool_use input, UNVALIDATED — callers must run it
// through emailExtractionValidation.js's sanitizeExtraction before
// trusting anything in it, including every claimed catalog id.
async function extractRfqFromEmail({ rawEmailText, screenshot, catalog }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — AI Email Intake can't reach the extraction model. See render.yaml.");
  }

  const tool = buildExtractionToolSchema(catalog);
  const requestBody = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(catalog),
    messages: [{ role: "user", content: buildUserContent({ rawEmailText, screenshot }) }],
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
  };

  let response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    throw new Error(`Could not reach the AI extraction service: ${err.message}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`AI extraction failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const data = await response.json();
  const toolUseBlock = (data.content || []).find((block) => block.type === "tool_use" && block.name === tool.name);
  if (!toolUseBlock) {
    throw new Error("AI extraction did not return the expected structured result.");
  }

  return toolUseBlock.input;
}

module.exports = { extractRfqFromEmail };
