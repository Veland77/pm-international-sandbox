// src/views/rfqDetail.js
// Renders a single RFQ's detail page: account/contact, line items, and linked quote if any.

const { layout } = require("./layout");
const { escapeHtml, formatDate, formatCurrency } = require("./htmlHelpers");
const { rfqAttachmentsSection } = require("./rfqAttachmentsSection");
const { supplierInquiryAttachmentsSection } = require("./supplierInquiryAttachmentsSection");
const { compactMilestoneTimeline } = require("./milestoneTimeline");

function marginClass(amount) {
  if (amount == null) return "";
  return amount >= 0 ? "text-positive" : "text-negative";
}

function orderSummaryBlock(rfq, quote, orderSummary) {
  const { totalOrderValueUsd, grossProfitUsd, grossProfitPct, estimatedArrivalDate } = orderSummary;
  const profitPctText = grossProfitPct === null ? "—" : `${grossProfitPct.toFixed(1)}%`;

  return `
    <div class="dashboard-card">
      <h2>Order Summary</h2>
      <div class="dashboard-stats">
        <div>
          <div class="stat-label">Pipeline Stage</div>
          <div class="stat-value">${escapeHtml(rfq.pipeline_stage)}</div>
        </div>
        <div>
          <div class="stat-label">Total Order Value</div>
          <div class="stat-value">${escapeHtml(formatCurrency(totalOrderValueUsd))}</div>
        </div>
        <div>
          <div class="stat-label">Total Gross Profit</div>
          <div class="stat-value ${marginClass(grossProfitUsd)}">${escapeHtml(formatCurrency(grossProfitUsd))} (${escapeHtml(profitPctText)})</div>
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
      </div>
    </div>`;
}

function lineItemRows(rfqId, lineItems, sourcingRows, lineItemMargins) {
  const vendorByLineItemId = new Map(sourcingRows.map((r) => [r.rfq_line_item_id, r.supplier_name]));

  return lineItems
    .map((li) => {
      const notConverted = li.item_number_status === "Not Converted";
      const oversized = li.length_m != null && li.length_m > 6;
      const lengthText = li.length_m == null ? "—" : `${li.length_m} m`;
      const vendor = vendorByLineItemId.get(li.id) || "—";
      const margin = lineItemMargins.get(li.id);
      const buyPriceText = margin ? formatCurrency(margin.buyUnitPriceUsd) : "—";
      const sellPriceText = margin ? formatCurrency(margin.sellUnitPriceUsd) : "—";
      const marginText = margin
        ? `${formatCurrency(margin.marginUnitUsd)} (${margin.marginPct === null ? "—" : `${margin.marginPct.toFixed(1)}%`})`
        : "—";
      const compareLinkText = vendorByLineItemId.has(li.id) ? "Change Vendor" : "Compare Vendors";
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
      <td>${escapeHtml(buyPriceText)}</td>
      <td>${escapeHtml(sellPriceText)}</td>
      <td class="${margin ? marginClass(margin.marginUnitUsd) : ""}">${escapeHtml(marginText)}</td>
      <td><a href="/rfqs/${rfqId}/line-items/${li.id}/compare">${compareLinkText}</a></td>
    </tr>`;
    })
    .join("");
}

// Shown directly beneath the Order Summary card. Before conversion, this is
// just the "Convert to Order" call to action (only offered once the deal is
// Won); afterward, it's a link to the order plus each shipment's compact
// milestone strip.
function orderSection(rfq, order, shipments) {
  if (!order) {
    if (rfq.status !== "Won") return "";
    return `
    <div class="card">
      <h2>Order</h2>
      <p>This RFQ has been won. Convert it to an order once the customer's PO is in hand.</p>
      <p><a class="btn btn-primary" href="/rfqs/${rfq.id}/convert-to-order">Convert to Order</a></p>
    </div>`;
  }

  const timelines = shipments
    .map((s) => compactMilestoneTimeline(s.milestones, { label: s.supplier_name || "Shipment" }))
    .join("");

  return `
    <div class="card">
      <h2>Order</h2>
      <p><a href="/orders/${order.id}">${escapeHtml(order.po_number)}</a> &mdash; ${escapeHtml(order.pipeline_stage)}</p>
      ${timelines}
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

function supplierComparisonSection(rows) {
  if (!rows.length) {
    return "";
  }

  const tableRows = rows
    .map((r) => {
      if (!r.line_item_description) {
        // Supplier was contacted but never sent pricing back (Declined/Expired).
        return `
    <tr>
      <td><a href="/supplier-inquiries/${r.supplier_inquiry_id}">${escapeHtml(r.inquiry_number)}</a></td>
      <td>${escapeHtml(r.supplier_name)} (${escapeHtml(r.supplier_country)})</td>
      <td colspan="6">${escapeHtml(r.outreach_status)} — no quote received</td>
    </tr>`;
      }
      return `
    <tr>
      <td><a href="/supplier-inquiries/${r.supplier_inquiry_id}">${escapeHtml(r.inquiry_number)}</a></td>
      <td>${escapeHtml(r.supplier_name)} (${escapeHtml(r.supplier_country)})</td>
      <td>${escapeHtml(r.line_item_description)}</td>
      <td>${escapeHtml(formatCurrency(r.unit_price, ""))} ${escapeHtml(r.currency)}</td>
      <td>${escapeHtml(r.lead_time_days)}</td>
      <td>${escapeHtml(r.availability)}</td>
      <td>${escapeHtml(r.weight_kg)} kg / ${escapeHtml(r.dimensions)}</td>
      <td>${escapeHtml(formatCurrency(r.crating_cost, ""))} ${escapeHtml(r.currency)}</td>
    </tr>`;
    })
    .join("");

  return `
    <div class="card">
      <h2>Supplier Comparison</h2>
      <table>
        <thead>
          <tr><th>Inquiry #</th><th>Vendor</th><th>Line Item</th><th>Unit Price</th><th>Lead Time (days)</th><th>Availability</th><th>Weight / Dimensions</th><th>Crating Cost</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

function quoteSection(rfq, quote, quoteDisplayRows, quoteTotals, anySourced) {
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

  const quoteRows = quoteDisplayRows
    .map((row) => {
      if (!row.sourced) {
        return `
    <tr>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td colspan="3" class="text-negative">Not sourced</td>
    </tr>`;
      }
      // Only lines actually saved on this quote have a sell price — a
      // sourced-but-not-yet-quoted line (added after this quote was
      // created) has nothing to show here.
      if (row.sellUnitPriceUsd == null) return "";

      const marginText =
        row.marginUnitUsd == null
          ? "—"
          : `${formatCurrency(row.marginUnitUsd)} (${row.marginPct == null ? "—" : `${row.marginPct.toFixed(1)}%`})`;

      return `
    <tr>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unit)}</td>
      <td>${escapeHtml(formatCurrency(row.buyUnitPriceUsd))}</td>
      <td>${escapeHtml(formatCurrency(row.sellUnitPriceUsd))}</td>
      <td class="${marginClass(row.marginUnitUsd)}">${escapeHtml(marginText)}</td>
    </tr>`;
    })
    .join("");

  const totalsText = quoteTotals
    ? `<strong>Total Sell:</strong> ${escapeHtml(formatCurrency(quoteTotals.totalSellUsd))} &middot;
       <strong>Total Buy:</strong> ${escapeHtml(formatCurrency(quoteTotals.totalBuyUsd))} &middot;
       <strong>Total Margin:</strong> <span class="${marginClass(quoteTotals.marginUsd)}">${escapeHtml(formatCurrency(quoteTotals.marginUsd))} (${quoteTotals.marginPct == null ? "—" : `${quoteTotals.marginPct.toFixed(1)}%`})</span>`
    : "";

  const actions =
    quote.status === "Draft"
      ? `
      <a class="btn btn-secondary" href="/rfqs/${rfq.id}/quote/new">Edit Draft Quote</a>
      <form method="POST" action="/rfqs/${rfq.id}/quote/mark-sent" style="display:inline;">
        <button type="submit" class="btn btn-primary">Mark as Sent</button>
      </form>`
      : "";

  return `
    <div class="card">
      <h2>Quote ${escapeHtml(quote.quote_number)} (v${escapeHtml(quote.version)})</h2>
      <p>Status: ${escapeHtml(quote.status)} &middot; Created: ${escapeHtml(formatDate(quote.created_date))} &middot; Valid until: ${escapeHtml(formatDate(quote.valid_until))}</p>
      <table>
        <thead>
          <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Buy Price</th><th>Sell Price</th><th>Margin</th></tr>
        </thead>
        <tbody>${quoteRows}</tbody>
      </table>
      ${totalsText ? `<p>${totalsText}</p>` : ""}
      <p>${actions}</p>
    </div>`;
}

function rfqDetailPage({
  rfq,
  lineItems,
  quote,
  quoteDisplayRows = [],
  quoteTotals = null,
  anySourced = false,
  supplierComparison = [],
  sourcingRows = [],
  orderSummary,
  lineItemMargins = new Map(),
  rfqAttachments = [],
  supplierInquiries = [],
  supplierInquiryAttachmentsByInquiryId = new Map(),
  freightInquiries = [],
  selectedFreightBySupplierId = new Map(),
  order = null,
  shipments = [],
}) {
  const body = `
    <a class="back-link" href="/rfqs">&larr; All RFQs</a>
    <h1>${escapeHtml(rfq.rfq_number)} — ${escapeHtml(rfq.project_name)}</h1>
    <p>Status: ${escapeHtml(rfq.status)} &middot; Created: ${escapeHtml(formatDate(rfq.created_date))} &middot; Due: ${escapeHtml(formatDate(rfq.due_date))}</p>

    ${orderSummaryBlock(rfq, quote, orderSummary)}

    ${orderSection(rfq, order, shipments)}

    <div class="card">
      <h2>Account</h2>
      <p>
        ${escapeHtml(rfq.account_name)} (${escapeHtml(rfq.industry_segment)}, ${escapeHtml(rfq.account_region)}) &mdash; ${escapeHtml(rfq.account_status)}<br>
        Sales Rep: ${escapeHtml(rfq.sales_rep_name)}
      </p>
      <h2>Contact</h2>
      <p>
        ${escapeHtml(rfq.contact_name)}, ${escapeHtml(rfq.contact_title)}<br>
        ${escapeHtml(rfq.contact_email)} &middot; ${escapeHtml(rfq.contact_phone)}
      </p>
    </div>

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
        <tbody>${lineItemRows(rfq.id, lineItems, sourcingRows, lineItemMargins)}</tbody>
      </table>
    </div>

    ${quoteSection(rfq, quote, quoteDisplayRows, quoteTotals, anySourced)}

    ${supplierInquiriesSection(rfq.id, supplierInquiries)}

    ${freightInquiriesSection(rfq.id, freightInquiries, selectedFreightBySupplierId)}

    ${supplierComparisonSection(supplierComparison)}

    ${rfqAttachmentsSection(rfq.id, rfqAttachments)}

    ${supplierInquiryAttachmentsSection(supplierInquiries, supplierInquiryAttachmentsByInquiryId)}
  `;

  return layout({ title: rfq.rfq_number, bodyHtml: body });
}

module.exports = { rfqDetailPage };
