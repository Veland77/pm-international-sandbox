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
  getCurrencyRates,
  getSupplierInquiriesForRfq,
  getFreightInquiriesForRfq,
} = require("../db/rfqQueries");
const { buildOrderSummary, buildLineItemMargins, toUsd } = require("../db/orderSummary");
const { getRfqAttachments } = require("../db/rfqAttachmentQueries");
const { getSupplierInquiryAttachments } = require("../db/supplierInquiryAttachmentQueries");
const { getOrderForRfq, getShipmentsForOrder } = require("../db/orderQueries");
const { getSelectedFreightQuotesForRfq } = require("../db/freightQuoteSelectionQueries");
const { getLandedPricesForRfq } = require("../db/quoteBuildQueries");
const { buildQuoteDisplayRows, buildQuoteTotals } = require("../db/quoteBuildCalc");
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
  const rates = getCurrencyRates(db);
  const orderSummary = buildOrderSummary({ quoteLineItems, sourcingRows, rates });
  const lineItemMargins = buildLineItemMargins({ quoteLineItems, sourcingRows, rates });

  const rfqAttachments = getRfqAttachments(db, rfq.id);
  const supplierInquiries = getSupplierInquiriesForRfq(db, rfq.id);
  const supplierInquiryAttachmentsByInquiryId = new Map(
    supplierInquiries.map((inquiry) => [inquiry.id, getSupplierInquiryAttachments(db, inquiry.id)])
  );

  const freightInquiries = getFreightInquiriesForRfq(db, rfq.id);
  const rateMap = new Map(rates.map((r) => [r.currency_code, r.rate_to_usd]));
  const selectedFreightBySupplierId = new Map(
    getSelectedFreightQuotesForRfq(db, rfq.id).map((q) => [
      q.supplier_id,
      { freightForwarderName: q.freight_forwarder_name, usdPrice: toUsd(q.price, q.currency, rateMap) },
    ])
  );

  const order = getOrderForRfq(db, rfq.id);
  const shipments = order ? getShipmentsForOrder(db, order.id) : [];

  // Reuses the same landed-price (buy + allocated freight) calc the quote
  // create/edit form uses, so the saved quote's margin display here always
  // matches what that screen would show for the same numbers.
  const { allLineItems: allLineItemsWithSourcing, landedPrices } = getLandedPricesForRfq(db, rfq.id);
  const anySourced = allLineItemsWithSourcing.some((li) => li.supplier_id != null);
  const quoteSellPriceFormValues = {};
  quoteLineItems.forEach((qli) => {
    quoteSellPriceFormValues[qli.rfq_line_item_id] = String(qli.unit_price_usd);
  });
  const quoteDisplayRows = quote
    ? buildQuoteDisplayRows(allLineItemsWithSourcing, landedPrices, quoteSellPriceFormValues)
    : [];
  const quoteTotals = quote ? buildQuoteTotals(quoteDisplayRows) : null;

  res.send(
    rfqDetailPage({
      rfq,
      lineItems,
      quote,
      quoteDisplayRows,
      quoteTotals,
      anySourced,
      supplierComparison,
      sourcingRows,
      orderSummary,
      lineItemMargins,
      rfqAttachments,
      supplierInquiries,
      supplierInquiryAttachmentsByInquiryId,
      freightInquiries,
      selectedFreightBySupplierId,
      order,
      shipments,
    })
  );
});

module.exports = router;
