// src/routes/lineItemSourcing.js
// "Compare Vendors & Select Winner" for one RFQ line item at a time —
// reads land in supplier_quotes/supplier_quote_line_items once a Sourcing
// Inquiry gets a response; this is where that comparison actually turns
// into a decision, written to line_item_sourcing.

const express = require("express");
const { getDb } = require("../db/connection");
const { getRfqById } = require("../db/rfqQueries");
const {
  getLineItemForCompare,
  getVendorQuotesForLineItem,
  selectVendorForLineItem,
} = require("../db/lineItemSourcingQueries");
const { lineItemComparePage } = require("../views/lineItemCompare");

const router = express.Router();

function loadLineItem(db, rfqId, lineItemId) {
  const lineItem = getLineItemForCompare(db, lineItemId);
  if (!lineItem || lineItem.rfq_id !== Number(rfqId)) return null;
  return lineItem;
}

router.get("/:rfqId/line-items/:lineItemId/compare", (req, res) => {
  const db = getDb();
  const lineItem = loadLineItem(db, req.params.rfqId, req.params.lineItemId);
  if (!lineItem) {
    return res.status(404).send("Line item not found");
  }

  const rfq = getRfqById(db, lineItem.rfq_id);
  const vendorQuotes = getVendorQuotesForLineItem(db, lineItem.id);

  res.send(lineItemComparePage({ rfq, lineItem, vendorQuotes }));
});

router.post("/:rfqId/line-items/:lineItemId/select", (req, res) => {
  const db = getDb();
  const lineItem = loadLineItem(db, req.params.rfqId, req.params.lineItemId);
  if (!lineItem) {
    return res.status(404).send("Line item not found");
  }

  const vendorQuotes = getVendorQuotesForLineItem(db, lineItem.id);
  const supplierQuoteLineItemId = Number(req.body.supplier_quote_line_item_id);

  // Only ever trust an id that's actually a real vendor quote on this
  // exact line item — never write whatever a submitted form value says.
  const isValidChoice = vendorQuotes.some((q) => q.supplier_quote_line_item_id === supplierQuoteLineItemId);
  if (!isValidChoice) {
    return res.status(400).send("Invalid vendor selection.");
  }

  selectVendorForLineItem(db, { rfqLineItemId: lineItem.id, supplierQuoteLineItemId });

  res.redirect(`/rfqs/${lineItem.rfq_id}`);
});

module.exports = router;
