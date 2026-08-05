// src/views/milestoneTimeline.js
// Compact horizontal progress strip for a shipment's 6 milestone stages.
// Used on the RFQ detail page (beneath Order Summary) and reused by the
// Expediting workscreen. A stage is "done" once it has an actual_date; the
// first stage still missing one is "current"; everything after is "upcoming".

const { escapeHtml, formatDate } = require("./htmlHelpers");
const { MILESTONE_TYPES } = require("../db/shipmentMilestoneTypes");

function stageStatuses(orderedMilestones) {
  let currentAssigned = false;
  return orderedMilestones.map((m) => {
    if (m.actual_date) return "done";
    if (!currentAssigned) {
      currentAssigned = true;
      return "current";
    }
    return "upcoming";
  });
}

function compactMilestoneTimeline(milestones, { label } = {}) {
  const milestoneByType = new Map(milestones.map((m) => [m.milestone_type, m]));
  const ordered = MILESTONE_TYPES.map(
    (type) => milestoneByType.get(type) || { milestone_type: type, actual_date: null, estimated_date: null }
  );
  const statuses = stageStatuses(ordered);

  const steps = ordered
    .map((m, i) => {
      const status = statuses[i];
      const dateText = m.actual_date
        ? formatDate(m.actual_date)
        : m.estimated_date
          ? `Est. ${formatDate(m.estimated_date)}`
          : "—";
      return `
    <div class="milestone-step milestone-step-${status}">
      <div class="milestone-dot"></div>
      <div class="milestone-label">${escapeHtml(m.milestone_type)}</div>
      <div class="milestone-date">${escapeHtml(dateText)}</div>
    </div>`;
    })
    .join("");

  return `
    <div class="milestone-timeline-block">
      ${label ? `<div class="milestone-timeline-label">${escapeHtml(label)}</div>` : ""}
      <div class="milestone-timeline">${steps}</div>
    </div>`;
}

module.exports = { compactMilestoneTimeline };
