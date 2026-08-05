// src/routes/inquiryPrint.js
// Print-friendly Sourcing Inquiry document, meant to be saved as PDF via
// the browser's print dialog. See src/views/inquiryPrintPage.js for the
// confidentiality notes on what this deliberately excludes.

const express = require("express");
const { getDb } = require("../db/connection");
const { getInquiryForPrint } = require("../db/inquiryPrintQueries");
const { getInquiryLineItems } = require("../db/supplierInquiryQueries");
const { getSupplierInquiryAttachments } = require("../db/supplierInquiryAttachmentQueries");
const { addDays } = require("../db/orderSummary");
const { inquiryPrintPage } = require("../views/inquiryPrintPage");

const router = express.Router();

router.get("/:id/print", (req, res) => {
  const db = getDb();
  const inquiry = getInquiryForPrint(db, req.params.id);

  if (!inquiry) {
    return res.status(404).send("Sourcing Inquiry not found");
  }

  const lineItems = getInquiryLineItems(db, inquiry.id);
  const attachments = getSupplierInquiryAttachments(db, inquiry.id);
  const responseRequestedBy = addDays(inquiry.due_date, -5);

  res.send(inquiryPrintPage({ inquiry, lineItems, attachments, responseRequestedBy }));
});

module.exports = router;
