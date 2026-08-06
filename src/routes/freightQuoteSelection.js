// src/routes/freightQuoteSelection.js
// "Compare Freight Quotes & Select Winner" for one vendor pickup location,
// entered from any one of the (possibly several) freight_inquiries that
// cover it — see src/db/freightQuoteSelectionQueries.js for why the
// comparison spans sibling inquiries rather than a single one.

const express = require("express");
const { getDb } = require("../db/connection");
const { getRfqById, getCurrencyRates } = require("../db/rfqQueries");
const {
  getFreightInquiryForCompare,
  getFreightQuotesForPickupLocation,
  sortQuotesByUsdPrice,
  selectFreightQuote,
} = require("../db/freightQuoteSelectionQueries");
const { freightQuoteComparePage } = require("../views/freightQuoteCompare");

const router = express.Router();

function loadPickupLocation(db, rfqId, freightInquiryId) {
  const inquiry = getFreightInquiryForCompare(db, freightInquiryId);
  if (!inquiry || inquiry.rfq_id !== Number(rfqId)) return null;
  return inquiry;
}

router.get("/:rfqId/freight-inquiries/:freightInquiryId/compare", (req, res) => {
  const db = getDb();
  const inquiry = loadPickupLocation(db, req.params.rfqId, req.params.freightInquiryId);
  if (!inquiry) {
    return res.status(404).send("Freight inquiry not found");
  }

  const rfq = getRfqById(db, inquiry.rfq_id);
  const rawQuotes = getFreightQuotesForPickupLocation(db, { rfqId: inquiry.rfq_id, supplierId: inquiry.supplier_id });
  const quotes = sortQuotesByUsdPrice(rawQuotes, getCurrencyRates(db));

  res.send(
    freightQuoteComparePage({
      rfq,
      freightInquiryId: inquiry.id,
      supplierName: inquiry.supplier_name,
      quotes,
    })
  );
});

router.post("/:rfqId/freight-inquiries/:freightInquiryId/select", (req, res) => {
  const db = getDb();
  const inquiry = loadPickupLocation(db, req.params.rfqId, req.params.freightInquiryId);
  if (!inquiry) {
    return res.status(404).send("Freight inquiry not found");
  }

  const quotes = getFreightQuotesForPickupLocation(db, { rfqId: inquiry.rfq_id, supplierId: inquiry.supplier_id });
  const freightQuoteId = Number(req.body.freight_quote_id);

  const isValidChoice = quotes.some((q) => q.freight_quote_id === freightQuoteId);
  if (!isValidChoice) {
    return res.status(400).send("Invalid freight quote selection.");
  }

  selectFreightQuote(db, { rfqId: inquiry.rfq_id, supplierId: inquiry.supplier_id, freightQuoteId });

  res.redirect(`/rfqs/${inquiry.rfq_id}`);
});

module.exports = router;
