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

function lineItemRows(lineItems, sourcingRows, lineItemMargins) {
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

function quoteSection(quote, quoteLineItems) {
  if (!quote) {
    return '<div class="card"><h2>Quote</h2><p>No quote yet.</p></div>';
  }

  const quoteRows = quoteLineItems
    .map(
      (qli) => `
    <tr>
      <td>${escapeHtml(qli.description)}</td>
      <td>${escapeHtml(qli.quantity)}</td>
      <td>${escapeHtml(qli.unit)}</td>
      <td>${escapeHtml(formatCurrency(qli.unit_price_usd))}</td>
      <td>${escapeHtml(qli.lead_time_days)}</td>
      <td>${escapeHtml(qli.target_margin_pct)}%</td>
    </tr>`
    )
    .join("");

  return `
    <div class="card">
      <h2>Quote ${escapeHtml(quote.quote_number)} (v${escapeHtml(quote.version)})</h2>
      <p>Status: ${escapeHtml(quote.status)} &middot; Created: ${escapeHtml(formatDate(quote.created_date))} &middot; Valid until: ${escapeHtml(formatDate(quote.valid_until))}</p>
      <table>
        <thead>
          <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price (USD)</th><th>Lead Time (days)</th><th>Target Margin %</th></tr>
        </thead>
        <tbody>${quoteRows}</tbody>
      </table>
    </div>`;
}

function rfqDetailPage({
  rfq,
  lineItems,
  quote,
  quoteLineItems,
  supplierComparison = [],
  sourcingRows = [],
  orderSummary,
  lineItemMargins = new Map(),
  rfqAttachments = [],
  supplierInquiries = [],
  supplierInquiryAttachmentsByInquiryId = new Map(),
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
            <th>Buy Price</th><th>Sell Price</th><th>Gross Margin</th>
          </tr>
        </thead>
        <tbody>${lineItemRows(lineItems, sourcingRows, lineItemMargins)}</tbody>
      </table>
    </div>

    ${quoteSection(quote, quoteLineItems)}

    ${supplierInquiriesSection(rfq.id, supplierInquiries)}

    ${supplierComparisonSection(supplierComparison)}

    ${rfqAttachmentsSection(rfq.id, rfqAttachments)}

    ${supplierInquiryAttachmentsSection(supplierInquiries, supplierInquiryAttachmentsByInquiryId)}
  `;

  return layout({ title: rfq.rfq_number, bodyHtml: body });
}

module.exports = { rfqDetailPage };
