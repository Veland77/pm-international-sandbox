// src/views/quoteNewForm.js
// "Offer to Customer" quote create/edit form: buy price, freight cost
// (allocated by weight share, shown as its own column, never folded into
// buy price), and sell price per sourced line item, margin $/% computed
// both server-side (authoritative) and live client-side as sell prices
// are typed. Unsourced lines are shown but flagged, not quotable.
// Receives fully-computed displayRows/totals from the route — no calc
// imports here, same separation the rest of the app's views use.

const { layout } = require("./layout");
const { escapeHtml, formatCurrency } = require("./htmlHelpers");

function marginClass(amount) {
  if (amount == null) return "";
  return amount >= 0 ? "text-positive" : "text-negative";
}

function errorList(errors) {
  if (!errors.length) return "";
  const items = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  return `<div class="form-errors"><strong>Please fix the following:</strong><ul>${items}</ul></div>`;
}

function negativeMarginWarning(hasNegativeMargin, confirmChecked) {
  if (!hasNegativeMargin) return "";
  return `
    <div class="form-errors">
      <strong>One or more lines have a negative margin.</strong>
      <p>Review the highlighted lines below. Check the box and submit again if this is intentional.</p>
      <label><input type="checkbox" name="confirm_negative_margin"${confirmChecked ? " checked" : ""}> I understand and want to save this quote with a negative margin on one or more lines.</label>
    </div>`;
}

function lineRows(displayRows) {
  return displayRows
    .map((row) => {
      if (!row.sourced) {
        return `
    <tr>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td colspan="6" class="text-negative">Not sourced — select a vendor first</td>
    </tr>`;
      }

      const buyText = row.buyUnitPriceUsd == null ? "—" : formatCurrency(row.buyUnitPriceUsd);
      const freightText = row.freightUnitUsd == null ? "—" : formatCurrency(row.freightUnitUsd);
      const marginUsdText = row.marginUnitUsd == null ? "—" : formatCurrency(row.marginUnitUsd);
      const marginPctText = row.marginPct == null ? "—" : `${row.marginPct.toFixed(1)}%`;

      // Sell Price is type="text", not type="number" — browsers silently
      // blank a number input's displayed value if it isn't period-formatted,
      // which both rejects a comma decimal (Norwegian locale) as the user
      // types it and, worse, wipes what they typed on an error re-render.
      // Parsing (including comma) happens server-side in marginCalc.js.
      return `
    <tr class="quote-line-row" data-buy="${row.buyUnitPriceUsd ?? ""}" data-freight="${row.freightUnitUsd ?? 0}" data-quantity="${row.quantity}">
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td>${escapeHtml(row.supplierName)}</td>
      <td>${escapeHtml(buyText)}</td>
      <td>${escapeHtml(freightText)}</td>
      <td><input type="text" inputmode="decimal" class="quote-sell-price" name="sell_price[${row.rfqLineItemId}]" value="${escapeHtml(row.sellPriceRaw || "")}" required></td>
      <td class="quote-margin-usd ${marginClass(row.marginUnitUsd)}">${escapeHtml(marginUsdText)}</td>
      <td class="quote-margin-pct ${marginClass(row.marginUnitUsd)}">${escapeHtml(marginPctText)}</td>
    </tr>`;
    })
    .join("");
}

function quoteNewFormPage({ rfq, isEditing, displayRows, totals, formValues = {}, errors = [], hasNegativeMargin = false }) {
  const totalMarginText = totals
    ? `${formatCurrency(totals.marginUsd)} (${totals.marginPct == null ? "—" : `${totals.marginPct.toFixed(1)}%`})`
    : "—";

  const body = `
    <a class="back-link" href="/rfqs/${rfq.id}">&larr; Back to ${escapeHtml(rfq.rfq_number)}</a>
    <h1>${isEditing ? "Edit Draft Quote" : "Create Quote"} — ${escapeHtml(rfq.rfq_number)}</h1>
    ${errorList(errors)}
    ${negativeMarginWarning(hasNegativeMargin, formValues.confirm_negative_margin)}

    <form method="POST" action="/rfqs/${rfq.id}/quote/new" id="quote-build-form">
      <div class="card">
        <h2>Quote Details</h2>
        <label class="field">
          <span class="field-label">Valid Until</span>
          <input type="date" name="valid_until" value="${escapeHtml(formValues.valid_until || "")}" required>
        </label>
        <label class="field">
          <span class="field-label">Promised Delivery Date (optional)</span>
          <input type="date" name="promised_delivery_date" value="${escapeHtml(formValues.promised_delivery_date || "")}">
        </label>
      </div>

      <div class="card">
        <h2>Line Items</h2>
        <table>
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Vendor</th><th>Buy Price</th><th>Freight Cost</th><th>Sell Price</th><th>Margin $</th><th>Margin %</th></tr>
          </thead>
          <tbody>${lineRows(displayRows)}</tbody>
        </table>
      </div>

      <div class="dashboard-card">
        <h2>Quote Totals</h2>
        <div class="dashboard-stats">
          <div>
            <div class="stat-label">Total Sell</div>
            <div class="stat-value" id="quote-total-sell">${totals ? escapeHtml(formatCurrency(totals.totalSellUsd)) : "—"}</div>
          </div>
          <div>
            <div class="stat-label">Total Buy</div>
            <div class="stat-value" id="quote-total-buy">${totals ? escapeHtml(formatCurrency(totals.totalBuyUsd)) : "—"}</div>
          </div>
          <div>
            <div class="stat-label">Total Freight</div>
            <div class="stat-value" id="quote-total-freight">${totals ? escapeHtml(formatCurrency(totals.totalFreightUsd)) : "—"}</div>
          </div>
          <div>
            <div class="stat-label">Total Margin</div>
            <div class="stat-value ${totals ? marginClass(totals.marginUsd) : ""}" id="quote-total-margin">${escapeHtml(totalMarginText)}</div>
          </div>
        </div>
      </div>

      <p><button type="submit" class="btn btn-primary">${isEditing ? "Save Changes" : "Create Quote"}</button></p>
    </form>

    <script src="/quoteBuild.js"></script>
  `;

  return layout({ title: `${isEditing ? "Edit" : "Create"} Quote — ${rfq.rfq_number}`, bodyHtml: body });
}

module.exports = { quoteNewFormPage };
