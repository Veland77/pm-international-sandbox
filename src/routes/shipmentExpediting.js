// src/routes/shipmentExpediting.js
// The Expediting workscreen: one page per shipment showing the milestone
// timeline (inline editable), a running contact log, and shipment
// paperwork uploads.

const express = require("express");
const multer = require("multer");
const { getDb } = require("../db/connection");
const { getShipmentById } = require("../db/shipmentQueries");
const { getMilestonesForShipment, getMilestoneById, updateMilestone } = require("../db/shipmentMilestoneQueries");
const { getLogEntriesForShipment, createLogEntry } = require("../db/expeditingLogQueries");
const { getDocumentsForShipment, getDocumentById, createDocument } = require("../db/shipmentDocumentQueries");
const { saveShipmentDocument, getShipmentDocumentPath } = require("../storage/shipmentDocumentStorage");
const { shipmentExpeditingPage } = require("../views/shipmentExpeditingPage");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = express.Router();

function loadPageData(db, shipmentId) {
  const shipment = getShipmentById(db, shipmentId);
  if (!shipment) return null;

  return {
    shipment,
    milestones: getMilestonesForShipment(db, shipment.id),
    logEntries: getLogEntriesForShipment(db, shipment.id),
    documents: getDocumentsForShipment(db, shipment.id),
  };
}

router.get("/:id/expediting", (req, res) => {
  const db = getDb();
  const data = loadPageData(db, req.params.id);

  if (!data) {
    return res.status(404).send("Shipment not found");
  }

  res.send(shipmentExpeditingPage(data));
});

router.post("/:id/milestones/:milestoneId", (req, res) => {
  const db = getDb();
  const shipmentId = Number(req.params.id);
  const milestone = getMilestoneById(db, req.params.milestoneId);

  if (!milestone || milestone.shipment_id !== shipmentId) {
    return res.status(404).send("Milestone not found");
  }

  updateMilestone(db, milestone.id, {
    estimatedDate: req.body.estimated_date,
    actualDate: req.body.actual_date,
    notes: (req.body.notes || "").trim(),
  });

  res.redirect(`/shipments/${shipmentId}/expediting`);
});

router.post("/:id/log", (req, res) => {
  const db = getDb();
  const shipmentId = Number(req.params.id);
  const shipment = getShipmentById(db, shipmentId);

  if (!shipment) {
    return res.status(404).send("Shipment not found");
  }

  const note = (req.body.note || "").trim();
  if (note) {
    createLogEntry(db, {
      shipmentId,
      contactType: req.body.contact_type || "Note",
      note,
      followUpDate: req.body.follow_up_date,
    });
  }

  res.redirect(`/shipments/${shipmentId}/expediting`);
});

router.post("/:id/documents", upload.single("file"), (req, res) => {
  const db = getDb();
  const shipmentId = Number(req.params.id);
  const shipment = getShipmentById(db, shipmentId);

  if (!shipment) {
    return res.status(404).send("Shipment not found");
  }

  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const storedFilename = saveShipmentDocument(req.file.buffer, req.file.originalname);
  createDocument(db, {
    shipmentId,
    docType: req.body.doc_type || "Other",
    originalFilename: req.file.originalname,
    storedFilename,
  });

  res.redirect(`/shipments/${shipmentId}/expediting`);
});

router.get("/:id/documents/:documentId", (req, res) => {
  const db = getDb();
  const document = getDocumentById(db, req.params.documentId);

  if (!document || document.shipment_id !== Number(req.params.id)) {
    return res.status(404).send("Document not found");
  }

  res.download(getShipmentDocumentPath(document.stored_filename), document.original_filename);
});

module.exports = router;
