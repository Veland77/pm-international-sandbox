// src/public/quoteBuild.js
// Live margin recompute for the quote create/edit form. Buy price per
// line is embedded server-side (data-buy on each row) — this only
// recomputes margin/totals as a preview while typing; the server
// recomputes authoritatively on submit, this never decides what gets saved.

(function () {
  function formatUsd(n) {
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function recomputeRow(row) {
    const buy = parseFloat(row.dataset.buy);
    const quantity = parseFloat(row.dataset.quantity) || 1;
    const sellInput = row.querySelector(".quote-sell-price");
    const marginUsdCell = row.querySelector(".quote-margin-usd");
    const marginPctCell = row.querySelector(".quote-margin-pct");
    if (!sellInput || !marginUsdCell || !marginPctCell || Number.isNaN(buy)) return null;

    const sell = parseFloat(sellInput.value);
    if (Number.isNaN(sell)) {
      marginUsdCell.textContent = "—";
      marginPctCell.textContent = "—";
      marginUsdCell.className = "quote-margin-usd";
      marginPctCell.className = "quote-margin-pct";
      return null;
    }

    const marginUsd = sell - buy;
    const marginPct = sell > 0 ? (marginUsd / sell) * 100 : null;
    const cls = marginUsd >= 0 ? "text-positive" : "text-negative";
    marginUsdCell.textContent = formatUsd(marginUsd);
    marginPctCell.textContent = marginPct == null ? "—" : `${marginPct.toFixed(1)}%`;
    marginUsdCell.className = `quote-margin-usd ${cls}`;
    marginPctCell.className = `quote-margin-pct ${cls}`;

    return { sell, buy, quantity };
  }

  function recomputeTotals() {
    const rows = document.querySelectorAll(".quote-line-row");
    const sellEl = document.getElementById("quote-total-sell");
    const buyEl = document.getElementById("quote-total-buy");
    const marginEl = document.getElementById("quote-total-margin");
    if (!sellEl || !buyEl || !marginEl) return;

    let totalSell = 0;
    let totalBuy = 0;
    let any = false;
    rows.forEach((row) => {
      const r = recomputeRow(row);
      if (!r) return;
      any = true;
      totalSell += r.sell * r.quantity;
      totalBuy += r.buy * r.quantity;
    });

    if (!any) {
      sellEl.textContent = "—";
      buyEl.textContent = "—";
      marginEl.textContent = "—";
      marginEl.className = "stat-value";
      return;
    }

    const marginUsd = totalSell - totalBuy;
    const marginPct = totalSell > 0 ? (marginUsd / totalSell) * 100 : null;
    sellEl.textContent = formatUsd(totalSell);
    buyEl.textContent = formatUsd(totalBuy);
    marginEl.textContent = `${formatUsd(marginUsd)} (${marginPct == null ? "—" : `${marginPct.toFixed(1)}%`})`;
    marginEl.className = `stat-value ${marginUsd >= 0 ? "text-positive" : "text-negative"}`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".quote-sell-price").forEach((input) => {
      input.addEventListener("input", recomputeTotals);
    });
    recomputeTotals();
  });
})();
