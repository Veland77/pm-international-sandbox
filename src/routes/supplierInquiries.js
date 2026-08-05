// src/routes/supplierInquiries.js
// Sourcing Inquiry detail page (read-only). Kept separate from
// routes/supplierInquiryAttachments.js, same split as rfqs.js vs
// rfqAttachments.js.

const express = require("express");
const { getDb } = require("../db/connection");
const {
  getSupplierInquiryById,
  getInquiryLineItems,
  getInquiryQuote,
  getInquiryQuoteLineItems,
} = require("../db/supplierInquiryQueries");
const { getSupplierInquiryAttachments } = require("../db/supplierInquiryAttachmentQueries");
const { supplierInquiryDetailPage } = require("../views/supplierInquiryDetail");

const router = express.Router();

router.get("/:id", (req, res) => {
  const db = getDb();
  const inquiry = getSupplierInquiryById(db, req.params.id);

  if (!inquiry) {
    return res.status(404).send("Sourcing Inquiry not found");
  }

  const lineItems = getInquiryLineItems(db, inquiry.id);
  const quote = getInquiryQuote(db, inquiry.id);
  const quoteLineItems = quote ? getInquiryQuoteLineItems(db, quote.id) : [];
  const attachments = getSupplierInquiryAttachments(db, inquiry.id);

  res.send(supplierInquiryDetailPage({ inquiry, lineItems, quote, quoteLineItems, attachments }));
});

module.exports = router;
