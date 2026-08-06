// src/routes/freightIntake.js
// Creates Freight Inquiries ("FRQ") from an existing RFQ: pick a
// forwarder, choose which already-sourced line items need a quote. A
// selection spanning more than one vendor produces one freight inquiry
// per vendor's pickup location, never one combined request (see
// src/db/freightInquiryGrouping.js).

const express = require("express");
const { getDb } = require("../db/connection");
const { getRfqById } = require("../db/rfqQueries");
const {
  getSourcedLineItemsForFreight,
  getFreightForwardersList,
  createFreightInquiries,
} = require("../db/freightIntakeQueries");
const { freightInquiryNewFormPage } = require("../views/freightInquiryNewForm");
const { freightInquiryCreationSummaryPage } = require("../views/freightInquiryCreationSummary");

const router = express.Router();

router.get("/:id/freight-inquiries/new", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);

  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const sourcedLineItems = getSourcedLineItemsForFreight(db, rfq.id);
  const forwarders = getFreightForwardersList(db);

  res.send(freightInquiryNewFormPage({ rfq, sourcedLineItems, forwarders, formValues: {}, errors: [] }));
});

router.post("/:id/freight-inquiries", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);

  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const sourcedLineItems = getSourcedLineItemsForFreight(db, rfq.id);
  const forwarders = getFreightForwardersList(db);
  const freightForwarderId = req.body.freight_forwarder_id ? Number(req.body.freight_forwarder_id) : null;
  // Express parses a single checked checkbox as a string, multiple as an
  // array — concat normalizes both (and a missing field) into an array.
  const selectedIds = [].concat(req.body.line_item_ids || []).map(Number);

  const errors = [];
  if (!freightForwarderId) errors.push("Select a freight forwarder.");
  if (selectedIds.length === 0) errors.push("Select at least one line item.");

  if (errors.length > 0) {
    return res.status(400).send(
      freightInquiryNewFormPage({
        rfq,
        sourcedLineItems,
        forwarders,
        formValues: { freight_forwarder_id: freightForwarderId, line_item_ids: selectedIds },
        errors,
      })
    );
  }

  // Filtering against this RFQ's own sourced line items means a bogus/
  // foreign id in the submitted list is silently dropped, never trusted.
  const selectedLineItems = sourcedLineItems.filter((li) => selectedIds.includes(li.rfq_line_item_id));

  const createdInquiries = createFreightInquiries(db, {
    rfqId: rfq.id,
    freightForwarderId,
    sourcedLineItems: selectedLineItems,
  });

  res.send(freightInquiryCreationSummaryPage({ rfq, createdInquiries }));
});

module.exports = router;
