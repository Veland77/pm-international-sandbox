// src/views/rfqList.js
// Renders the RFQ list page as a simple HTML table.

const { layout } = require("./layout");
const { escapeHtml, formatDate } = require("./htmlHelpers");

function rfqListPage(rfqs) {
  const rows = rfqs
    .map(
      (r) => `
    <tr>
      <td><a href="/rfqs/${r.id}">${escapeHtml(r.job_number)}</a></td>
      <td>${escapeHtml(r.account_name)}</td>
      <td>${escapeHtml(r.project_name)}</td>
      <td>${escapeHtml(r.status)}</td>
      <td>${escapeHtml(r.sales_rep_name)}</td>
      <td>${escapeHtml(formatDate(r.due_date))}</td>
    </tr>`
    )
    .join("");

  const body = `
    <a class="back-link" href="/">&larr; Home</a>
    <h1>RFQs</h1>
    <p><a class="btn btn-primary" href="/rfqs/new">+ New RFQ</a></p>
    <div class="card">
      <table>
        <thead>
          <tr><th>Job No</th><th>Account</th><th>Project</th><th>Status</th><th>Sales Rep</th><th>Due Date</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6">No RFQs found.</td></tr>'}</tbody>
      </table>
    </div>`;

  return layout({ title: "RFQs", bodyHtml: body });
}

module.exports = { rfqListPage };
