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
const { getVendorPoIssuance, getVendorPoIssuancesForOrder, createVendorPoIssuance } = require("../db/vendorPoQueries");
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
  const issuancesBySupplierId = getVendorPoIssuancesForOrder(db, order.id);

  res.send(orderDetailPage({ order, lineItems, shipments, vendors, issuancesBySupplierId }));
});

// The deliberate action that actually issues a vendor's PO — the print
// document itself stays fully derived and is never stored (see
// poPrintQueries.js); this just records that it happened and when.
// Idempotent: generating the same vendor's PO twice is a no-op (see
// vendorPoQueries.js's INSERT OR IGNORE), not a duplicate or an error.
router.post("/:id/po/:supplierId/generate", (req, res) => {
  const db = getDb();
  const order = getOrderById(db, req.params.id);
  if (!order) {
    return res.status(404).send("Order not found");
  }

  createVendorPoIssuance(db, {
    orderId: order.id,
    supplierId: req.params.supplierId,
    issuedDate: new Date().toISOString().slice(0, 10),
  });

  res.redirect(`/orders/${order.id}`);
});

// Customer-facing data never enters this route at all — see
// poPrintQueries.js for why the queries themselves have no join path to
// it. "PO number" here means PM's own reference to this vendor, derived
// from the order's own po_number plus the vendor's id, since one order
// can source from several vendors and each gets its own document.
//
// Only reachable once "Generate Purchase Order" has actually been
// clicked for this vendor — redirects back to the order page otherwise,
// same guard pattern as the quote-edit route redirecting away once a
// quote isn't a Draft. Without this, "Generate" would just be a UI
// suggestion rather than the deliberate action it's meant to be.
router.get("/:id/po/:supplierId/print", (req, res) => {
  const db = getDb();
  const orderHeader = getOrderHeaderForPo(db, req.params.id);
  if (!orderHeader) {
    return res.status(404).send("Order not found");
  }

  const issuance = getVendorPoIssuance(db, orderHeader.order_id, req.params.supplierId);
  if (!issuance) {
    return res.redirect(`/orders/${orderHeader.order_id}`);
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
      issuedDate: issuance.issued_date,
      supplier,
      lineItems,
    })
  );
});

module.exports = router;
