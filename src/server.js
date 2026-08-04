// src/server.js
// Entry point. Keeps startup logic separate from route logic so this file stays short.

const express = require("express");
const path = require("path");
const { getDb } = require("./db/connection");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Render (and any monitor) can hit this to confirm the app is alive.
app.get("/healthz", (req, res) => res.json({ status: "ok" }));

// Every response should make clear this is a sandbox, never mistaken for the real system.
app.use((req, res, next) => {
  res.locals.sandboxBanner = "SANDBOX — TEST DATA";
  next();
});

// Feature routes are added one file at a time under src/routes/, e.g.:
// app.use("/products", require("./routes/products"));

app.get("/", (req, res) => {
  res.send(`<h1>PM International Sandbox</h1><p>${res.locals.sandboxBanner}</p>`);
});

app.listen(PORT, () => {
  console.log(`Sandbox running on port ${PORT}`);
  getDb(); // fail fast if the database can't be opened
});
