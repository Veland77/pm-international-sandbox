// src/db/schema.js
// Table definitions for the CRM + RFQ quoting pilot module.
// Structure mirrors PM International's real workflow (RFQ -> line items -> quote -> quote line items)
// but every table is filled with fictional data only. No real accounts, contacts, or pricing.

// Bump this whenever SCHEMA changes shape. seed.js compares it against
// schema_meta on the live disk and does a full wipe + reseed when they
// differ, since this is disposable fictional demo data, not production data.
const SCHEMA_VERSION = 4;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,          -- e.g. 'Inside Sales', 'Sales Manager'
  region TEXT NOT NULL         -- 'Lakeland FL', 'Houston TX', 'Cheshire UK'
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  industry_segment TEXT NOT NULL,  -- 'Offshore', 'Marine', 'Mining', 'Oil & Gas'
  region TEXT NOT NULL,
  account_status TEXT NOT NULL     -- 'Active', 'Prospect', 'Inactive'
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rfqs (
  id INTEGER PRIMARY KEY,
  rfq_number TEXT NOT NULL UNIQUE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  sales_rep_id INTEGER NOT NULL REFERENCES users(id),
  project_name TEXT NOT NULL,
  status TEXT NOT NULL,          -- 'New', 'Quoting', 'Quoted', 'Won', 'Lost'
  pipeline_stage TEXT NOT NULL DEFAULT 'New', -- 'New', 'Sourcing', 'Comparing Offers', 'Quoted to Customer',
                                               -- 'PO Received', 'In Production', 'Shipped', 'Delivered', 'Closed', 'Lost'
  created_date TEXT NOT NULL,
  due_date TEXT NOT NULL
);

-- Materials and product forms mirror PM's real published product taxonomy
-- (public marketing content from pmfirst.com) so the sandbox catalog looks
-- and behaves like the real one. No pricing, supplier, or sourcing data.

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE    -- e.g. 'Duplex Stainless Steel', 'Titanium', '6% Moly'
);

CREATE TABLE IF NOT EXISTS product_forms (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE    -- e.g. 'Pipe & Pipe Fittings', 'Flanges', 'Valves'
);

CREATE TABLE IF NOT EXISTS standards (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,   -- e.g. 'ASTM A790', 'API 6D', 'NORSOK M-650'
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rfq_line_items (
  id INTEGER PRIMARY KEY,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  material_id INTEGER NOT NULL REFERENCES materials(id),
  product_form_id INTEGER NOT NULL REFERENCES product_forms(id),
  standard_id INTEGER REFERENCES standards(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit TEXT NOT NULL                -- 'EA', 'FT', 'M'
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY,
  quote_number TEXT NOT NULL UNIQUE,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,           -- 'Draft', 'Sent', 'Accepted', 'Rejected'
  created_date TEXT NOT NULL,
  valid_until TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quote_line_items (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id),
  rfq_line_item_id INTEGER NOT NULL REFERENCES rfq_line_items(id),
  unit_price_usd REAL NOT NULL,
  lead_time_days INTEGER NOT NULL,
  margin_pct REAL NOT NULL        -- internal only, never shown on customer-facing quote output
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  rfq_id INTEGER REFERENCES rfqs(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  activity_type TEXT NOT NULL,    -- 'Call', 'Email', 'Note', 'Status Change'
  note TEXT NOT NULL,
  created_date TEXT NOT NULL
);

-- Sourcing lifecycle: vendors an RFQ's line items were sent to, their
-- quotes, and the traceability numbers assigned to each line item.
-- See docs/phase4-sourcing-lifecycle.md for the full design.

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT NOT NULL,
  specialty TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_rfqs (
  id INTEGER PRIMARY KEY,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  sent_date TEXT NOT NULL,
  status TEXT NOT NULL             -- 'Sent', 'Quoted', 'Declined', 'Expired'
);

CREATE TABLE IF NOT EXISTS supplier_rfq_line_items (
  id INTEGER PRIMARY KEY,
  supplier_rfq_id INTEGER NOT NULL REFERENCES supplier_rfqs(id),
  rfq_line_item_id INTEGER NOT NULL REFERENCES rfq_line_items(id),
  quantity_requested INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_quotes (
  id INTEGER PRIMARY KEY,
  supplier_rfq_id INTEGER NOT NULL REFERENCES supplier_rfqs(id),
  quote_ref TEXT NOT NULL,
  received_date TEXT NOT NULL,
  availability TEXT NOT NULL,      -- 'In Stock', 'Make to Order'
  lead_time_days INTEGER NOT NULL,
  valid_until TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_quote_line_items (
  id INTEGER PRIMARY KEY,
  supplier_quote_id INTEGER NOT NULL REFERENCES supplier_quotes(id),
  rfq_line_item_id INTEGER NOT NULL REFERENCES rfq_line_items(id),
  unit_price REAL NOT NULL,
  currency TEXT NOT NULL,          -- e.g. 'USD', 'CNY' — no conversion logic
  weight_kg REAL NOT NULL,
  dimensions TEXT NOT NULL,
  crating_cost REAL NOT NULL,
  lead_time_days INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_quote_options (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id),
  option_label TEXT NOT NULL,      -- e.g. 'Option A'
  supplier_quote_id INTEGER NOT NULL REFERENCES supplier_quotes(id),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS item_numbers (
  id INTEGER PRIMARY KEY,
  item_number TEXT NOT NULL UNIQUE,  -- {FORM}-{MATERIAL}-{YY}-{SEQUENCE}, e.g. SP-DX22-26-00042
  rfq_line_item_id INTEGER NOT NULL REFERENCES rfq_line_items(id),
  form_id INTEGER NOT NULL REFERENCES product_forms(id),
  material_id INTEGER NOT NULL REFERENCES materials(id),
  spec_summary TEXT NOT NULL,
  status TEXT NOT NULL,             -- 'Active', 'Not Converted', 'Superseded'
  created_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (
  version INTEGER NOT NULL
);
`;

module.exports = { SCHEMA, SCHEMA_VERSION };
