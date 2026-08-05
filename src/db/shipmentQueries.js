// src/db/shipmentQueries.js
// Read query backing the Expediting page's header — a shipment plus just
// enough order/RFQ context to link back to the order and to the freight
// inquiry form.

const SHIPMENT_QUERY = `
  SELECT sh.id, sh.freight_forwarder, sh.tracking_number, sh.mode, sh.origin, sh.destination,
         sh.ship_date, sh.eta, sh.pod_received,
         s.name AS supplier_name,
         o.id AS order_id, po.po_number,
         r.id AS rfq_id, r.rfq_number
  FROM shipments sh
  LEFT JOIN suppliers s ON s.id = sh.supplier_id
  JOIN orders o ON o.id = sh.order_id
  JOIN purchase_orders po ON po.id = o.po_id
  JOIN quotes q ON q.id = po.quote_id
  JOIN rfqs r ON r.id = q.rfq_id
  WHERE sh.id = ?
`;

function getShipmentById(db, id) {
  return db.prepare(SHIPMENT_QUERY).get(id);
}

module.exports = { getShipmentById };
