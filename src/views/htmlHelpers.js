// src/views/htmlHelpers.js
// Shared view helpers: HTML escaping, plus English-locked date/number
// formatting. These run server-side, so passing an explicit locale makes
// the output deterministic — never dependent on the visitor's own browser
// language, unlike a native date/number input's own rendering.

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-08-12" -> "12 Aug 2026"
function formatDate(isoString) {
  if (!isoString) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoString);
  if (!match) return isoString;
  const [, year, month, day] = match;
  return `${parseInt(day, 10)} ${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

// 3750 -> "3,750.00"
function formatNumber(amount, decimals = 2) {
  return Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// 3750 -> "$3,750.00", -1626.07 -> "-$1,626.07"
function formatCurrency(amount, symbol = "$") {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${symbol}${formatNumber(Math.abs(amount))}`;
}

module.exports = { escapeHtml, formatDate, formatNumber, formatCurrency };
