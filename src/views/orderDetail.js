// src/views/orderDetail.js
// Order detail page: PO info, sourced line items with margin, and each
// shipment's logistics summary plus compact milestone timeline.

const { layout } = require("./layout");
const { escapeHtml, formatDate, formatCurrency } = require("./htmlHelpers");
const { compactMilestoneTimeline } = require("./milestoneTimeline");

function marginClass(amount) {
  if (amount == null) return "";
  return amount >= 0 ? "text-positive" : "text-negative";
}

function lineItemRows(lineItems) {
  return lineItems
    .map((li) => {
      const marginUnit = li.buyUnitPriceUsd == null ? null : li.sell_unit_price_usd - li.buyUnitPriceUsd;
      const marginText = marginUnit == null ? "—" : formatCurrency(marginUnit);
      return `
    <tr>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity)}</td>
      <td>${escapeHtml(li.unit)}</td>
      <td>${escapeHtml(li.supplier_name)}</td>
      <td>${escapeHtml(formatCurrency(li.sell_unit_price_usd))}</td>
      <td class="${marginClass(marginUnit)}">${escapeHtml(marginText)}</td>
    </tr>`;
    })
    .join("");
}

function shipmentSection(shipment) {
  const vendorLabel = shipment.supplier_name || "Multiple / unassigned vendor";
  const details = [
    shipment.freight_forwarder ? `Forwarder: ${escapeHtml(shipment.freight_forwarder)}` : null,
    shipment.tracking_number ? `Tracking: ${escapeHtml(shipment.tracking_number)}` : null,
    shipment.mode ? `Mode: ${escapeHtml(shipment.mode)}` : null,
    shipment.origin ? `Origin: ${escapeHtml(shipment.origin)}` : null,
    shipment.destination ? `Destination: ${escapeHtml(shipment.destination)}` : null,
  ]
    .filter(Boolean)
    .join(" &middot; ");

  return `
    <div class="card">
      <h3>${escapeHtml(vendorLabel)}</h3>
      <p style="color: var(--color-text-muted);">${details || "No logistics details recorded yet."}</p>
      <p><a href="/shipments/${shipment.id}/expediting">Expediting &rarr;</a></p>
      ${compactMilestoneTimeline(shipment.milestones)}
    </div>`;
}

// Not yet generated: a real form/button (POST), so issuing a PO is a
// deliberate click, not a link you could bookmark or share your way past.
// Already generated: the PO number and issued date, plus a view/print
// link — no way to re-click Generate from here once it's been issued.
function vendorPoRow(orderId, poNumber, vendor, issuedDate) {
  if (!issuedDate) {
    return `
    <form method="POST" action="/orders/${orderId}/po/${vendor.supplier_id}/generate" style="display:inline;">
      <button type="submit" class="btn btn-primary">Generate Purchase Order — ${escapeHtml(vendor.supplier_name)}</button>
    </form>`;
  }
  return `
    <p>
      <strong>${escapeHtml(poNumber)}</strong> — Generated ${escapeHtml(formatDate(issuedDate))}
      (${escapeHtml(vendor.supplier_name)})
      &middot; <a href="/orders/${orderId}/po/${vendor.supplier_id}/print">View / Print</a>
    </p>`;
}

function vendorPoLinks(order, vendors, issuancesBySupplierId) {
  if (!vendors.length) return "";
  const rows = vendors
    .map((v) =>
      vendorPoRow(order.id, `${order.po_number}-S${v.supplier_id}`, v, issuancesBySupplierId.get(v.supplier_id))
    )
    .join("");
  return `
    <div class="card">
      <h2>Vendor Purchase Orders</h2>
      <p>One PO document per vendor sourced on this order.</p>
      ${rows}
    </div>`;
}

function orderDetailPage({ order, lineItems, shipments, vendors = [], issuancesBySupplierId = new Map() }) {
  const body = `
    <a class="back-link" href="/rfqs/${order.rfq_id}">&larr; Back to ${escapeHtml(order.job_number)}</a>
    <h1>${escapeHtml(order.po_number)} — ${escapeHtml(order.account_name)}</h1>
    <p>Pipeline Stage: ${escapeHtml(order.pipeline_stage)} &middot; Order Date: ${escapeHtml(formatDate(order.order_date))}</p>

    <div class="card">
      <h2>Purchase Order</h2>
      <p>
        Customer PO Reference: ${escapeHtml(order.customer_po_reference)}<br>
        Received: ${escapeHtml(formatDate(order.received_date))}<br>
        Total Value: ${escapeHtml(formatCurrency(order.total_value))}
      </p>
    </div>

    ${vendorPoLinks(order, vendors, issuancesBySupplierId)}

    <div class="card">
      <h2>Order Line Items</h2>
      <table>
        <thead>
          <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Vendor</th><th>Sell Price</th><th>Margin</th></tr>
        </thead>
        <tbody>${lineItemRows(lineItems)}</tbody>
      </table>
    </div>

    <h2>Shipments</h2>
    ${shipments.map(shipmentSection).join("")}
  `;

  return layout({ title: order.po_number, bodyHtml: body });
}

module.exports = { orderDetailPage };
