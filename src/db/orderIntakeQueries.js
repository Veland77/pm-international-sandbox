// src/db/orderIntakeQueries.js
// Read/write helpers for converting a won RFQ into an order: pulls the
// quote's selected-vendor sourcing needed to prefill the conversion form,
// and creates the purchase order / order / order line items / shipments
// (each with 6 blank milestones) in one transaction.

const { MILESTONE_TYPES } = require("./shipmentMilestoneTypes");
const { groupLineItemsForShipment } = require("./shipmentGrouping");

const SOURCED_LINE_ITEMS_QUERY = `
  SELECT li.id AS rfq_line_item_id, li.description, li.quantity, li.unit,
         lis.id AS line_item_sourcing_id,
         s.id AS supplier_id, s.name AS supplier_name, s.country AS supplier_country,
         qli.unit_price_usd
  FROM rfq_line_items li
  JOIN line_item_sourcing lis ON lis.rfq_line_item_id = li.id AND lis.status = 'Selected'
  JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  JOIN suppliers s ON s.id = si.supplier_id
  JOIN quote_line_items qli ON qli.rfq_line_item_id = li.id AND qli.quote_id = ?
  WHERE li.rfq_id = ?
`;

function getSourcedLineItemsForConversion(db, rfqId, quoteId) {
  return db.prepare(SOURCED_LINE_ITEMS_QUERY).all(quoteId, rfqId);
}

// Same approach as inquiryIntakeQueries.js's getNextInquiryNumber: parse
// the highest existing trailing number and add one.
function getNextPoNumber(db) {
  const rows = db.prepare("SELECT po_number FROM purchase_orders").all();
  const maxN = rows.reduce((max, r) => {
    const match = /(\d+)$/.exec(r.po_number);
    const n = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, n);
  }, 6000);
  return `PO-${maxN + 1}`;
}

function createOrderFromRfq(
  db,
  { rfqId, quoteId, customerPoReference, receivedDate, sourcedLineItems, chosenSupplierIdByLineItemId, freightSellPriceUsd }
) {
  const insertPurchaseOrder = db.prepare(`
    INSERT INTO purchase_orders (quote_id, po_number, customer_po_reference, received_date, total_value)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertOrder = db.prepare(
    "INSERT INTO orders (po_id, order_date, pipeline_stage) VALUES (?, ?, 'PO Received')"
  );
  const insertOrderLineItem = db.prepare(`
    INSERT INTO order_line_items (order_id, rfq_line_item_id, line_item_sourcing_id)
    VALUES (?, ?, ?)
  `);
  const insertShipment = db.prepare("INSERT INTO shipments (order_id, supplier_id, origin) VALUES (?, ?, ?)");
  const insertShipmentLineItem = db.prepare(
    "INSERT INTO shipment_line_items (shipment_id, order_line_item_id) VALUES (?, ?)"
  );
  const insertShipmentMilestone = db.prepare(
    "INSERT INTO shipment_milestones (shipment_id, milestone_type) VALUES (?, ?)"
  );
  // Recorded alongside order creation — this is the moment the customer's
  // PO is on file, which is what "reaching PO Received" means for the RFQ.
  const setRfqPipelineStage = db.prepare("UPDATE rfqs SET pipeline_stage = 'PO Received' WHERE id = ?");

  const run = db.transaction(() => {
    // Item sell prices no longer include freight markup (freight is its
    // own line on the quote, see marginCalc.js's buildFreightLineItem) —
    // the PO's total_value has to add it back explicitly or it silently
    // undercounts by exactly the quote's freight line.
    const itemsTotal = sourcedLineItems.reduce((sum, li) => sum + li.unit_price_usd * li.quantity, 0);
    const totalValue = itemsTotal + (freightSellPriceUsd || 0);
    const poNumber = getNextPoNumber(db);
    const poId = insertPurchaseOrder.run(
      quoteId,
      poNumber,
      customerPoReference,
      receivedDate,
      totalValue
    ).lastInsertRowid;
    const orderId = insertOrder.run(poId, receivedDate).lastInsertRowid;

    const orderLineItemIdByRfqLineItemId = new Map();
    sourcedLineItems.forEach((li) => {
      const orderLineItemId = insertOrderLineItem.run(
        orderId,
        li.rfq_line_item_id,
        li.line_item_sourcing_id
      ).lastInsertRowid;
      orderLineItemIdByRfqLineItemId.set(li.rfq_line_item_id, orderLineItemId);
    });

    const shipmentGroups = groupLineItemsForShipment(
      sourcedLineItems.map((li) => ({ rfqLineItemId: li.rfq_line_item_id, supplierId: li.supplier_id })),
      chosenSupplierIdByLineItemId
    );
    // Only ever contains vendors already sourced on this RFQ, so every
    // group's supplierId is guaranteed to resolve here.
    const sourcedLineItemBySupplierId = new Map(sourcedLineItems.map((li) => [li.supplier_id, li]));

    shipmentGroups.forEach((group) => {
      const groupVendor = sourcedLineItemBySupplierId.get(group.supplierId);
      const shipmentId = insertShipment.run(
        orderId,
        group.supplierId,
        groupVendor ? groupVendor.supplier_country : null
      ).lastInsertRowid;

      group.rfqLineItemIds.forEach((rfqLineItemId) => {
        insertShipmentLineItem.run(shipmentId, orderLineItemIdByRfqLineItemId.get(rfqLineItemId));
      });

      MILESTONE_TYPES.forEach((type) => {
        insertShipmentMilestone.run(shipmentId, type);
      });
    });

    setRfqPipelineStage.run(rfqId);

    return { orderId, poNumber };
  });

  return run();
}

module.exports = { getSourcedLineItemsForConversion, getNextPoNumber, createOrderFromRfq };
