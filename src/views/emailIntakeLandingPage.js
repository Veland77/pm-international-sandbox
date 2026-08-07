// src/views/emailIntakeLandingPage.js
// AI Email Intake landing page: paste an email's text and/or upload a
// screenshot, plus any attachments that came with the original email
// (drawings, spec sheets — filed later, not analyzed). Also lists past
// submissions so nothing pasted earlier gets lost if the reviewer leaves
// before confirming.

const { layout } = require("./layout");
const { escapeHtml, formatDate } = require("./htmlHelpers");

function errorList(errors) {
  if (!errors.length) return "";
  const items = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  return `<div class="form-errors"><strong>Please fix the following:</strong><ul>${items}</ul></div>`;
}

function statusBadgeClass(status) {
  if (status === "Confirmed") return "text-positive";
  if (status === "Discarded") return "text-negative";
  return "";
}

function submissionRow(s) {
  const sender = s.extracted && s.extracted.sender ? s.extracted.sender : {};
  const who = [sender.name, sender.company].filter(Boolean).join(" — ") || "(no sender extracted)";

  let actionHtml = "—";
  if (s.status === "Pending Review") {
    actionHtml = `<a href="/email-intake/${s.id}/review">Review</a>`;
  } else if (s.status === "Confirmed" && s.confirmed_rfq_id) {
    actionHtml = `<a href="/rfqs/${s.confirmed_rfq_id}">View Job</a>`;
  }

  return `
    <tr>
      <td>${escapeHtml(formatDate(s.created_date))}</td>
      <td>${escapeHtml(who)}</td>
      <td class="${statusBadgeClass(s.status)}">${escapeHtml(s.status)}</td>
      <td>${actionHtml}</td>
    </tr>`;
}

function emailIntakeLandingPage({ submissions = [], formValues = {}, errors = [] }) {
  const rows = submissions.map(submissionRow).join("");

  const body = `
    <h1>AI Email Intake</h1>
    <p>Paste the raw text of an RFQ email, or upload a screenshot if that's all you have. The AI extracts sender info and line items for you to review — nothing is created until you explicitly confirm it on the next screen.</p>
    ${errorList(errors)}

    <form method="POST" action="/email-intake" enctype="multipart/form-data">
      <div class="card">
        <h2>Email</h2>
        <label class="field">
          <span class="field-label">Paste the email text</span>
          <textarea class="auto-grow" name="raw_email_text" rows="10" placeholder="From: ...&#10;Subject: ...&#10;&#10;Hi, please quote...">${escapeHtml(formValues.raw_email_text || "")}</textarea>
        </label>

        <label class="field">
          <span class="field-label">Or upload a screenshot (optional — only if you don't have the text)</span>
        </label>
        <div class="file-input">
          <input type="file" name="screenshot" id="email-intake-screenshot" class="file-input-native" accept="image/*">
          <label for="email-intake-screenshot" class="btn btn-secondary">Choose Image</label>
          <span class="file-input-filename">No file chosen</span>
        </div>
      </div>

      <div class="card">
        <h2>Attachments (optional)</h2>
        <p>Any files that came with the original email — drawings, spec sheets. These are filed into Customer Attachments once the Job is created; they're not analyzed by the AI.</p>
        <label class="field">
          <span class="field-label">Attach files</span>
          <input type="file" name="attachments" multiple>
        </label>
      </div>

      <p><button type="submit" class="btn btn-primary">Extract RFQ</button></p>
    </form>

    <div class="card">
      <h2>Past Submissions</h2>
      <table>
        <thead>
          <tr><th>Date</th><th>Sender</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4">No submissions yet.</td></tr>'}</tbody>
      </table>
    </div>
  `;

  return layout({ title: "AI Email Intake", bodyHtml: body });
}

module.exports = { emailIntakeLandingPage };
