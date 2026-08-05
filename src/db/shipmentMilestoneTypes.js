// src/db/shipmentMilestoneTypes.js
// Canonical order of shipment milestone stages. Shared by seed.js (which
// auto-creates all 6, blank, whenever a shipment is created) and the
// Expediting/Order views (which sort by this order, not insertion id).

const MILESTONE_TYPES = [
  "Production",
  "Ready for Pickup/FCA",
  "Transit to Port/Airport",
  "Ocean/Air Transport",
  "Customs Clearance",
  "Final Delivery",
];

module.exports = { MILESTONE_TYPES };
