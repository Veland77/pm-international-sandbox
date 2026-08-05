// src/views/rfqDetail.js
// Renders a single RFQ's detail page: account/contact, line items, and linked quote if any.

const { layout } = require("./layout");
const { escapeHtml } = require("./htmlHelpers");

function orderSummaryBlock(rfq, quote, orderSummary) {
  const { totalOrderValueUsd, grossProfitUsd, grossProfitPct, estimatedArrivalDate } = orderSummary;
  const profitPctText = grossProfitPct === null ? "—" : `${grossProfitPct.toFixed(1)}%`;

  return `
    <div>
      <h2>Order Summary</h2>
      <p>
        Total Order Value: $${escapeHtml(totalOrderValueUsd.toFixed(2))}<br>
        Total Gross Profit: $${escapeHtml(grossProfitUsd.toFixed(2))} (${escapeHtml(profitPctText)})
      </p>
      <p>
        Customer Requested Delivery: ${escapeHtml(rfq.customer_requested_delivery_date || "—")}<br>
        PM Promised Delivery: ${escapeHtml((quote && quote.promised_delivery_date) || "—")}<br>
        Estimated Vendor Arrival: ${escapeHtml(estimatedArrivalDate || "—")}
      </p>
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
      const buyPriceText = margin ? `$${margin.buyUnitPriceUsd.toFixed(2)}` : "—";
      const sellPriceText = margin ? `$${margin.sellUnitPriceUsd.toFixed(2)}` : "—";
      const marginText = margin
        ? `$${margin.marginUnitUsd.toFixed(2)} (${margin.marginPct === null ? "—" : `${margin.marginPct.toFixed(1)}%`})`
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
      <td>${escapeHtml(marginText)}</td>
    </tr>`;
    })
    .join("");
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
      <td>${escapeHtml(r.inquiry_number)}</td>
      <td>${escapeHtml(r.supplier_name)} (${escapeHtml(r.supplier_country)})</td>
      <td colspan="6">${escapeHtml(r.outreach_status)} — no quote received</td>
    </tr>`;
      }
      return `
    <tr>
      <td>${escapeHtml(r.inquiry_number)}</td>
      <td>${escapeHtml(r.supplier_name)} (${escapeHtml(r.supplier_country)})</td>
      <td>${escapeHtml(r.line_item_description)}</td>
      <td>${escapeHtml(r.unit_price)} ${escapeHtml(r.currency)}</td>
      <td>${escapeHtml(r.lead_time_days)}</td>
      <td>${escapeHtml(r.availability)}</td>
      <td>${escapeHtml(r.weight_kg)} kg / ${escapeHtml(r.dimensions)}</td>
      <td>${escapeHtml(r.crating_cost)} ${escapeHtml(r.currency)}</td>
    </tr>`;
    })
    .join("");

  return `
    <h2>Supplier Comparison</h2>
    <table>
      <thead>
        <tr><th>Inquiry #</th><th>Vendor</th><th>Line Item</th><th>Unit Price</th><th>Lead Time (days)</th><th>Availability</th><th>Weight / Dimensions</th><th>Crating Cost</th></tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`;
}

function quoteSection(quote, quoteLineItems) {
  if (!quote) {
    return "<h2>Quote</h2><p>No quote yet.</p>";
  }

  const quoteRows = quoteLineItems
    .map(
      (qli) => `
    <tr>
      <td>${escapeHtml(qli.description)}</td>
      <td>${escapeHtml(qli.quantity)}</td>
      <td>${escapeHtml(qli.unit)}</td>
      <td>$${escapeHtml(qli.unit_price_usd)}</td>
      <td>${escapeHtml(qli.lead_time_days)}</td>
      <td>${escapeHtml(qli.target_margin_pct)}%</td>
    </tr>`
    )
    .join("");

  return `
    <h2>Quote ${escapeHtml(quote.quote_number)} (v${escapeHtml(quote.version)})</h2>
    <p>Status: ${escapeHtml(quote.status)} &middot; Created: ${escapeHtml(quote.created_date)} &middot; Valid until: ${escapeHtml(quote.valid_until)}</p>
    <table>
      <thead>
        <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price (USD)</th><th>Lead Time (days)</th><th>Target Margin %</th></tr>
      </thead>
      <tbody>${quoteRows}</tbody>
    </table>`;
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
}) {
  const body = `
    <a class="back-link" href="/rfqs">&larr; All RFQs</a>
    <h1>${escapeHtml(rfq.rfq_number)} — ${escapeHtml(rfq.project_name)}</h1>

    ${orderSummaryBlock(rfq, quote, orderSummary)}

    <p style="font-size: 1.2em"><strong>Pipeline Stage: ${escapeHtml(rfq.pipeline_stage)}</strong></p>
    <p>Status: ${escapeHtml(rfq.status)} &middot; Created: ${escapeHtml(rfq.created_date)} &middot; Due: ${escapeHtml(rfq.due_date)}</p>

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

    ${quoteSection(quote, quoteLineItems)}

    ${supplierComparisonSection(supplierComparison)}
  `;

  return layout({ title: rfq.rfq_number, bodyHtml: body });
}

module.exports = { rfqDetailPage };
