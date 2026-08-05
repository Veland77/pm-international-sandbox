// src/routes/rfqs.js
// RFQ list and detail pages.

const express = require("express");
const { getDb } = require("../db/connection");
const {
  listRfqs,
  getRfqById,
  getLineItems,
  getLatestQuote,
  getQuoteLineItems,
  getSupplierComparison,
  getLineItemSourcing,
} = require("../db/rfqQueries");
const { buildOrderSummary } = require("../db/orderSummary");
const { rfqListPage } = require("../views/rfqList");
const { rfqDetailPage } = require("../views/rfqDetail");

const router = express.Router();

router.get("/", (req, res) => {
  const db = getDb();
  res.send(rfqListPage(listRfqs(db)));
});

router.get("/:id", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);

  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const lineItems = getLineItems(db, rfq.id);
  const quote = getLatestQuote(db, rfq.id);
  const quoteLineItems = quote ? getQuoteLineItems(db, quote.id) : [];
  const supplierComparison = getSupplierComparison(db, rfq.id);
  const sourcingRows = getLineItemSourcing(db, rfq.id);
  const orderSummary = buildOrderSummary({ quoteLineItems, sourcingRows });

  res.send(
    rfqDetailPage({
      rfq,
      lineItems,
      quote,
      quoteLineItems,
      supplierComparison,
      sourcingRows,
      orderSummary,
    })
  );
});

module.exports = router;
