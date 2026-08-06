// src/views/lineItemCompare.js
// "Compare Vendors & Select Winner" screen for one RFQ line item — every
// vendor who actually sent pricing back, radio-select the winner, submit.

const { layout } = require("./layout");
const { escapeHtml, formatCurrency } = require("./htmlHelpers");

function vendorQuoteRows(vendorQuotes) {
  return vendorQuotes
    .map(
      (q) => `
    <tr>
      <td><input type="radio" name="supplier_quote_line_item_id" value="${q.supplier_quote_line_item_id}"${q.is_selected ? " checked" : ""} required></td>
      <td>${escapeHtml(q.supplier_name)} (${escapeHtml(q.supplier_country)})</td>
      <td>${escapeHtml(formatCurrency(q.unit_price, ""))} ${escapeHtml(q.currency)}</td>
      <td>${escapeHtml(q.lead_time_days)} days</td>
      <td>${escapeHtml(q.availability)}</td>
      <td>${escapeHtml(q.notes || "—")}</td>
    </tr>`
    )
    .join("");
}

function lineItemComparePage({ rfq, lineItem, vendorQuotes }) {
  const noQuotesYet = vendorQuotes.length === 0;

  const body = `
    <a class="back-link" href="/rfqs/${rfq.id}">&larr; Back to ${escapeHtml(rfq.rfq_number)}</a>
    <h1>Compare Vendors — ${escapeHtml(lineItem.description)}</h1>
    <p>
      ${escapeHtml(lineItem.material_name)} &middot; ${escapeHtml(lineItem.product_form_name)} &middot;
      ${escapeHtml(lineItem.standard_code || "—")} &middot; Qty ${escapeHtml(lineItem.quantity)} ${escapeHtml(lineItem.unit)}
    </p>

    <div class="card">
      ${
        noQuotesYet
          ? "<p>No vendor quotes received yet for this line item.</p>"
          : `
      <form method="POST" action="/rfqs/${rfq.id}/line-items/${lineItem.id}/select">
        <table>
          <thead>
            <tr><th></th><th>Vendor</th><th>Unit Price</th><th>Lead Time</th><th>Availability</th><th>Notes</th></tr>
          </thead>
          <tbody>${vendorQuoteRows(vendorQuotes)}</tbody>
        </table>
        <p><button type="submit" class="btn btn-primary">Set Selected Vendor</button></p>
      </form>`
      }
    </div>
  `;

  return layout({ title: `Compare Vendors — ${lineItem.description}`, bodyHtml: body });
}

module.exports = { lineItemComparePage };
