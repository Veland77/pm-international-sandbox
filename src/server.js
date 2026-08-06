// src/server.js
// Entry point. Keeps startup logic separate from route logic so this file stays short.

const express = require("express");
const path = require("path");
const { getDb } = require("./db/connection");
const { layout } = require("./views/layout");
const { requireAuth } = require("./middleware/basicAuth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // parses the New RFQ form, including repeatable line_items[n][...] fields

// Render's health check must reach this without credentials — defined
// before the auth gate below, so it's the one route that stays open.
app.get("/healthz", (req, res) => res.json({ status: "ok" }));

// Everything registered from here down requires HTTP Basic Auth
// (SANDBOX_USER / SANDBOX_PASSWORD) — including static assets.
app.use(requireAuth);

app.use(express.static(path.join(__dirname, "public")));

// Feature routes are added one file at a time under src/routes/.
// rfqIntake must be mounted before rfqs: both live at /rfqs, and rfqs.js's
// GET /:id would otherwise swallow GET /rfqs/new (treating "new" as an id).
app.use("/rfqs", require("./routes/rfqIntake"));
app.use("/rfqs", require("./routes/rfqAttachments")); // customer attachments only — see src/db/schema.js
app.use("/rfqs", require("./routes/customerFacingAttachments")); // customer-facing attachments only — see src/db/schema.js
app.use("/rfqs", require("./routes/inquiryIntake"));
app.use("/rfqs", require("./routes/freightIntake"));
app.use("/rfqs", require("./routes/lineItemSourcing"));
app.use("/rfqs", require("./routes/freightQuoteSelection"));
app.use("/rfqs", require("./routes/quoteIntake"));
// orderIntake must be mounted before rfqs: both live at /rfqs, and rfqs.js's
// GET /:id would otherwise swallow GET /rfqs/:id/convert-to-order.
app.use("/rfqs", require("./routes/orderIntake"));
app.use("/rfqs", require("./routes/rfqs"));
app.use("/orders", require("./routes/orders"));
app.use("/shipments", require("./routes/shipmentExpediting"));
app.use("/supplier-inquiries", require("./routes/supplierInquiryAttachments")); // supplier-facing attachments only
app.use("/supplier-inquiries", require("./routes/supplierInquiries"));
app.use("/inquiries", require("./routes/inquiryPrint"));
app.use("/freight-inquiries", require("./routes/freightPrint"));

app.get("/", (req, res) => {
  res.send(
    layout({
      title: "Home",
      bodyHtml: `
        <div class="card">
          <h1>PM International Sandbox</h1>
          <p>A fictional-data demo of the CRM + RFQ quoting pilot module.</p>
          <p><a class="btn btn-primary" href="/rfqs">View RFQs</a></p>
        </div>
      `,
    })
  );
});

app.listen(PORT, () => {
  console.log(`Sandbox running on port ${PORT}`);
  if (!process.env.SANDBOX_USER || !process.env.SANDBOX_PASSWORD) {
    console.warn("SANDBOX_USER / SANDBOX_PASSWORD not set — every request will be denied.");
  }
  getDb(); // fail fast if the database can't be opened
});
