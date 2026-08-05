// src/routes/inquiryIntake.js
// Creates a new Sourcing Inquiry from an existing RFQ: pick a vendor,
// choose which line items to include.

const express = require("express");
const { getDb } = require("../db/connection");
const { getRfqById, getLineItems } = require("../db/rfqQueries");
const { getSuppliersList, createSupplierInquiry } = require("../db/inquiryIntakeQueries");
const { inquiryNewFormPage } = require("../views/inquiryNewForm");

const router = express.Router();

router.get("/:id/inquiries/new", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);

  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const lineItems = getLineItems(db, rfq.id);
  const suppliers = getSuppliersList(db);

  res.send(inquiryNewFormPage({ rfq, lineItems, suppliers, formValues: {}, errors: [] }));
});

router.post("/:id/inquiries", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);

  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const lineItems = getLineItems(db, rfq.id);
  const suppliers = getSuppliersList(db);

  const supplierId = req.body.supplier_id ? Number(req.body.supplier_id) : null;
  // Express parses a single checked checkbox as a string, multiple as an
  // array — concat normalizes both (and a missing field) into an array.
  const selectedIds = [].concat(req.body.line_item_ids || []).map(Number);

  const errors = [];
  if (!supplierId) errors.push("Select a vendor.");
  if (selectedIds.length === 0) errors.push("Select at least one line item.");

  if (errors.length > 0) {
    return res
      .status(400)
      .send(
        inquiryNewFormPage({
          rfq,
          lineItems,
          suppliers,
          formValues: { supplier_id: supplierId, line_item_ids: selectedIds },
          errors,
        })
      );
  }

  // Filtering against this RFQ's own line items means a bogus/foreign id
  // in the submitted list is silently dropped, never trusted.
  const selectedLineItems = lineItems
    .filter((li) => selectedIds.includes(li.id))
    .map((li) => ({ rfqLineItemId: li.id, quantity: li.quantity }));

  const { inquiryId } = createSupplierInquiry(db, {
    rfqId: rfq.id,
    supplierId,
    lineItems: selectedLineItems,
  });

  res.redirect(`/supplier-inquiries/${inquiryId}`);
});

module.exports = router;
