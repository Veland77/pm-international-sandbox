// src/routes/freightIntake.js
// Creates a new Freight Inquiry ("FRQ") from an existing RFQ: pick a
// forwarder, choose which already-sourced line items need a quote.

const express = require("express");
const { getDb } = require("../db/connection");
const { getRfqById } = require("../db/rfqQueries");
const { getSourcedLineItemsForFreight, createFreightInquiry } = require("../db/freightIntakeQueries");
const { freightInquiryNewFormPage } = require("../views/freightInquiryNewForm");

const router = express.Router();

router.get("/:id/freight-inquiries/new", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);

  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const sourcedLineItems = getSourcedLineItemsForFreight(db, rfq.id);

  res.send(freightInquiryNewFormPage({ rfq, sourcedLineItems, formValues: {}, errors: [] }));
});

router.post("/:id/freight-inquiries", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);

  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const sourcedLineItems = getSourcedLineItemsForFreight(db, rfq.id);
  const freightForwarderName = (req.body.freight_forwarder_name || "").trim();
  // Express parses a single checked checkbox as a string, multiple as an
  // array — concat normalizes both (and a missing field) into an array.
  const selectedIds = [].concat(req.body.line_item_ids || []).map(Number);

  const errors = [];
  if (!freightForwarderName) errors.push("Enter the freight forwarder's name.");
  if (selectedIds.length === 0) errors.push("Select at least one line item.");

  if (errors.length > 0) {
    return res.status(400).send(
      freightInquiryNewFormPage({
        rfq,
        sourcedLineItems,
        formValues: { freight_forwarder_name: freightForwarderName, line_item_ids: selectedIds },
        errors,
      })
    );
  }

  // Filtering against this RFQ's own sourced line items means a bogus/
  // foreign id in the submitted list is silently dropped, never trusted.
  const validIds = sourcedLineItems
    .map((li) => li.rfq_line_item_id)
    .filter((id) => selectedIds.includes(id));

  const { freightInquiryId } = createFreightInquiry(db, {
    rfqId: rfq.id,
    freightForwarderName,
    rfqLineItemIds: validIds,
  });

  res.redirect(`/freight-inquiries/${freightInquiryId}/print`);
});

module.exports = router;
