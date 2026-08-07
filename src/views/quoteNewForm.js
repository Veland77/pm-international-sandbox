// src/views/quoteNewForm.js
// "Offer to Customer" quote create/edit form: buy price and sell price
// per sourced line item, margin $/% computed both server-side
// (authoritative) and live client-side as sell prices are typed.
// Unsourced lines are shown but flagged, not quotable. Freight is never
// folded into an item's own buy/sell/margin — it's its own aggregated
// row (freightRow) at the bottom of the table, with its own editable
// sell price, same as every item. Receives fully-computed
// displayRows/freightRow/totals from the route — no calc imports here,
// same separation the rest of the app's views use.

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
      <td colspan="5" class="text-negative">Not sourced — select a vendor first</td>
    </tr>`;
      }

      const buyText = row.buyUnitPriceUsd == null ? "—" : formatCurrency(row.buyUnitPriceUsd);
      const marginUsdText = row.marginUnitUsd == null ? "—" : formatCurrency(row.marginUnitUsd);
      const marginPctText = row.marginPct == null ? "—" : `${row.marginPct.toFixed(1)}%`;

      // Sell Price is type="text", not type="number" — browsers silently
      // blank a number input's displayed value if it isn't period-formatted,
      // which both rejects a comma decimal (Norwegian locale) as the user
      // types it and, worse, wipes what they typed on an error re-render.
      // Parsing (including comma) happens server-side in marginCalc.js.
      //
      // The field name is "sell_price[li<id>]", not "sell_price[<id>]" —
      // the "li" prefix is load-bearing. express's body parser (qs) treats
      // a bracket group as an array, not an object, whenever every key
      // inside it looks like a plain number, silently discarding the real
      // rfq_line_item_id and reindexing by submission order instead. A
      // non-numeric prefix keeps qs from ever taking that path, regardless
      // of how large or small the id is. Stripped back off server-side in
      // quoteIntake.js.
      return `
    <tr class="quote-line-row" data-buy="${row.buyUnitPriceUsd ?? ""}" data-quantity="${row.quantity}">
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td>${escapeHtml(row.supplierName)}</td>
      <td>${escapeHtml(buyText)}</td>
      <td><input type="text" inputmode="decimal" class="quote-sell-price" name="sell_price[li${row.rfqLineItemId}]" value="${escapeHtml(row.sellPriceRaw || "")}" required></td>
      <td class="quote-margin-usd ${marginClass(row.marginUnitUsd)}">${escapeHtml(marginUsdText)}</td>
      <td class="quote-margin-pct ${marginClass(row.marginUnitUsd)}">${escapeHtml(marginPctText)}</td>
    </tr>`;
    })
    .join("");
}

// The one aggregated Freight line — same shape/columns as a sourced item
// row (Vendor and Buy Price included for visual consistency, Vendor is
// always "—" since freight has a forwarder, not a supplier), except its
// Sell Price field is a plain flat field name (no bracket/id needed —
// there's only ever one freight line per quote, so the qs array-coercion
// concern that drives the item rows' "li" prefix doesn't apply here).
function freightLineRow(freightRow) {
  const buyText = formatCurrency(freightRow.buyUnitPriceUsd);
  const marginUsdText = freightRow.marginUnitUsd == null ? "—" : formatCurrency(freightRow.marginUnitUsd);
  const marginPctText = freightRow.marginPct == null ? "—" : `${freightRow.marginPct.toFixed(1)}%`;

  return `
    <tr class="quote-line-row" data-buy="${freightRow.buyUnitPriceUsd}" data-quantity="${freightRow.quantity}" data-is-freight-line="true">
      <td>${escapeHtml(freightRow.description)}</td>
      <td>${escapeHtml(freightRow.quantity)}</td>
      <td>${escapeHtml(freightRow.unit)}</td>
      <td>—</td>
      <td>${escapeHtml(buyText)}</td>
      <td><input type="text" inputmode="decimal" class="quote-sell-price" name="freight_sell_price" value="${escapeHtml(freightRow.sellPriceRaw || "")}" required></td>
      <td class="quote-margin-usd ${marginClass(freightRow.marginUnitUsd)}">${escapeHtml(marginUsdText)}</td>
      <td class="quote-margin-pct ${marginClass(freightRow.marginUnitUsd)}">${escapeHtml(marginPctText)}</td>
    </tr>`;
}

// mode: "create" (no quote exists yet — v1, Draft), "editDraft" (v1 still
// Draft, edited in place), or "revise" (quote already Sent/Accepted/
// Rejected — saving creates the next version, Sent directly, "Save &
// Send"). Drives the page title and submit button copy only; the form
// fields themselves are identical in every mode.
const PAGE_COPY_BY_MODE = {
  create: { title: "Create Quote", submitLabel: "Create Quote" },
  editDraft: { title: "Edit Draft Quote", submitLabel: "Save Changes" },
  revise: { title: "Revise Quote", submitLabel: "Save & Send" },
};

function quoteNewFormPage({
  rfq,
  mode,
  displayRows,
  freightRow,
  totals,
  formValues = {},
  errors = [],
  hasNegativeMargin = false,
}) {
  const totalMarginText = totals
    ? `${formatCurrency(totals.marginUsd)} (${totals.marginPct == null ? "—" : `${totals.marginPct.toFixed(1)}%`})`
    : "—";
  const copy = PAGE_COPY_BY_MODE[mode];

  const body = `
    <a class="back-link" href="/rfqs/${rfq.id}">&larr; Back to ${escapeHtml(rfq.job_number)}</a>
    <h1>${copy.title} — ${escapeHtml(rfq.job_number)}</h1>
    ${mode === "revise" ? "<p>Saving this creates a new version of the quote and marks it Sent — the current version stays in Quote History exactly as it was.</p>" : ""}
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
            <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Vendor</th><th>Buy Price</th><th>Sell Price</th><th>Margin $</th><th>Margin %</th></tr>
          </thead>
          <tbody>${lineRows(displayRows)}${freightLineRow(freightRow)}</tbody>
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

      <p><button type="submit" class="btn btn-primary">${copy.submitLabel}</button></p>
    </form>

    <script src="/quoteBuild.js"></script>
  `;

  return layout({ title: `${copy.title} — ${rfq.job_number}`, bodyHtml: body });
}

module.exports = { quoteNewFormPage };
