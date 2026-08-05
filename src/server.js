// src/server.js
// Entry point. Keeps startup logic separate from route logic so this file stays short.

const express = require("express");
const path = require("path");
const { getDb } = require("./db/connection");
const { layout } = require("./views/layout");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // parses the New RFQ form, including repeatable line_items[n][...] fields
app.use(express.static(path.join(__dirname, "public")));

// Render (and any monitor) can hit this to confirm the app is alive.
app.get("/healthz", (req, res) => res.json({ status: "ok" }));

// Feature routes are added one file at a time under src/routes/.
// rfqIntake must be mounted before rfqs: both live at /rfqs, and rfqs.js's
// GET /:id would otherwise swallow GET /rfqs/new (treating "new" as an id).
app.use("/rfqs", require("./routes/rfqIntake"));
app.use("/rfqs", require("./routes/rfqAttachments")); // customer attachments only — see src/db/schema.js
app.use("/rfqs", require("./routes/rfqs"));
app.use("/supplier-inquiries", require("./routes/supplierInquiryAttachments")); // supplier-facing attachments only

app.get("/", (req, res) => {
  res.send(
    layout({
      title: "Home",
      bodyHtml: `<h1>PM International Sandbox</h1><p><a href="/rfqs">View RFQs</a></p>`,
    })
  );
});

app.listen(PORT, () => {
  console.log(`Sandbox running on port ${PORT}`);
  getDb(); // fail fast if the database can't be opened
});
