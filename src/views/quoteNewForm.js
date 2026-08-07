// src/views/quoteNewForm.js
// "Offer to Customer" quote create/edit form: buy price and sell price
// per sourced line item, margin $/% computed both server-side
// (authoritative) and live client-side as sell prices are typed.
// Unsourced lines are shown but flagged, not quotable.
//
// Two field sets are always both rendered — "As its own line" (item sell
// price + a separate Freight row, freight never folded into an item's
// own price) and "Included in items" (one combined item+freight sell
// price per line, no separate Freight row) — quoteBuild.js shows/hides
// whichever matches the freight_display_mode radio, no page reload.
// Whichever set is visible when the form is submitted is what's read;
// see quoteIntake.js's POST handler. Receives fully-computed
// displayRows/combinedDisplayRows/freightRow/totals from the route — no
// calc imports here, same separation the rest of the app's views use.

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

// "As its own line" mode — item's own pure sell price, margin is buy-vs-
// sell only (freight is never folded in here; it's the separate Freight
// row below).
//
// Sell Price is type="text", not type="number" — browsers silently
// blank a number input's displayed value if it isn't period-formatted,
// which both rejects a comma decimal (Norwegian locale) as the user
// types it and, worse, wipes what they typed on an error re-render.
// Parsing (including comma) happens server-side in marginCalc.js.
//
// The field name is "sell_price[li<id>]", not "sell_price[<id>]" — the
// "li" prefix is load-bearing. express's body parser (qs) treats a
// bracket group as an array, not an object, whenever every key inside it
// looks like a plain number, silently discarding the real
// rfq_line_item_id and reindexing by submission order instead. A
// non-numeric prefix keeps qs from ever taking that path, regardless of
// how large or small the id is. Stripped back off server-side in
// quoteIntake.js.
function lineRows(displayRows, includedActive) {
  return displayRows
    .map((row) => {
      if (!row.sourced) {
        return `
    <tr class="quote-line-row" data-mode="separate"${includedActive ? " hidden" : ""}>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td colspan="5" class="text-negative">Not sourced — select a vendor first</td>
    </tr>`;
      }

      const buyText = row.buyUnitPriceUsd == null ? "—" : formatCurrency(row.buyUnitPriceUsd);
      const marginUsdText = row.marginUnitUsd == null ? "—" : formatCurrency(row.marginUnitUsd);
      const marginPctText = row.marginPct == null ? "—" : `${row.marginPct.toFixed(1)}%`;

      return `
    <tr class="quote-line-row" data-mode="separate"${includedActive ? " hidden" : ""} data-buy="${row.buyUnitPriceUsd ?? ""}" data-quantity="${row.quantity}">
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

// "Included in items" mode — one field per line: the exact combined
// (item + freight) sell price the customer will see, typed directly, no
// folding/allocation happening anywhere near this field. Buy Price stays
// the item's own pure cost (informational reference only, same column as
// "As its own line" mode) — data-freight-cost carries that line's own
// raw freight cost (never a markup-inflated figure) purely so
// quoteBuild.js can show a live all-in margin (combined − (buy +
// freight cost)) as a reference next to the field; it's not folded into
// what gets typed or saved. Field name "landed_sell_price[li<id>]" — see
// lineRows above for why the "li" prefix matters.
function combinedLineRows(combinedDisplayRows, includedActive) {
  return combinedDisplayRows
    .map((row) => {
      if (!row.sourced) {
        return `
    <tr class="quote-line-row" data-mode="included"${includedActive ? "" : " hidden"}>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td colspan="5" class="text-negative">Not sourced — select a vendor first</td>
    </tr>`;
      }

      const buyText = row.buyUnitPriceUsd == null ? "—" : formatCurrency(row.buyUnitPriceUsd);
      const marginUsdText = row.marginUnitUsd == null ? "—" : formatCurrency(row.marginUnitUsd);
      const marginPctText = row.marginPct == null ? "—" : `${row.marginPct.toFixed(1)}%`;

      return `
    <tr class="quote-line-row" data-mode="included"${includedActive ? "" : " hidden"} data-buy="${row.buyUnitPriceUsd ?? ""}" data-freight-cost="${row.freightUnitUsd ?? ""}" data-quantity="${row.quantity}">
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td>${escapeHtml(row.supplierName)}</td>
      <td>${escapeHtml(buyText)}</td>
      <td><input type="text" inputmode="decimal" class="quote-sell-price" name="landed_sell_price[li${row.rfqLineItemId}]" value="${escapeHtml(row.sellPriceRaw || "")}" required></td>
      <td class="quote-margin-usd ${marginClass(row.marginUnitUsd)}">${escapeHtml(marginUsdText)}</td>
      <td class="quote-margin-pct ${marginClass(row.marginUnitUsd)}">${escapeHtml(marginPctText)}</td>
    </tr>`;
    })
    .join("");
}

// The one aggregated Freight line — "As its own line" mode only (hidden
// entirely in "Included in items" mode, since freight is folded into
// each item row there instead). Same shape/columns as a sourced item row
// (Vendor and Buy Price included for visual consistency, Vendor is
// always "—" since freight has a forwarder, not a supplier), except its
// Sell Price field is a plain flat field name (no bracket/id needed —
// there's only ever one freight line per quote, so the qs array-coercion
// concern that drives the item rows' "li" prefix doesn't apply here).
function freightLineRow(freightRow, includedActive) {
  const buyText = formatCurrency(freightRow.buyUnitPriceUsd);
  const marginUsdText = freightRow.marginUnitUsd == null ? "—" : formatCurrency(freightRow.marginUnitUsd);
  const marginPctText = freightRow.marginPct == null ? "—" : `${freightRow.marginPct.toFixed(1)}%`;

  return `
    <tr class="quote-line-row" data-mode="separate"${includedActive ? " hidden" : ""} data-buy="${freightRow.buyUnitPriceUsd}" data-quantity="${freightRow.quantity}" data-is-freight-line="true">
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
  combinedDisplayRows,
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
  const includedActive = formValues.freight_display_mode === "included";

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
        <div class="field">
          <span class="field-label">Freight Display</span>
          <label><input type="radio" name="freight_display_mode" value="separate" id="freight-mode-separate"${!includedActive ? " checked" : ""}> As its own line</label>
          <label><input type="radio" name="freight_display_mode" value="included" id="freight-mode-included"${includedActive ? " checked" : ""}> Included in items</label>
          <p style="font-size: 0.85rem; color: var(--color-text-muted);">As its own line: enter each item's own sell price plus one freight sell price below. Included in items: enter the exact combined price the customer sees per item directly — nothing gets folded in behind the scenes.</p>
        </div>
      </div>

      <div class="card">
        <h2>Line Items</h2>
        <table>
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Vendor</th><th>Buy Price</th><th>Sell Price</th><th>Margin $</th><th>Margin %</th></tr>
          </thead>
          <tbody>${lineRows(displayRows, includedActive)}${freightLineRow(freightRow, includedActive)}${combinedLineRows(combinedDisplayRows, includedActive)}</tbody>
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
