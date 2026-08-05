// src/routes/freightPrint.js
// Print-friendly Freight Quote Request document, meant to be saved as PDF
// via the browser's print dialog. See src/views/freightInquiryPrintPage.js
// for the confidentiality notes on what this deliberately excludes.

const express = require("express");
const { getDb } = require("../db/connection");
const { getFreightInquiryForPrint, getFreightInquiryLineItemsForPrint } = require("../db/freightPrintQueries");
const { totalWeightKg, requestedShipByDate } = require("../db/freightPrintCalc");
const { freightInquiryPrintPage } = require("../views/freightInquiryPrintPage");

const router = express.Router();

router.get("/:id/print", (req, res) => {
  const db = getDb();
  const inquiry = getFreightInquiryForPrint(db, req.params.id);

  if (!inquiry) {
    return res.status(404).send("Freight Inquiry not found");
  }

  const lineItems = getFreightInquiryLineItemsForPrint(db, inquiry.id);

  res.send(
    freightInquiryPrintPage({
      inquiry,
      lineItems,
      totalWeightKg: totalWeightKg(lineItems),
      requestedShipByDate: requestedShipByDate(lineItems),
    })
  );
});

module.exports = router;
