// src/views/rfqDetail.js
// Renders a single RFQ's detail page: order summary (incl. account info),
// status on PM's orders to suppliers, line items, contact, quote, and the
// sourcing/attachment sections below it.

const { layout } = require("./layout");
const { escapeHtml, formatDate, formatCurrency, formatNumber } = require("./htmlHelpers");
const { rfqAttachmentsSection } = require("./rfqAttachmentsSection");
const { customerFacingAttachmentsSection } = require("./customerFacingAttachmentsSection");
const { supplierInquiryAttachmentsSection } = require("./supplierInquiryAttachmentsSection");
const { compactMilestoneTimeline } = require("./milestoneTimeline");

function marginClass(amount) {
  if (amount == null) return "";
  return amount >= 0 ? "text-positive" : "text-negative";
}

// Shared Buy Price / Sell Price / [Total Sell Price] / Margin cell group —
// same numbers, same formatting, wherever a line item's cost/margin is
// shown (Line Items table, Quote section). A line item's own margin is
// buy-vs-sell only — freight is never subtracted here; it's its own
// aggregated row (see quoteSection's freightRow), shown only on the Quote
// section. showTotalSell adds the Sell Price x Qty extended-total cell —
// only quoteSection asks for it; the Line Items table doesn't.
function costMarginCells(row, { showTotalSell = false } = {}) {
  const buyText = row.buyUnitPriceUsd == null ? "—" : formatCurrency(row.buyUnitPriceUsd);
  const sellText = row.sellUnitPriceUsd == null ? "—" : formatCurrency(row.sellUnitPriceUsd);
  const totalSellText = row.sellUnitPriceUsd == null ? "—" : formatCurrency(row.sellUnitPriceUsd * row.quantity);
  const marginText =
    row.marginUnitUsd == null
      ? "—"
      : `${formatCurrency(row.marginUnitUsd)} (${row.marginPct == null ? "—" : `${row.marginPct.toFixed(1)}%`})`;

  return `
      <td>${escapeHtml(buyText)}</td>
      <td>${escapeHtml(sellText)}</td>
      ${showTotalSell ? `<td>${escapeHtml(totalSellText)}</td>` : ""}
      <td class="${marginClass(row.marginUnitUsd)}">${escapeHtml(marginText)}</td>`;
}

// "700.0 kg — box/pallet size: 120 x 15 x 15 cm (2 of 3 line items — 1
// not yet sourced)" — presented as PM's own figure, not sourced/attributed
// internally; the dimensions clause still exists to make clear it's one
// packing unit's size (not the line item's own unit of measure, and not
// a whole-shipment figure), only included when every sourced line agrees
// on it (see shipmentSizeCalc.js). The partial-sourcing note only appears
// when some line items still have no vendor selected. A slot for an
// "Actual Shipment Size" stat can sit right next to this once final
// weight/dimensions capture exists (see docs/phase4-sourcing-lifecycle.md)
// — not built yet, this is the estimate side only.
function formatShipmentSize(estimate) {
  if (!estimate) return "—";

  let text = `${formatNumber(estimate.totalWeightKg, 1)} kg`;
  if (estimate.dimensionsText) {
    text += ` — box/pallet size: ${estimate.dimensionsText}`;
  }
  if (estimate.sourcedCount < estimate.totalCount) {
    const missing = estimate.totalCount - estimate.sourcedCount;
    text += ` (${estimate.sourcedCount} of ${estimate.totalCount} line items — ${missing} not yet sourced)`;
  }
  return text;
}

function orderSummaryBlock(rfq, quote, totals, estimatedArrivalDate, shipmentSizeEstimate) {
  const grossProfitUsd = totals ? totals.marginUsd : null;
  const grossProfitPct = totals ? totals.marginPct : null;
  const totalOrderValueUsd = totals ? totals.totalSellUsd : null;
  const profitPctText = grossProfitPct == null ? "—" : `${grossProfitPct.toFixed(1)}%`;

  return `
    <div class="dashboard-card">
      <h2>Order Summary</h2>
      <div class="dashboard-stats">
        <div>
          <div class="stat-label">Customer</div>
          <div class="stat-value">${escapeHtml(rfq.account_name)}</div>
        </div>
        <div>
          <div class="stat-label">Industry / Status</div>
          <div class="stat-value-small">${escapeHtml(rfq.industry_segment)} &middot; ${escapeHtml(rfq.account_status)}</div>
        </div>
        <div>
          <div class="stat-label">Sales Rep</div>
          <div class="stat-value-small">${escapeHtml(rfq.sales_rep_name)}</div>
        </div>
        <div>
          <div class="stat-label">Pipeline Stage</div>
          <div class="stat-value">${escapeHtml(rfq.pipeline_stage)}</div>
        </div>
        <div>
          <div class="stat-label">Total Order Value</div>
          <div class="stat-value">${totalOrderValueUsd == null ? "—" : escapeHtml(formatCurrency(totalOrderValueUsd))}</div>
        </div>
        <div>
          <div class="stat-label">Total Gross Profit</div>
          <div class="stat-value ${marginClass(grossProfitUsd)}">${grossProfitUsd == null ? "—" : escapeHtml(formatCurrency(grossProfitUsd))} (${escapeHtml(profitPctText)})</div>
        </div>
        <div>
          <div class="stat-label">Customer Requested Delivery</div>
          <div class="stat-value-small">${escapeHtml(formatDate(rfq.customer_requested_delivery_date))}</div>
        </div>
        <div>
          <div class="stat-label">PM Promised Delivery</div>
          <div class="stat-value-small">${escapeHtml(formatDate(quote && quote.promised_delivery_date))}</div>
        </div>
        <div>
          <div class="stat-label">Estimated Vendor Arrival</div>
          <div class="stat-value-small">${escapeHtml(formatDate(estimatedArrivalDate))}</div>
        </div>
        <div>
          <div class="stat-label">Estimated Shipment Size (preliminary, based on vendor quotes)</div>
          <div class="stat-value-small">${escapeHtml(formatShipmentSize(shipmentSizeEstimate))}</div>
        </div>
      </div>
    </div>`;
}

function lineItemRows(rfqId, lineItems, displayRowsByLineItemId) {
  return lineItems
    .map((li) => {
      const notConverted = li.item_number_status === "Not Converted";
      const oversized = li.length_m != null && li.length_m > 6;
      const lengthText = li.length_m == null ? "—" : `${li.length_m} m`;
      const row = displayRowsByLineItemId.get(li.id);
      const vendor = row && row.sourced ? row.supplierName : "—";
      const compareLinkText = row && row.sourced ? "Change Vendor" : "Compare Vendors";
      const costCells = row ? costMarginCells(row) : "<td>—</td><td>—</td><td>—</td>";

      return `
    <tr>
      <td>${escapeHtml(li.item_number || "—")}${notConverted ? " (Not Converted)" : ""}</td>
      <td>${escapeHtml(li.material_name)}</td>
      <td>${escapeHtml(li.product_form_name)}</td>
      <td>${escapeHtml(li.standard_code || "—")}</td>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity)}</td>
      <td>${escapeHtml(li.unit)}</td>
      <td>${escapeHtml(lengthText)}${oversized ? " ⚠ Oversized — air freight constrained" : ""}</td>
      <td>${escapeHtml(vendor)}</td>
      ${costCells}
      <td><a href="/rfqs/${rfqId}/line-items/${li.id}/compare">${compareLinkText}</a></td>
    </tr>`;
    })
    .join("");
}

// Derived, never stored — same formula used by the PO-to-vendor print
// document (poPrintQueries.js) and the "Generate Purchase Order" flow.
function vendorPoNumber(order, supplierId) {
  return `${order.po_number}-S${supplierId}`;
}

// Shown directly beneath the Order Summary card. Before conversion, this is
// just the "Convert to Order" call to action (only offered once the deal is
// Won); afterward, it groups shipments by vendor (shipments.supplier_id —
// see schema.js for why that's nullable) into one block per vendor PO, each
// headed by the supplier name and its derived PO number, followed by that
// vendor's own milestone timeline(s). A shipment with no supplier_id means
// a user manually combined multiple vendors' lines into one physical
// shipment — there's no single vendor PO number to derive for it, so it
// falls into its own "Multiple / unassigned vendor" block instead.
function supplierOrdersSection(rfq, order, shipments) {
  if (!order) {
    if (rfq.status !== "Won") return "";
    return `
    <div class="card">
      <h2>Status on PM's Orders to Suppliers</h2>
      <p>This RFQ has been won. Convert it to an order once the customer's PO is in hand.</p>
      <p><a class="btn btn-primary" href="/rfqs/${rfq.id}/convert-to-order">Convert to Order</a></p>
    </div>`;
  }

  const groups = [];
  const groupByKey = new Map();
  shipments.forEach((s) => {
    const key = s.supplier_id == null ? "unassigned" : s.supplier_id;
    if (!groupByKey.has(key)) {
      const group = { supplierId: s.supplier_id, supplierName: s.supplier_name, shipments: [] };
      groupByKey.set(key, group);
      groups.push(group);
    }
    groupByKey.get(key).shipments.push(s);
  });

  const blocks = groups
    .map((group) => {
      const headerHtml =
        group.supplierId == null
          ? `<p class="supplier-order-block-header">Multiple / unassigned vendor</p>`
          : `<p class="supplier-order-block-header">${escapeHtml(group.supplierName)} &mdash; <span class="supplier-order-block-po">${escapeHtml(vendorPoNumber(order, group.supplierId))}</span></p>`;
      const timelines = group.shipments
        .map((s) =>
          compactMilestoneTimeline(
            s.milestones,
            group.shipments.length > 1 ? { label: s.tracking_number || "Shipment" } : {}
          )
        )
        .join("");
      return `
      <div class="supplier-order-block">
        ${headerHtml}
        ${timelines}
      </div>`;
    })
    .join("");

  return `
    <div class="card">
      <h2>Status on PM's Orders to Suppliers</h2>
      <p><a href="/orders/${order.id}">${escapeHtml(order.po_number)}</a> &mdash; ${escapeHtml(order.pipeline_stage)}</p>
      ${blocks}
    </div>`;
}

function supplierInquiriesSection(rfqId, inquiries) {
  const rows = inquiries
    .map(
      (inq) => `
    <tr>
      <td><a href="/supplier-inquiries/${inq.id}">${escapeHtml(inq.inquiry_number)}</a></td>
      <td>${escapeHtml(inq.supplier_name)}</td>
      <td>${escapeHtml(inq.status)}</td>
      <td>${escapeHtml(inq.line_item_descriptions || "—")}</td>
      <td><a href="/inquiries/${inq.id}/print">Print</a></td>
    </tr>`
    )
    .join("");

  return `
    <div class="card">
      <h2>Supplier Inquiries</h2>
      <p><a class="btn btn-secondary" href="/rfqs/${rfqId}/inquiries/new">+ New Sourcing Inquiry</a></p>
      <table>
        <thead>
          <tr><th>Inquiry #</th><th>Vendor</th><th>Status</th><th>Line Items</th><th></th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5">No inquiries sent yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function freightInquiriesSection(rfqId, freightInquiries, selectedFreightBySupplierId) {
  const rows = freightInquiries
    .map((fi) => {
      const selected = fi.supplier_id != null ? selectedFreightBySupplierId.get(fi.supplier_id) : undefined;
      const selectedForwarderText = selected ? selected.freightForwarderName : "—";
      const selectedPriceText = selected && selected.usdPrice != null ? formatCurrency(selected.usdPrice) : "—";
      const compareLinkText = selected ? "Change Forwarder" : "Compare Freight Quotes";
      return `
    <tr>
      <td><a href="/freight-inquiries/${fi.id}/print">${escapeHtml(fi.frq_number)}</a></td>
      <td>${escapeHtml(fi.freight_forwarder_name)}</td>
      <td>${escapeHtml(fi.status)}</td>
      <td>${escapeHtml(fi.line_item_descriptions || "—")}</td>
      <td>${escapeHtml(selectedForwarderText)}</td>
      <td>${escapeHtml(selectedPriceText)}</td>
      <td>${
        fi.supplier_id != null
          ? `<a href="/rfqs/${rfqId}/freight-inquiries/${fi.id}/compare">${compareLinkText}</a>`
          : "—"
      }</td>
    </tr>`;
    })
    .join("");

  return `
    <div class="card">
      <h2>Freight Inquiries</h2>
      <p><a class="btn btn-secondary" href="/rfqs/${rfqId}/freight-inquiries/new">+ New Freight Inquiry</a></p>
      <table>
        <thead>
          <tr><th>FRQ #</th><th>Forwarder</th><th>Status</th><th>Line Items</th><th>Selected Forwarder</th><th>Selected Price</th><th></th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7">No freight inquiries sent yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

// Supplier was contacted but never sent pricing back (Declined/Expired) —
// doesn't belong to any item-line group, so it's listed separately below
// the groups rather than grafted onto one.
function noQuoteReceivedRow(r) {
  return `
    <tr>
      <td><a href="/supplier-inquiries/${r.supplier_inquiry_id}">${escapeHtml(r.inquiry_number)}</a></td>
      <td>${escapeHtml(r.supplier_name)} (${escapeHtml(r.supplier_country)})</td>
      <td colspan="7">${escapeHtml(r.outreach_status)} — no quote received</td>
    </tr>`;
}

// isBestPrice/isBestLeadTime are computed once per item-line group (see
// supplierComparisonSection) and highlight independently — the cheapest
// vendor for a line isn't necessarily the fastest one. Lead time here is
// the vendor's own quoted lead time only, never freight — a non-winning
// vendor structurally never has a freight quote to compare (see
// freightUnitUsd's own comment below).
function supplierComparisonRow(r, { isBestPrice, isBestLeadTime }) {
  const freightText = r.freightUnitUsd == null ? "—" : formatCurrency(r.freightUnitUsd);
  const usdPriceText = r.unitPriceUsd == null ? "—" : formatCurrency(r.unitPriceUsd);
  const leadTimeText = r.lead_time_days == null ? "—" : escapeHtml(r.lead_time_days);
  return `
    <tr>
      <td><a href="/supplier-inquiries/${r.supplier_inquiry_id}">${escapeHtml(r.inquiry_number)}</a></td>
      <td>${escapeHtml(r.supplier_name)} (${escapeHtml(r.supplier_country)})</td>
      <td>${escapeHtml(formatCurrency(r.unit_price, ""))} ${escapeHtml(r.currency)}</td>
      <td class="${isBestPrice ? "cell-best" : ""}">${escapeHtml(usdPriceText)}</td>
      <td class="${isBestLeadTime ? "cell-best" : ""}">${leadTimeText}</td>
      <td>${escapeHtml(r.availability)}</td>
      <td>${escapeHtml(r.weight_kg)} kg / ${escapeHtml(r.dimensions)}</td>
      <td>${escapeHtml(formatCurrency(r.crating_cost, ""))} ${escapeHtml(r.currency)}</td>
      <td>${escapeHtml(freightText)}</td>
    </tr>`;
}

// Grouped by RFQ line item (not by vendor) — every vendor quote for one
// line item together, then the next line item. A vendor that didn't quote
// a given line simply produced no row for it in the query, so there's
// nothing to skip here. Rows arrive already in
// (rfq_line_item_id, supplier name) order from SUPPLIER_COMPARISON_QUERY.
function supplierComparisonSection(rows) {
  if (!rows.length) {
    return "";
  }

  const quotedRows = rows.filter((r) => r.line_item_description);
  const noQuoteRows = rows.filter((r) => !r.line_item_description);

  const groups = [];
  const groupByLineItemId = new Map();
  quotedRows.forEach((r) => {
    if (!groupByLineItemId.has(r.rfq_line_item_id)) {
      const group = {
        description: r.line_item_description,
        quantity: r.line_item_quantity,
        unit: r.line_item_unit,
        rows: [],
      };
      groupByLineItemId.set(r.rfq_line_item_id, group);
      groups.push(group);
    }
    groupByLineItemId.get(r.rfq_line_item_id).rows.push(r);
  });

  const groupsHtml = groups
    .map((group) => {
      const usdPrices = group.rows.map((r) => r.unitPriceUsd).filter((v) => v != null);
      const bestUsdPrice = usdPrices.length ? Math.min(...usdPrices) : null;
      const leadTimes = group.rows.map((r) => r.lead_time_days).filter((v) => v != null);
      const bestLeadTime = leadTimes.length ? Math.min(...leadTimes) : null;

      const vendorRowsHtml = group.rows
        .map((r) =>
          supplierComparisonRow(r, {
            isBestPrice: bestUsdPrice != null && r.unitPriceUsd === bestUsdPrice,
            isBestLeadTime: bestLeadTime != null && r.lead_time_days === bestLeadTime,
          })
        )
        .join("");

      return `
    <tr class="table-group-header"><td colspan="9">${escapeHtml(group.quantity)} ${escapeHtml(group.unit)} &mdash; ${escapeHtml(group.description)}</td></tr>${vendorRowsHtml}`;
    })
    .join("");

  const noQuoteRowsHtml = noQuoteRows.map(noQuoteReceivedRow).join("");

  return `
    <div class="card">
      <h2>Supplier Comparison</h2>
      <table>
        <thead>
          <tr>
            <th>Inquiry #</th><th>Vendor</th><th>Unit Price</th><th>Unit Price (USD)</th><th>Lead Time (days)</th>
            <th>Availability</th><th>Weight / Dimensions</th><th>Crating Cost</th><th>Freight Cost</th>
          </tr>
        </thead>
        <tbody>${groupsHtml}${noQuoteRowsHtml}</tbody>
      </table>
    </div>`;
}

// freightDisplayMode: "separate" (default, freight is its own row) or
// "included" (freight folded into each item's own buy/sell/margin, no
// separate row) — a pure view toggle, not saved anywhere. quoteDisplayRows
// is already the right shape for whichever mode is active (see rfqs.js:
// buildLandedLineItemRows for "included", plain displayRows otherwise) —
// this function just renders whatever it's given, same as before.
function freightViewToggle(rfqId, freightDisplayMode) {
  const separateActive = freightDisplayMode !== "included";
  return `
    <p>
      View freight:
      <a href="/rfqs/${rfqId}?freight=separate"${separateActive ? ' style="font-weight:700;"' : ""}>As its own line</a>
      &middot;
      <a href="/rfqs/${rfqId}?freight=included"${!separateActive ? ' style="font-weight:700;"' : ""}>Included in items</a>
    </p>`;
}

function quoteActions(rfq, quote, order) {
  if (quote.status === "Draft") {
    return `
      <a class="btn btn-secondary" href="/rfqs/${rfq.id}/quote/new">Edit Draft Quote</a>
      <form method="POST" action="/rfqs/${rfq.id}/quote/mark-sent" style="display:inline;">
        <button type="submit" class="btn btn-primary">Mark as Sent</button>
      </form>`;
  }
  // Revising once an Order already exists would be misleading — the
  // order/PO total is fixed to whichever version was active at
  // conversion time, and nothing propagates a later quote edit into it.
  if (order) {
    return `<p style="color: var(--color-text-muted);">This quote can no longer be revised — an order already exists for this job.</p>`;
  }
  return `<a class="btn btn-secondary" href="/rfqs/${rfq.id}/quote/new">Revise Quote</a>`;
}

// Prior (always 'Superseded') versions, most recent first — sell prices
// only, deliberately no buy price/margin: buy price depends on CURRENT
// sourcing, which isn't itself versioned, so computing "margin" for an
// old version against today's sourcing could show a number that never
// actually applied when that version was sent. Each entry is its own
// <details> so the page doesn't get crowded by default; each links to
// its own print document.
function quoteHistorySection(rfqId, quoteHistory) {
  if (!quoteHistory.length) return "";

  const entries = quoteHistory
    .map((q) => {
      const rows = q.lines
        .map(
          (l) => `
      <tr>
        <td>${escapeHtml(l.description)}</td>
        <td>${escapeHtml(l.quantity)}</td>
        <td>${escapeHtml(l.unit)}</td>
        <td>${escapeHtml(formatCurrency(l.unit_price_usd))}</td>
      </tr>`
        )
        .join("");
      const freightRowHtml =
        q.freight_sell_price_usd == null
          ? ""
          : `
      <tr>
        <td>Freight</td>
        <td></td>
        <td></td>
        <td>${escapeHtml(formatCurrency(q.freight_sell_price_usd))}</td>
      </tr>`;

      return `
    <details class="quote-history-entry">
      <summary>${escapeHtml(q.quote_number)} (v${escapeHtml(q.version)}) &mdash; ${escapeHtml(q.status)} &middot; ${escapeHtml(formatDate(q.created_date))}</summary>
      <table>
        <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Sell Price</th></tr></thead>
        <tbody>${rows}${freightRowHtml}</tbody>
      </table>
      <p><a href="/rfqs/${rfqId}/quote/${q.id}/print">Print</a></p>
    </details>`;
    })
    .join("");

  return `
    <div class="card">
      <h2>Quote History</h2>
      <p>Prior versions, most recent first — sell prices only, exactly as they were sent at the time.</p>
      ${entries}
    </div>`;
}

function quoteSection(rfq, quote, quoteDisplayRows, freightRow, totals, anySourced, freightDisplayMode, order) {
  if (!quote) {
    if (!anySourced) {
      return '<div class="card"><h2>Quote</h2><p>No quote yet — select a vendor for at least one line item first.</p></div>';
    }
    return `
    <div class="card">
      <h2>Quote</h2>
      <p>No quote yet.</p>
      <p><a class="btn btn-primary" href="/rfqs/${rfq.id}/quote/new">Create Quote</a></p>
    </div>`;
  }

  const showFreightRow = freightDisplayMode !== "included";

  const quoteRows = quoteDisplayRows
    .map((row) => {
      if (!row.sourced) {
        return `
    <tr>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td colspan="4" class="text-negative">Not sourced</td>
    </tr>`;
      }
      // Only lines actually saved on this quote have a sell price — a
      // sourced-but-not-yet-quoted line (added after this quote was
      // created) has nothing to show here.
      if (row.sellUnitPriceUsd == null) return "";

      return `
    <tr>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      ${costMarginCells(row, { showTotalSell: true })}
    </tr>`;
    })
    .join("");

  // Same "only shows if actually saved" rule as an item line — a quote
  // created before the Freight line existed has no freight_sell_price_usd
  // yet, so nothing renders here for it rather than a misleading blank row.
  // Also skipped entirely in "included" mode, where its buy/sell has
  // already been folded into the item rows above instead.
  const freightRowHtml =
    !showFreightRow || freightRow.sellUnitPriceUsd == null
      ? ""
      : `
    <tr>
      <td>${escapeHtml(freightRow.description)}</td>
      <td>${escapeHtml(freightRow.quantity)}</td>
      <td>${escapeHtml(freightRow.unit)}</td>
      ${costMarginCells(freightRow, { showTotalSell: true })}
    </tr>`;

  // A real row in the table, not a text line below it — same convention
  // as quotePrintPage.js's own totals row. Qty/Unit/Sell Price stay blank:
  // summing a per-unit price or mixed units doesn't mean anything. No
  // Total Freight cell — it's redundant with what's already on screen: in
  // "As its own line" mode it would just repeat the Freight row's own Buy
  // Price, and in "Included in items" mode freight is already folded into
  // each item's Buy Price, so a separate freight total would either
  // duplicate or double-count depending on the view.
  const totalsRow = totals
    ? `
    <tr class="total-row">
      <td>Total</td>
      <td></td>
      <td></td>
      <td>${escapeHtml(formatCurrency(totals.totalBuyUsd))}</td>
      <td></td>
      <td>${escapeHtml(formatCurrency(totals.totalSellUsd))}</td>
      <td class="${marginClass(totals.marginUsd)}">${escapeHtml(formatCurrency(totals.marginUsd))} (${totals.marginPct == null ? "—" : `${totals.marginPct.toFixed(1)}%`})</td>
    </tr>`
    : "";

  return `
    <div class="card">
      <h2>Quote ${escapeHtml(quote.quote_number)} (v${escapeHtml(quote.version)})</h2>
      <p>Status: ${escapeHtml(quote.status)} &middot; Created: ${escapeHtml(formatDate(quote.created_date))} &middot; Valid until: ${escapeHtml(formatDate(quote.valid_until))}</p>
      ${freightViewToggle(rfq.id, freightDisplayMode)}
      <table>
        <thead>
          <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Buy Price</th><th>Sell Price</th><th>Total Sell Price</th><th>Margin</th></tr>
        </thead>
        <tbody>${quoteRows}${freightRowHtml}${totalsRow}</tbody>
      </table>
      <p><a class="btn btn-secondary" href="/rfqs/${rfq.id}/quote/${quote.id}/print">Print / Create Report</a> ${quoteActions(rfq, quote, order)}</p>
    </div>`;
}

function rfqDetailPage({
  rfq,
  lineItems,
  quote,
  displayRows = [],
  quoteDisplayRows = [],
  freightRow = null,
  freightDisplayMode = "separate",
  totals = null,
  anySourced = false,
  estimatedArrivalDate = null,
  shipmentSizeEstimate = null,
  supplierComparison = [],
  quoteHistory = [],
  rfqAttachments = [],
  customerFacingAttachments = [],
  supplierInquiries = [],
  supplierInquiryAttachmentsByInquiryId = new Map(),
  freightInquiries = [],
  selectedFreightBySupplierId = new Map(),
  order = null,
  shipments = [],
}) {
  const displayRowsByLineItemId = new Map(displayRows.map((row) => [row.rfqLineItemId, row]));

  const body = `
    <a class="back-link" href="/rfqs">&larr; All RFQs</a>
    <h1>${escapeHtml(rfq.job_number)} — ${escapeHtml(rfq.project_name)} <span style="color: var(--color-text-muted); font-size: 0.6em; font-weight: normal;">(${escapeHtml(rfq.rfq_number)})</span></h1>
    <p>Status: ${escapeHtml(rfq.status)} &middot; Created: ${escapeHtml(formatDate(rfq.created_date))} &middot; Due: ${escapeHtml(formatDate(rfq.due_date))}${order ? ` &middot; <a href="/orders/${order.id}">View Order (${escapeHtml(order.po_number)}) &rarr;</a>` : ""}</p>

    ${orderSummaryBlock(rfq, quote, totals, estimatedArrivalDate, shipmentSizeEstimate)}

    ${supplierOrdersSection(rfq, order, shipments)}

    <div class="card">
      <h2>Line Items</h2>
      <table>
        <thead>
          <tr>
            <th>Item #</th><th>Material</th><th>Product Form</th><th>Standard</th><th>Description</th>
            <th>Qty</th><th>Unit</th><th>Length</th><th>Vendor</th>
            <th>Buy Price</th><th>Sell Price</th><th>Gross Margin</th><th>Sourcing</th>
          </tr>
        </thead>
        <tbody>${lineItemRows(rfq.id, lineItems, displayRowsByLineItemId)}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Contact</h2>
      <p>
        ${escapeHtml(rfq.contact_name)}, ${escapeHtml(rfq.contact_title)}<br>
        ${escapeHtml(rfq.contact_email)} &middot; ${escapeHtml(rfq.contact_phone)}
      </p>
    </div>

    ${quoteSection(rfq, quote, quoteDisplayRows, freightRow, totals, anySourced, freightDisplayMode, order)}

    ${quoteHistorySection(rfq.id, quoteHistory)}

    ${supplierInquiriesSection(rfq.id, supplierInquiries)}

    ${freightInquiriesSection(rfq.id, freightInquiries, selectedFreightBySupplierId)}

    ${supplierComparisonSection(supplierComparison)}

    ${rfqAttachmentsSection(rfq.id, rfqAttachments)}

    ${customerFacingAttachmentsSection(rfq.id, customerFacingAttachments)}

    ${supplierInquiryAttachmentsSection(supplierInquiries, supplierInquiryAttachmentsByInquiryId)}
  `;

  return layout({ title: rfq.job_number, bodyHtml: body });
}

module.exports = { rfqDetailPage };
