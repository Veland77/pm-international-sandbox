// src/routes/emailIntake.js
// AI Email Intake (Phase 0.5): paste an email's text and/or upload a
// screenshot of one, let the AI extract a structured RFQ, review and
// correct it, and only on explicit confirmation does it become a real
// RFQ (with a Job No, per the existing numbering). Nothing is created —
// no account, no contact, no RFQ, no line item — before that confirm
// step. Extraction happens BEFORE anything is written to disk or the
// database: if the AI call fails, nothing is left behind to clean up.

const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { getDb } = require("../db/connection");
const { getFormOptions, createRfqWithLineItems } = require("../db/rfqIntakeQueries");
const {
  createEmailIntakeSubmission,
  getEmailIntakeSubmission,
  listEmailIntakeSubmissions,
  markEmailIntakeConfirmed,
  markEmailIntakeDiscarded,
  findContactByEmail,
  findAccountByEmailDomain,
} = require("../db/emailIntakeQueries");
const {
  createEmailIntakeAttachment,
  getEmailIntakeAttachments,
  getEmailIntakeAttachmentById,
} = require("../db/emailIntakeAttachmentQueries");
const { saveEmailIntakeAttachment, getEmailIntakeAttachmentPath } = require("../storage/emailIntakeAttachmentStorage");
const { saveRfqAttachment } = require("../storage/rfqAttachmentStorage");
const { createRfqAttachment } = require("../db/rfqAttachmentQueries");
const { createActivity } = require("../db/activityQueries");
const { extractRfqFromEmail } = require("../ai/emailExtractionClient");
const { sanitizeExtraction } = require("../ai/emailExtractionValidation");
const { emailIntakeLandingPage } = require("../views/emailIntakeLandingPage");
const { emailIntakeReviewForm } = require("../views/emailIntakeReviewForm");

const MAX_EMAIL_TEXT_LENGTH = 20000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = express.Router();

function getCatalog(db) {
  const options = getFormOptions(db);
  return { materials: options.materials, productForms: options.productForms, standards: options.standards };
}

router.get("/", (req, res) => {
  const db = getDb();
  res.send(emailIntakeLandingPage({ submissions: listEmailIntakeSubmissions(db), formValues: {}, errors: [] }));
});

router.post(
  "/",
  upload.fields([
    { name: "screenshot", maxCount: 1 },
    { name: "attachments", maxCount: 10 },
  ]),
  async (req, res) => {
    const db = getDb();
    const rawEmailText = (req.body.raw_email_text || "").trim();
    const screenshotFile = req.files && req.files.screenshot ? req.files.screenshot[0] : null;
    const attachmentFiles = (req.files && req.files.attachments) || [];

    const errors = [];
    if (!rawEmailText && !screenshotFile) {
      errors.push("Paste the email text or upload a screenshot — at least one is required.");
    }
    if (rawEmailText.length > MAX_EMAIL_TEXT_LENGTH) {
      errors.push(`That's a lot of text — please paste just the RFQ email itself (${MAX_EMAIL_TEXT_LENGTH.toLocaleString()} character limit).`);
    }
    if (screenshotFile && !screenshotFile.mimetype.startsWith("image/")) {
      errors.push("The screenshot must be an image file.");
    }

    if (errors.length > 0) {
      return res.status(400).send(
        emailIntakeLandingPage({
          submissions: listEmailIntakeSubmissions(db),
          formValues: { raw_email_text: rawEmailText },
          errors,
        })
      );
    }

    const catalog = getCatalog(db);
    const screenshot = screenshotFile ? { buffer: screenshotFile.buffer, mimeType: screenshotFile.mimetype } : null;

    let rawExtraction;
    try {
      rawExtraction = await extractRfqFromEmail({ rawEmailText, screenshot, catalog });
    } catch (err) {
      return res.status(502).send(
        emailIntakeLandingPage({
          submissions: listEmailIntakeSubmissions(db),
          formValues: { raw_email_text: rawEmailText },
          errors: [`AI extraction failed: ${err.message}`],
        })
      );
    }

    const extracted = sanitizeExtraction(rawExtraction, catalog);
    const emailIntakeId = createEmailIntakeSubmission(db, { rawEmailText: rawEmailText || null, extracted });

    if (screenshotFile) {
      const storedFilename = saveEmailIntakeAttachment(screenshotFile.buffer, screenshotFile.originalname);
      createEmailIntakeAttachment(db, {
        emailIntakeId,
        originalFilename: screenshotFile.originalname,
        storedFilename,
        mimeType: screenshotFile.mimetype,
        description: null,
        usedForExtraction: true,
      });
    }

    attachmentFiles.forEach((file) => {
      const storedFilename = saveEmailIntakeAttachment(file.buffer, file.originalname);
      createEmailIntakeAttachment(db, {
        emailIntakeId,
        originalFilename: file.originalname,
        storedFilename,
        mimeType: file.mimetype,
        description: null,
        usedForExtraction: false,
      });
    });

    res.redirect(`/email-intake/${emailIntakeId}/review`);
  }
);

// Exact (case-insensitive) email match wins outright; otherwise a shared
// domain with an existing account's contact suggests "existing account,
// new contact"; otherwise it's a brand-new account. All three stay
// overridable on the review screen — this only decides what's
// pre-selected, never what gets created.
function matchSender(db, sender) {
  const exact = sender.email ? findContactByEmail(db, sender.email) : null;
  if (exact) {
    return {
      mode: "matched",
      accountId: exact.account_id,
      contactId: exact.contact_id,
      accountName: exact.account_name,
      contactName: exact.contact_name,
    };
  }
  const domainMatch = sender.email ? findAccountByEmailDomain(db, sender.email) : null;
  if (domainMatch) {
    return { mode: "existingAccountNewContact", accountId: domainMatch.account_id, accountName: domainMatch.account_name };
  }
  return { mode: "new" };
}

router.get("/:id/review", (req, res) => {
  const db = getDb();
  const submission = getEmailIntakeSubmission(db, req.params.id);
  if (!submission) {
    return res.status(404).send("Submission not found");
  }
  if (submission.status === "Confirmed") {
    return res.redirect(`/rfqs/${submission.confirmed_rfq_id}`);
  }
  if (submission.status === "Discarded") {
    return res.redirect("/email-intake");
  }

  const options = getFormOptions(db);
  res.send(
    emailIntakeReviewForm({
      submission,
      attachments: getEmailIntakeAttachments(db, submission.id),
      accounts: options.accounts,
      contacts: options.contacts,
      users: options.users,
      materials: options.materials,
      productForms: options.productForms,
      standards: options.standards,
      senderMatch: matchSender(db, submission.extracted.sender),
      formValues: {},
      errors: [],
    })
  );
});

router.get("/:id/attachments/:attachmentId", (req, res) => {
  const db = getDb();
  const attachment = getEmailIntakeAttachmentById(db, req.params.attachmentId);

  if (!attachment || attachment.email_intake_id !== Number(req.params.id)) {
    return res.status(404).send("Attachment not found");
  }

  res.download(getEmailIntakeAttachmentPath(attachment.stored_filename), attachment.original_filename);
});

// Each submitted line item carries hidden fields recording what the AI
// originally said (material_originally_matched/material_as_written, same
// for product form) — a manually-added row (via the "+ Add Line Item"
// button also on this form) simply won't have these, which is exactly
// right: there's nothing to note, it was never an AI-flagged guess.
function parseConfirmLineItems(body) {
  const raw = body.line_items || {};
  return Object.keys(raw)
    .map((key) => raw[key])
    .filter((li) => li && (li.material_id || li.product_form_id || li.description || li.quantity || li.skip === "on"))
    .map((li) => ({
      skip: li.skip === "on",
      materialId: li.material_id ? Number(li.material_id) : null,
      productFormId: li.product_form_id ? Number(li.product_form_id) : null,
      standardId: li.standard_id ? Number(li.standard_id) : null,
      description: (li.description || "").trim(),
      quantity: li.quantity ? Number(li.quantity) : null,
      unit: (li.unit || "").trim(),
      lengthM: li.length_m ? Number(li.length_m) : null,
      rawText: li.raw_text || "",
      materialOriginallyMatched: li.material_originally_matched === "true",
      materialAsWritten: li.material_as_written || "",
      productFormOriginallyMatched: li.product_form_originally_matched === "true",
      productFormAsWritten: li.product_form_as_written || "",
      standardOriginallyMatched: li.standard_originally_matched === "true",
      standardAsWritten: li.standard_as_written || "",
    }));
}

function validateConfirm(body, lineItems) {
  const errors = [];
  const senderMode = body.sender_mode;

  if (senderMode === "new") {
    if (!body.new_account_name) errors.push("New account name is required.");
    if (!body.new_contact_name) errors.push("New contact name is required.");
    if (!body.new_contact_email) errors.push("New contact email is required.");
  } else if (senderMode === "existingAccountNewContact") {
    if (!body.account_id) errors.push("Select an account.");
    if (!body.new_contact_name) errors.push("New contact name is required.");
    if (!body.new_contact_email) errors.push("New contact email is required.");
  } else {
    if (!body.account_id) errors.push("Select an account.");
    if (!body.contact_id) errors.push("Select a contact.");
  }

  if (!body.sales_rep_id) errors.push("Select a sales rep.");
  if (!body.project_name) errors.push("Project name is required.");
  if (!body.due_date) errors.push("Due date is required.");

  const activeLineItems = lineItems.filter((li) => !li.skip);
  if (activeLineItems.length === 0) {
    errors.push("At least one line item must be included — skip everything only if this whole submission should be discarded instead.");
  }
  activeLineItems.forEach((li, i) => {
    if (!li.materialId) errors.push(`Line item ${i + 1}: select a material, or check "Skip this line" to defer it.`);
    if (!li.productFormId) errors.push(`Line item ${i + 1}: select a product form, or check "Skip this line" to defer it.`);
    if (!li.description) errors.push(`Line item ${i + 1}: description is required.`);
    if (!li.quantity || li.quantity <= 0) errors.push(`Line item ${i + 1}: quantity must be greater than 0.`);
    if (!li.unit) errors.push(`Line item ${i + 1}: unit is required.`);
  });

  return errors;
}

// Only set when a line was actually forced to an imperfect stand-in, or
// asked for a standard that isn't in the catalog — never for a line that
// already matched everything, and never for a manually-added row with
// nothing AI-flagged to record. Stays permanently visible on the Line
// Items table afterward (see rfqDetail.js), not just during this review.
// Standard is the one non-blocking case (standard_id is a nullable FK —
// see schema.js) — it's noted here for the same "never silently" reason,
// even though it never prevents the line from being created.
function buildCatalogMatchNote(li, materialById, productFormById, standardById) {
  const parts = [];
  if (!li.materialOriginallyMatched && li.materialAsWritten) {
    parts.push(`material requested as "${li.materialAsWritten}" — not in catalog, mapped to "${materialById.get(li.materialId)}"`);
  }
  if (!li.productFormOriginallyMatched && li.productFormAsWritten) {
    parts.push(`product form requested as "${li.productFormAsWritten}" — not in catalog, mapped to "${productFormById.get(li.productFormId)}"`);
  }
  if (!li.standardOriginallyMatched && li.standardAsWritten) {
    parts.push(
      li.standardId
        ? `standard requested as "${li.standardAsWritten}" — not in catalog, mapped to "${standardById.get(li.standardId)}"`
        : `standard requested as "${li.standardAsWritten}" — not in catalog, left blank`
    );
  }
  return parts.length ? `AI Email Intake: ${parts.join("; ")}. Verify before quoting.` : null;
}

function buildSkippedItemNote(li) {
  const qtyText = li.quantity ? `${li.quantity} ${li.unit || ""}`.trim() : "quantity not specified";
  return `AI Email Intake: item not added to this Job — "${li.rawText || li.description}" (${qtyText}). Not in the catalog; needs a catalog decision before it can be added as a real line item.`;
}

router.post("/:id/confirm", (req, res) => {
  const db = getDb();
  const submission = getEmailIntakeSubmission(db, req.params.id);
  if (!submission || submission.status !== "Pending Review") {
    return res.redirect("/email-intake");
  }

  const body = req.body;
  const lineItems = parseConfirmLineItems(body);
  const errors = validateConfirm(body, lineItems);
  const options = getFormOptions(db);

  if (errors.length > 0) {
    // Re-derive the full match (not just the submitted mode string) so
    // "Use matched contact: X (Y)" still shows the real name on
    // re-render — the mode itself still reflects what was actually
    // submitted via formValues.sender_mode below, this only restores the
    // display details matchSender alone can provide.
    return res.status(400).send(
      emailIntakeReviewForm({
        submission,
        attachments: getEmailIntakeAttachments(db, submission.id),
        accounts: options.accounts,
        contacts: options.contacts,
        users: options.users,
        materials: options.materials,
        productForms: options.productForms,
        standards: options.standards,
        senderMatch: matchSender(db, submission.extracted.sender),
        formValues: { ...body, lineItems },
        errors,
      })
    );
  }

  const materialById = new Map(options.materials.map((m) => [m.id, m.name]));
  const productFormById = new Map(options.productForms.map((f) => [f.id, f.name]));
  const standardById = new Map(options.standards.map((s) => [s.id, s.code]));

  const activeLineItems = lineItems.filter((li) => !li.skip);
  const skippedLineItems = lineItems.filter((li) => li.skip);

  const accountMode =
    body.sender_mode === "new" ? "new" : body.sender_mode === "existingAccountNewContact" ? "existingAccountNewContact" : "existing";

  const { rfqId, accountId } = createRfqWithLineItems(db, {
    accountMode,
    accountId: body.account_id ? Number(body.account_id) : null,
    newAccount:
      accountMode === "new"
        ? {
            name: body.new_account_name,
            industry_segment: body.new_account_industry_segment,
            region: body.new_account_region,
            account_status: body.new_account_status || "Active",
          }
        : null,
    contactId: body.contact_id ? Number(body.contact_id) : null,
    newContact:
      accountMode === "new" || accountMode === "existingAccountNewContact"
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
    customerRequestedDeliveryDate: body.customer_requested_delivery_date || null,
    lineItems: activeLineItems.map((li) => ({
      materialId: li.materialId,
      productFormId: li.productFormId,
      standardId: li.standardId,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      lengthM: li.lengthM,
      catalogMatchNote: buildCatalogMatchNote(li, materialById, productFormById, standardById),
    })),
  });

  skippedLineItems.forEach((li) => {
    createActivity(db, {
      rfqId,
      accountId,
      userId: Number(body.sales_rep_id),
      activityType: "Note",
      note: buildSkippedItemNote(li),
    });
  });

  markEmailIntakeConfirmed(db, submission.id, rfqId);

  // Everything uploaded with this submission — the extraction screenshot
  // and any supplementary attachments alike — becomes a real Customer
  // Attachment now that there's a real RFQ to attach it to. The bytes are
  // copied into RFQ attachment storage under a fresh filename rather than
  // reusing email_intake_attachments' stored_filename — that filename was
  // only ever written to the email-intake directory, and the RFQ
  // attachment download route never looks there (see schema.js).
  getEmailIntakeAttachments(db, submission.id).forEach((att) => {
    const buffer = fs.readFileSync(getEmailIntakeAttachmentPath(att.stored_filename));
    const storedFilename = saveRfqAttachment(buffer, att.original_filename);
    createRfqAttachment(db, {
      rfqId,
      originalFilename: att.original_filename,
      storedFilename,
      mimeType: att.mime_type,
      description: att.description || (att.used_for_extraction ? "Original email screenshot (used for AI extraction)" : null),
    });
  });

  res.redirect(`/rfqs/${rfqId}`);
});

router.post("/:id/discard", (req, res) => {
  const db = getDb();
  const submission = getEmailIntakeSubmission(db, req.params.id);
  if (submission && submission.status === "Pending Review") {
    markEmailIntakeDiscarded(db, submission.id);
  }
  res.redirect("/email-intake");
});

module.exports = router;
