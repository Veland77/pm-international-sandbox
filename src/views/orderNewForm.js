// src/views/orderNewForm.js
// "Convert to Order" form: record the customer's PO, then optionally
// reroute individual line items to ship with a different vendor. Default
// is one shipment per distinct vendor — changing a line's "Ships With"
// dropdown to another vendor already on this RFQ is how two vendors get
// combined into one shipment.

const { layout } = require("./layout");
const { escapeHtml, formatCurrency } = require("./htmlHelpers");

function errorList(errors) {
  if (!errors.length) return "";
  const items = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  return `<div class="form-errors"><strong>Please fix the following:</strong><ul>${items}</ul></div>`;
}

function vendorOptions(distinctSuppliers, selectedSupplierId) {
  return distinctSuppliers
    .map((s) => {
      const selected = String(selectedSupplierId) === String(s.supplier_id) ? " selected" : "";
      return `<option value="${s.supplier_id}"${selected}>${escapeHtml(s.supplier_name)}</option>`;
    })
    .join("");
}

function lineItemRows(sourcedLineItems, distinctSuppliers, chosenSupplierIdByLineItemId) {
  return sourcedLineItems
    .map((li) => {
      const chosen = chosenSupplierIdByLineItemId[li.rfq_line_item_id] ?? li.supplier_id;
      return `
    <tr>
      <td>${escapeHtml(li.description)}</td>
      <td>${escapeHtml(li.quantity)}</td>
      <td>${escapeHtml(li.unit)}</td>
      <td>${escapeHtml(formatCurrency(li.unit_price_usd * li.quantity))}</td>
      <td>
        <select name="line_item_supplier[${li.rfq_line_item_id}]">
          ${vendorOptions(distinctSuppliers, chosen)}
        </select>
      </td>
    </tr>`;
    })
    .join("");
}

function orderNewFormPage({ rfq, sourcedLineItems, formValues = {}, errors = [] }) {
  const distinctSuppliers = Array.from(new Map(sourcedLineItems.map((li) => [li.supplier_id, li])).values());
  const chosenSupplierIdByLineItemId = formValues.line_item_supplier || {};
  const totalValue = sourcedLineItems.reduce((sum, li) => sum + li.unit_price_usd * li.quantity, 0);

  const body = `
    <a class="back-link" href="/rfqs/${rfq.id}">&larr; Back to ${escapeHtml(rfq.rfq_number)}</a>
    <h1>Convert to Order — ${escapeHtml(rfq.rfq_number)}</h1>
    ${errorList(errors)}
    <form method="POST" action="/rfqs/${rfq.id}/convert-to-order">
      <div class="card">
        <h2>Purchase Order</h2>
        <label class="field">
          <span class="field-label">Customer PO Reference</span>
          <input type="text" name="customer_po_reference" value="${escapeHtml(formValues.customer_po_reference || "")}" required>
        </label>
        <label class="field">
          <span class="field-label">PO Received Date</span>
          <input type="date" name="received_date" value="${escapeHtml(formValues.received_date || "")}" required>
        </label>
      </div>

      <div class="card">
        <h2>Line Items &amp; Shipment Grouping</h2>
        <table>
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Order Value</th><th>Ships With</th></tr>
          </thead>
          <tbody>${lineItemRows(sourcedLineItems, distinctSuppliers, chosenSupplierIdByLineItemId)}</tbody>
        </table>
        <p style="color: var(--color-text-muted);">Defaults to one shipment per vendor. Change "Ships With" on a line to combine it into a different vendor's shipment.</p>
        <p><strong>Total Order Value: ${escapeHtml(formatCurrency(totalValue))}</strong></p>
      </div>

      <p><button type="submit" class="btn btn-primary">Create Order</button></p>
    </form>
  `;

  return layout({ title: `Convert to Order — ${rfq.rfq_number}`, bodyHtml: body });
}

module.exports = { orderNewFormPage };
