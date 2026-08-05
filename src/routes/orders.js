// src/routes/orders.js
// Order detail page: PO info, sourced line items with margin, and each
// shipment's logistics + milestone timeline.

const express = require("express");
const { getDb } = require("../db/connection");
const { getOrderById, getOrderLineItems, getShipmentsForOrder } = require("../db/orderQueries");
const { getCurrencyRates } = require("../db/rfqQueries");
const { toUsd } = require("../db/orderSummary");
const { orderDetailPage } = require("../views/orderDetail");

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

  res.send(orderDetailPage({ order, lineItems, shipments }));
});

module.exports = router;
