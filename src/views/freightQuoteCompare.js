// src/views/freightQuoteCompare.js
// "Compare Freight Quotes & Select Winner" screen for one vendor pickup
// location — every quote received across every forwarder asked, sorted by
// USD-converted price so quotes in different currencies are genuinely
// comparable.

const { layout } = require("./layout");
const { escapeHtml, formatDate, formatCurrency } = require("./htmlHelpers");

function quoteRows(quotes) {
  return quotes
    .map(
      (q) => `
    <tr>
      <td><input type="radio" name="freight_quote_id" value="${q.freight_quote_id}"${q.is_selected ? " checked" : ""} required></td>
      <td>${escapeHtml(q.freight_forwarder_name)} (${escapeHtml(q.freight_forwarder_country)})</td>
      <td>${escapeHtml(formatCurrency(q.price, ""))} ${escapeHtml(q.currency)}</td>
      <td>${q.usdPrice == null ? "—" : escapeHtml(formatCurrency(q.usdPrice))}</td>
      <td>${escapeHtml(q.transit_days)} days</td>
      <td>${escapeHtml(formatDate(q.valid_until))}</td>
      <td>${escapeHtml(q.notes || "—")}</td>
    </tr>`
    )
    .join("");
}

function freightQuoteComparePage({ rfq, freightInquiryId, supplierName, quotes }) {
  const noQuotesYet = quotes.length === 0;

  const body = `
    <a class="back-link" href="/rfqs/${rfq.id}">&larr; Back to ${escapeHtml(rfq.job_number)}</a>
    <h1>Compare Freight Quotes — ${escapeHtml(supplierName)} Pickup</h1>
    <p>${escapeHtml(rfq.job_number)}</p>

    <div class="card">
      ${
        noQuotesYet
          ? "<p>No freight quotes received yet for this pickup location.</p>"
          : `
      <form method="POST" action="/rfqs/${rfq.id}/freight-inquiries/${freightInquiryId}/select">
        <table>
          <thead>
            <tr><th></th><th>Forwarder</th><th>Price</th><th>USD Equivalent</th><th>Transit Time</th><th>Valid Until</th><th>Notes</th></tr>
          </thead>
          <tbody>${quoteRows(quotes)}</tbody>
        </table>
        <p><button type="submit" class="btn btn-primary">Set Selected Forwarder</button></p>
      </form>`
      }
    </div>
  `;

  return layout({ title: `Compare Freight Quotes — ${supplierName}`, bodyHtml: body });
}

module.exports = { freightQuoteComparePage };
