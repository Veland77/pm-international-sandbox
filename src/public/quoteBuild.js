// src/public/quoteBuild.js
// Live margin recompute for the quote create/edit form, plus the
// freight_display_mode radio toggle: "As its own line" and "Included in
// items" each have their own row set in the DOM (data-mode="separate" /
// data-mode="included"), one of them hidden via the native `hidden`
// attribute at any time — switching the radio just flips which set is
// hidden, no page reload, and a hidden row's `required` field is exempt
// from browser validation automatically. Buy price (and, for included-
// mode rows, that line's own raw freight cost) are embedded server-side
// via data attributes — this only recomputes margin/totals as a
// preview while typing; the server recomputes authoritatively on
// submit, this never decides what gets saved.

(function () {
  function formatUsd(n) {
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Mirrors marginCalc.js's parseSellPriceInput on the server — accepts a
  // comma decimal separator (e.g. Norwegian-locale "107,07"), not just a
  // period. Plain parseFloat("107,07") silently stops at the comma and
  // returns 107, which would make this live preview quietly wrong rather
  // than matching what the server will actually save.
  function parseSellPriceInput(raw) {
    if (raw == null) return NaN;
    const trimmed = String(raw).trim();
    if (trimmed === "") return NaN;
    const normalized = /^-?\d+,\d+$/.test(trimmed) ? trimmed.replace(",", ".") : trimmed;
    const num = Number(normalized);
    return Number.isNaN(num) ? NaN : num;
  }

  // freightCost (data-freight-cost) is only ever present on included-mode
  // item rows — that line's own raw freight cost (never a markup-inflated
  // figure), added to buy so the margin shown is the all-in margin
  // against the combined price typed in this mode. Absent everywhere
  // else, so this is a no-op change for separate-mode rows and the
  // dedicated Freight row.
  function recomputeRow(row) {
    const buy = parseFloat(row.dataset.buy);
    const freightCost = parseFloat(row.dataset.freightCost) || 0;
    const quantity = parseFloat(row.dataset.quantity) || 1;
    const isFreightLine = row.dataset.isFreightLine === "true";
    const sellInput = row.querySelector(".quote-sell-price");
    const marginUsdCell = row.querySelector(".quote-margin-usd");
    const marginPctCell = row.querySelector(".quote-margin-pct");
    if (!sellInput || !marginUsdCell || !marginPctCell || Number.isNaN(buy)) return null;

    const sell = parseSellPriceInput(sellInput.value);
    if (Number.isNaN(sell)) {
      marginUsdCell.textContent = "—";
      marginPctCell.textContent = "—";
      marginUsdCell.className = "quote-margin-usd";
      marginPctCell.className = "quote-margin-pct";
      return null;
    }

    const cost = buy + freightCost;
    const marginUsd = sell - cost;
    const marginPct = sell > 0 ? (marginUsd / sell) * 100 : null;
    const cls = marginUsd >= 0 ? "text-positive" : "text-negative";
    marginUsdCell.textContent = formatUsd(marginUsd);
    marginPctCell.textContent = marginPct == null ? "—" : `${marginPct.toFixed(1)}%`;
    marginUsdCell.className = `quote-margin-usd ${cls}`;
    marginPctCell.className = `quote-margin-pct ${cls}`;

    return { sell, cost, quantity, isFreightLine, freightCost };
  }

  function recomputeTotals() {
    // Only rows in the currently-active mode — a hidden row (the other
    // mode's field set) never contributes, whether or not it happens to
    // hold a leftover typed/suggested value.
    const rows = document.querySelectorAll(".quote-line-row:not([hidden])");
    const sellEl = document.getElementById("quote-total-sell");
    const buyEl = document.getElementById("quote-total-buy");
    const freightEl = document.getElementById("quote-total-freight");
    const marginEl = document.getElementById("quote-total-margin");
    if (!sellEl || !buyEl || !freightEl || !marginEl) return;

    let totalSell = 0;
    let totalCost = 0;
    let totalFreight = 0;
    let any = false;
    rows.forEach((row) => {
      const r = recomputeRow(row);
      if (!r) return;
      any = true;
      totalSell += r.sell * r.quantity;
      totalCost += r.cost * r.quantity;
      // Separate mode: the dedicated Freight row's own cost. Included
      // mode: each item's own folded-in freight cost. Never both at
      // once — one row set is always hidden/excluded above.
      if (r.isFreightLine) totalFreight += r.cost * r.quantity;
      else totalFreight += r.freightCost * r.quantity;
    });

    if (!any) {
      sellEl.textContent = "—";
      buyEl.textContent = "—";
      freightEl.textContent = "—";
      marginEl.textContent = "—";
      marginEl.className = "stat-value";
      return;
    }

    const marginUsd = totalSell - totalCost;
    const marginPct = totalSell > 0 ? (marginUsd / totalSell) * 100 : null;
    sellEl.textContent = formatUsd(totalSell);
    buyEl.textContent = formatUsd(totalCost);
    freightEl.textContent = formatUsd(totalFreight);
    marginEl.textContent = `${formatUsd(marginUsd)} (${marginPct == null ? "—" : `${marginPct.toFixed(1)}%`})`;
    marginEl.className = `stat-value ${marginUsd >= 0 ? "text-positive" : "text-negative"}`;
  }

  function applyFreightDisplayMode(mode) {
    document.querySelectorAll(".quote-line-row[data-mode]").forEach((row) => {
      row.hidden = row.dataset.mode !== mode;
    });
    recomputeTotals();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".quote-sell-price").forEach((input) => {
      input.addEventListener("input", recomputeTotals);
    });
    document.querySelectorAll('input[name="freight_display_mode"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.checked) applyFreightDisplayMode(radio.value);
      });
    });
    recomputeTotals();
  });
})();
