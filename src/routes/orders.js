// src/routes/orders.js
// Order detail page: PO info, sourced line items with margin, and each
// shipment's logistics + milestone timeline.

const express = require("express");
const { getDb } = require("../db/connection");
const { getOrderById, getOrderLineItems, getShipmentsForOrder } = require("../db/orderQueries");
const {
  getVendorsForOrder,
  getOrderHeaderForPo,
  getSupplierForPo,
  getPoLineItemsForVendor,
} = require("../db/poPrintQueries");
const { getCurrencyRates } = require("../db/rfqQueries");
const { toUsd } = require("../db/orderSummary");
const { orderDetailPage } = require("../views/orderDetail");
const { poPrintPage } = require("../views/poPrintPage");

const router = express.Router();

router.get("/:id", (req, res) => {
  const db = getDb();
  const order = getOrderById(db, req.params.id);

  if (!order) {
    return res.status(404).send("Order not found");
  }

  const rawLineItems = getOrderLineItems(db, order.id);
  const rateMap = new Map(getCurrencyRates(db).map((r) => [r.currency_code, r.rate_to_usd]));
  const lineItems = rawLineItems.map((li) => ({
    ...li,
    buyUnitPriceUsd: toUsd(li.buy_unit_price, li.buy_currency, rateMap),
  }));

  const shipments = getShipmentsForOrder(db, order.id);
  const vendors = getVendorsForOrder(db, order.id);

  res.send(orderDetailPage({ order, lineItems, shipments, vendors }));
});

// Customer-facing data never enters this route at all — see
// poPrintQueries.js for why the queries themselves have no join path to
// it. "PO number" here means PM's own reference to this vendor, derived
// from the order's own po_number plus the vendor's id, since one order
// can source from several vendors and each gets its own document.
router.get("/:id/po/:supplierId/print", (req, res) => {
  const db = getDb();
  const orderHeader = getOrderHeaderForPo(db, req.params.id);
  if (!orderHeader) {
    return res.status(404).send("Order not found");
  }

  const supplier = getSupplierForPo(db, req.params.supplierId);
  const lineItems = getPoLineItemsForVendor(db, orderHeader.order_id, req.params.supplierId);
  if (!supplier || lineItems.length === 0) {
    return res.status(404).send("This vendor has no line items on this order");
  }

  const poNumber = `${orderHeader.po_number}-S${supplier.supplier_id}`;

  res.send(
    poPrintPage({
      poNumber,
      orderDate: orderHeader.order_date,
      supplier,
      lineItems,
    })
  );
});

module.exports = router;
