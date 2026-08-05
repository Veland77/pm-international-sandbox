// src/db/shipmentMilestoneQueries.js
// Reads and inline edits for a shipment's 6 milestone rows. All 6 already
// exist by the time this is used — they're auto-created (blank) whenever
// a shipment is created (see orderIntakeQueries.js and seed.js) — so this
// module only ever updates, never inserts.

const { MILESTONE_TYPES } = require("./shipmentMilestoneTypes");

function getMilestonesForShipment(db, shipmentId) {
  const milestones = db.prepare("SELECT * FROM shipment_milestones WHERE shipment_id = ?").all(shipmentId);
  milestones.sort(
    (a, b) => MILESTONE_TYPES.indexOf(a.milestone_type) - MILESTONE_TYPES.indexOf(b.milestone_type)
  );
  return milestones;
}

function getMilestoneById(db, id) {
  return db.prepare("SELECT * FROM shipment_milestones WHERE id = ?").get(id);
}

function updateMilestone(db, id, { estimatedDate, actualDate, notes }) {
  db.prepare("UPDATE shipment_milestones SET estimated_date = ?, actual_date = ?, notes = ? WHERE id = ?").run(
    estimatedDate || null,
    actualDate || null,
    notes || null,
    id
  );
}

module.exports = { getMilestonesForShipment, getMilestoneById, updateMilestone };
