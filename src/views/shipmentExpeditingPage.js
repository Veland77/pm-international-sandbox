// src/views/shipmentExpeditingPage.js
// The Expediting workscreen for one shipment: logistics summary, the
// compact milestone timeline plus inline-editable detail rows, the
// running contact log, and shipment paperwork uploads.

const { layout } = require("./layout");
const { escapeHtml, formatDate } = require("./htmlHelpers");
const { compactMilestoneTimeline } = require("./milestoneTimeline");

const DOC_TYPES = [
  "Packing List",
  "Certificate of Compliance",
  "Mill Certificate",
  "Commercial Invoice",
  "Bill of Lading",
];

function logisticsSummary(shipment) {
  const vendorLabel = shipment.supplier_name || "Multiple / unassigned vendor";
  return `
    <div class="card">
      <h2>Logistics</h2>
      <p>
        Vendor: ${escapeHtml(vendorLabel)}<br>
        Forwarder: ${escapeHtml(shipment.freight_forwarder || "—")} &middot;
        Tracking: ${escapeHtml(shipment.tracking_number || "—")} &middot;
        Mode: ${escapeHtml(shipment.mode || "—")}<br>
        Origin: ${escapeHtml(shipment.origin || "—")} &middot;
        Destination: ${escapeHtml(shipment.destination || "—")}<br>
        Ship Date: ${escapeHtml(formatDate(shipment.ship_date))} &middot;
        ETA: ${escapeHtml(formatDate(shipment.eta))} &middot;
        POD Received: ${escapeHtml(formatDate(shipment.pod_received))}
      </p>
    </div>`;
}

function milestoneEditRow(shipmentId, milestone) {
  return `
    <div class="milestone-edit-row">
      <h3>${escapeHtml(milestone.milestone_type)}</h3>
      <form method="POST" action="/shipments/${shipmentId}/milestones/${milestone.id}" class="milestone-edit-form">
        <label class="field">
          <span class="field-label">Estimated Date</span>
          <input type="date" name="estimated_date" value="${escapeHtml(milestone.estimated_date || "")}">
        </label>
        <label class="field">
          <span class="field-label">Actual Date</span>
          <input type="date" name="actual_date" value="${escapeHtml(milestone.actual_date || "")}">
        </label>
        <label class="field">
          <span class="field-label">Notes</span>
          <textarea name="notes" class="auto-grow">${escapeHtml(milestone.notes || "")}</textarea>
        </label>
        <button type="submit" class="btn btn-secondary">Save</button>
      </form>
    </div>`;
}

function logSection(shipmentId, logEntries) {
  const rows = logEntries
    .map(
      (entry) => `
    <tr>
      <td>${escapeHtml(formatDate(entry.entry_date))}</td>
      <td>${escapeHtml(entry.contact_type)}</td>
      <td>${escapeHtml(entry.note)}</td>
      <td>${escapeHtml(entry.follow_up_date ? formatDate(entry.follow_up_date) : "—")}</td>
    </tr>`
    )
    .join("");

  return `
    <div class="card">
      <h2>Expediting Log</h2>
      <table>
        <thead>
          <tr><th>Date</th><th>Type</th><th>Note</th><th>Follow-Up</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4">No log entries yet.</td></tr>'}</tbody>
      </table>
      <form method="POST" action="/shipments/${shipmentId}/log">
        <label class="field">
          <span class="field-label">Contact Type</span>
          <select name="contact_type">
            <option value="Call">Call</option>
            <option value="Email">Email</option>
            <option value="Note">Note</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Note</span>
          <textarea name="note" class="auto-grow" required></textarea>
        </label>
        <label class="field">
          <span class="field-label">Follow-Up Date (optional)</span>
          <input type="date" name="follow_up_date">
        </label>
        <button type="submit" class="btn btn-primary">Add Log Entry</button>
      </form>
    </div>`;
}

function documentsSection(shipmentId, documents) {
  const rows = documents
    .map(
      (d) => `
    <tr>
      <td><a href="/shipments/${shipmentId}/documents/${d.id}">${escapeHtml(d.original_filename)}</a></td>
      <td>${escapeHtml(d.doc_type)}</td>
      <td>${escapeHtml(formatDate(d.uploaded_date))}</td>
    </tr>`
    )
    .join("");

  const fileInputId = `shipment-document-file-${shipmentId}`;
  const docTypeOptions = DOC_TYPES.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");

  return `
    <div class="card">
      <h2>Shipment Documents</h2>
      <table>
        <thead>
          <tr><th>File</th><th>Type</th><th>Uploaded</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="3">No documents yet.</td></tr>'}</tbody>
      </table>
      <form method="POST" action="/shipments/${shipmentId}/documents" enctype="multipart/form-data">
        <label class="field">
          <span class="field-label">Document Type</span>
          <select name="doc_type">${docTypeOptions}</select>
        </label>
        <div class="file-input">
          <input type="file" name="file" id="${fileInputId}" class="file-input-native" required>
          <label for="${fileInputId}" class="btn btn-secondary">Choose File</label>
          <span class="file-input-filename">No file chosen</span>
        </div>
        <button type="submit" class="btn btn-primary">Upload</button>
      </form>
    </div>`;
}

function shipmentExpeditingPage({ shipment, milestones, logEntries, documents }) {
  const body = `
    <a class="back-link" href="/orders/${shipment.order_id}">&larr; Back to ${escapeHtml(shipment.po_number)}</a>
    <h1>Expediting — ${escapeHtml(shipment.supplier_name || "Shipment")}</h1>
    <p>${escapeHtml(shipment.rfq_number)} &middot; ${escapeHtml(shipment.po_number)}</p>

    ${logisticsSummary(shipment)}

    <div class="card">
      <h2>Milestone Timeline</h2>
      ${compactMilestoneTimeline(milestones)}
    </div>

    <div class="card">
      <h2>Update Milestones</h2>
      ${milestones.map((m) => milestoneEditRow(shipment.id, m)).join("")}
    </div>

    <p><a class="btn btn-secondary" href="/rfqs/${shipment.rfq_id}/freight-inquiries/new">Request Freight Quote</a></p>

    ${logSection(shipment.id, logEntries)}

    ${documentsSection(shipment.id, documents)}
  `;

  return layout({ title: `Expediting — ${shipment.po_number}`, bodyHtml: body });
}

module.exports = { shipmentExpeditingPage };
