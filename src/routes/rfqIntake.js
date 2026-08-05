// src/routes/rfqIntake.js
// Creates brand-new RFQs (GET /rfqs/new, POST /rfqs). Kept separate from
// routes/rfqs.js, which stays read-only (list/detail).

const express = require("express");
const { getDb } = require("../db/connection");
const { getFormOptions, createRfqWithLineItems } = require("../db/rfqIntakeQueries");
const { rfqNewFormPage } = require("../views/rfqNewForm");

const router = express.Router();

function parseLineItems(body) {
  const raw = body.line_items || {};
  return Object.keys(raw)
    .map((key) => raw[key])
    .filter((li) => li && (li.material_id || li.product_form_id || li.description || li.quantity))
    .map((li) => ({
      materialId: li.material_id ? Number(li.material_id) : null,
      productFormId: li.product_form_id ? Number(li.product_form_id) : null,
      standardId: li.standard_id ? Number(li.standard_id) : null,
      description: (li.description || "").trim(),
      quantity: li.quantity ? Number(li.quantity) : null,
      unit: (li.unit || "").trim(),
      lengthM: li.length_m ? Number(li.length_m) : null,
    }));
}

function validate(body, lineItems) {
  const errors = [];

  if (body.account_mode === "new") {
    if (!body.new_account_name) errors.push("New account name is required.");
    if (!body.new_contact_name) errors.push("New contact name is required.");
    if (!body.new_contact_email) errors.push("New contact email is required.");
  } else {
    if (!body.account_id) errors.push("Select an account.");
    if (!body.contact_id) errors.push("Select a contact.");
  }

  if (!body.sales_rep_id) errors.push("Select a sales rep.");
  if (!body.project_name) errors.push("Project name is required.");
  if (!body.due_date) errors.push("Due date is required.");
  if (!body.customer_requested_delivery_date) errors.push("Customer requested delivery date is required.");

  if (lineItems.length === 0) {
    errors.push("Add at least one line item.");
  } else {
    lineItems.forEach((li, i) => {
      if (!li.materialId) errors.push(`Line item ${i + 1}: select a material.`);
      if (!li.productFormId) errors.push(`Line item ${i + 1}: select a product form.`);
      if (!li.description) errors.push(`Line item ${i + 1}: description is required.`);
      if (!li.quantity || li.quantity <= 0) errors.push(`Line item ${i + 1}: quantity must be greater than 0.`);
      if (!li.unit) errors.push(`Line item ${i + 1}: unit is required.`);
    });
  }

  return errors;
}

router.get("/new", (req, res) => {
  const db = getDb();
  const options = getFormOptions(db);
  res.send(rfqNewFormPage({ ...options, formValues: {}, errors: [] }));
});

router.post("/", (req, res) => {
  const db = getDb();
  const body = req.body;
  const lineItems = parseLineItems(body);
  const errors = validate(body, lineItems);

  if (errors.length > 0) {
    const options = getFormOptions(db);
    return res.status(400).send(rfqNewFormPage({ ...options, formValues: { ...body, lineItems }, errors }));
  }

  const { rfqId } = createRfqWithLineItems(db, {
    accountMode: body.account_mode,
    accountId: body.account_id ? Number(body.account_id) : null,
    newAccount:
      body.account_mode === "new"
        ? {
            name: body.new_account_name,
            industry_segment: body.new_account_industry_segment,
            region: body.new_account_region,
            account_status: body.new_account_status || "Active",
          }
        : null,
    contactId: body.contact_id ? Number(body.contact_id) : null,
    newContact:
      body.account_mode === "new"
        ? {
            name: body.new_contact_name,
            title: body.new_contact_title,
            email: body.new_contact_email,
            phone: body.new_contact_phone,
          }
        : null,
    salesRepId: Number(body.sales_rep_id),
    projectName: body.project_name,
    dueDate: body.due_date,
    customerRequestedDeliveryDate: body.customer_requested_delivery_date,
    lineItems,
  });

  res.redirect(`/rfqs/${rfqId}`);
});

module.exports = router;
