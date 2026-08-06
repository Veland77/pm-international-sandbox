// src/routes/orderIntake.js
// Converts a won RFQ into an order: records the customer's PO and creates
// the purchase order, order, order line items, and shipments (grouped by
// vendor, with combining allowed) in one step.

const express = require("express");
const { getDb } = require("../db/connection");
const { getRfqById, getLatestQuote, getLineItems } = require("../db/rfqQueries");
const { getSourcedLineItemsForConversion, createOrderFromRfq } = require("../db/orderIntakeQueries");
const { getOrderForRfq } = require("../db/orderQueries");
const { orderNewFormPage } = require("../views/orderNewForm");

const router = express.Router();

// The "Ships With" dropdowns submit as "line_item_supplier[li<rfqLineItemId>]"
// — see orderNewForm.js for why the "li" prefix is there (it stops express's
// body parser from silently reinterpreting the bracket group as a
// position-indexed array once every key in it looks like a plain number,
// which would otherwise make every reassignment on this form silently
// no-op instead of erroring). Strip it back off here so the rest of this
// route can key by plain rfq_line_item_id, same as before.
function normalizeLineItemSupplierFields(rawLineItemSupplier) {
  const normalized = {};
  Object.entries(rawLineItemSupplier || {}).forEach(([key, value]) => {
    normalized[key.replace(/^li/, "")] = value;
  });
  return normalized;
}

function loadConversionContext(db, rfqId) {
  const rfq = getRfqById(db, rfqId);
  if (!rfq) return null;
  const quote = getLatestQuote(db, rfq.id);
  const sourcedLineItems = quote ? getSourcedLineItemsForConversion(db, rfq.id, quote.id) : [];
  // Per schema.js's order_line_items comment: conversion requires every one
  // of the RFQ's line items to already have a Selected vendor — sourced
  // is an inner join, so a shortfall here means some line item has none.
  const allLineItemsCount = getLineItems(db, rfq.id).length;
  return { rfq, quote, sourcedLineItems, allLineItemsCount };
}

router.get("/:id/convert-to-order", (req, res) => {
  const db = getDb();
  const context = loadConversionContext(db, req.params.id);
  if (!context) {
    return res.status(404).send("RFQ not found");
  }

  const existingOrder = getOrderForRfq(db, context.rfq.id);
  if (existingOrder) {
    return res.redirect(`/orders/${existingOrder.id}`);
  }

  res.send(
    orderNewFormPage({
      ...context,
      freightSellPriceUsd: context.quote ? context.quote.freight_sell_price_usd : null,
      formValues: {},
      errors: [],
    })
  );
});

router.post("/:id/convert-to-order", (req, res) => {
  const db = getDb();
  const context = loadConversionContext(db, req.params.id);
  if (!context) {
    return res.status(404).send("RFQ not found");
  }

  const existingOrder = getOrderForRfq(db, context.rfq.id);
  if (existingOrder) {
    return res.redirect(`/orders/${existingOrder.id}`);
  }

  const customerPoReference = (req.body.customer_po_reference || "").trim();
  const receivedDate = req.body.received_date;
  const chosenSupplierIdByLineItemId = normalizeLineItemSupplierFields(req.body.line_item_supplier);

  const errors = [];
  if (!customerPoReference) errors.push("Enter the customer's PO reference.");
  if (!receivedDate) errors.push("Enter the date the PO was received.");
  if (!context.quote || context.sourcedLineItems.length === 0) {
    errors.push("This RFQ has no sourced line items to convert.");
  } else if (context.sourcedLineItems.length < context.allLineItemsCount) {
    errors.push("Every line item needs a selected vendor before this RFQ can be converted to an order.");
  }

  if (errors.length > 0) {
    return res.status(400).send(
      orderNewFormPage({
        ...context,
        freightSellPriceUsd: context.quote ? context.quote.freight_sell_price_usd : null,
        formValues: {
          customer_po_reference: customerPoReference,
          received_date: receivedDate,
          line_item_supplier: chosenSupplierIdByLineItemId,
        },
        errors,
      })
    );
  }

  const { orderId } = createOrderFromRfq(db, {
    rfqId: context.rfq.id,
    quoteId: context.quote.id,
    customerPoReference,
    receivedDate,
    sourcedLineItems: context.sourcedLineItems,
    chosenSupplierIdByLineItemId,
    freightSellPriceUsd: context.quote.freight_sell_price_usd,
  });

  res.redirect(`/orders/${orderId}`);
});

module.exports = router;
