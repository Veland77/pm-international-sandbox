// src/db/orderQueries.js
// Read queries backing the Order detail page, plus a lookup used by the
// RFQ detail page to know whether an order already exists for that RFQ.

const { MILESTONE_TYPES } = require("./shipmentMilestoneTypes");

const ORDER_BY_RFQ_QUERY = `
  SELECT o.id, o.pipeline_stage, po.po_number
  FROM orders o
  JOIN purchase_orders po ON po.id = o.po_id
  JOIN quotes q ON q.id = po.quote_id
  WHERE q.rfq_id = ?
`;

const ORDER_QUERY = `
  SELECT o.id, o.order_date, o.pipeline_stage,
         po.po_number, po.customer_po_reference, po.received_date, po.total_value,
         r.id AS rfq_id, r.job_number, r.project_name,
         a.name AS account_name
  FROM orders o
  JOIN purchase_orders po ON po.id = o.po_id
  JOIN quotes q ON q.id = po.quote_id
  JOIN rfqs r ON r.id = q.rfq_id
  JOIN accounts a ON a.id = r.account_id
  WHERE o.id = ?
`;

const ORDER_LINE_ITEMS_QUERY = `
  SELECT oli.id, li.description, li.quantity, li.unit,
         qli.unit_price_usd AS sell_unit_price_usd,
         s.name AS supplier_name,
         sqli.unit_price AS buy_unit_price, sqli.currency AS buy_currency
  FROM order_line_items oli
  JOIN rfq_line_items li ON li.id = oli.rfq_line_item_id
  JOIN orders o ON o.id = oli.order_id
  JOIN purchase_orders po ON po.id = o.po_id
  JOIN quote_line_items qli ON qli.rfq_line_item_id = li.id AND qli.quote_id = po.quote_id
  JOIN line_item_sourcing lis ON lis.id = oli.line_item_sourcing_id
  JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  JOIN suppliers s ON s.id = si.supplier_id
  WHERE oli.order_id = ?
`;

const SHIPMENTS_QUERY = `
  SELECT sh.id, sh.freight_forwarder, sh.tracking_number, sh.mode, sh.origin, sh.destination,
         sh.ship_date, sh.eta, sh.pod_received, sh.supplier_id,
         s.name AS supplier_name
  FROM shipments sh
  LEFT JOIN suppliers s ON s.id = sh.supplier_id
  WHERE sh.order_id = ?
`;

const MILESTONES_QUERY = `
  SELECT id, shipment_id, milestone_type, estimated_date, actual_date, notes
  FROM shipment_milestones
  WHERE shipment_id = ?
`;

function getOrderForRfq(db, rfqId) {
  return db.prepare(ORDER_BY_RFQ_QUERY).get(rfqId);
}

function getOrderById(db, id) {
  return db.prepare(ORDER_QUERY).get(id);
}

function getOrderLineItems(db, orderId) {
  return db.prepare(ORDER_LINE_ITEMS_QUERY).all(orderId);
}

// Attaches each shipment's milestones, sorted into the fixed MILESTONE_TYPES
// stage order rather than insertion order.
function getShipmentsForOrder(db, orderId) {
  const shipments = db.prepare(SHIPMENTS_QUERY).all(orderId);
  const getMilestones = db.prepare(MILESTONES_QUERY);

  return shipments.map((shipment) => {
    const milestones = getMilestones.all(shipment.id);
    milestones.sort(
      (a, b) => MILESTONE_TYPES.indexOf(a.milestone_type) - MILESTONE_TYPES.indexOf(b.milestone_type)
    );
    return { ...shipment, milestones };
  });
}

module.exports = { getOrderForRfq, getOrderById, getOrderLineItems, getShipmentsForOrder };
