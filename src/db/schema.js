// src/db/schema.js
// Table definitions for the CRM + RFQ quoting pilot module.
// Structure mirrors PM International's real workflow (RFQ -> line items -> quote -> quote line items)
// but every table is filled with fictional data only. No real accounts, contacts, or pricing.

// Bump this whenever SCHEMA changes shape, OR when the fictional seed data
// itself needs to be regenerated on an already-seeded disk (seed:if-empty
// otherwise leaves existing data alone). seed.js compares it against
// schema_meta on the live disk and does a full wipe + reseed when they
// differ, since this is disposable fictional demo data, not production data.
const SCHEMA_VERSION = 15;

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
  due_date TEXT NOT NULL,                     -- when we owe the customer a quote back
  customer_requested_delivery_date TEXT       -- when the customer wants the goods (distinct from due_date)
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
  unit TEXT NOT NULL,               -- 'EA', 'FT', 'M'
  length_m REAL                     -- item length in meters, nullable (not every form has a meaningful length)
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY,
  quote_number TEXT NOT NULL UNIQUE,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,           -- 'Draft', 'Sent', 'Accepted', 'Rejected'
  created_date TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  promised_delivery_date TEXT     -- the delivery date PM commits to when quoting
);

CREATE TABLE IF NOT EXISTS quote_line_items (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id),
  rfq_line_item_id INTEGER NOT NULL REFERENCES rfq_line_items(id),
  unit_price_usd REAL NOT NULL,
  lead_time_days INTEGER NOT NULL,
  target_margin_pct REAL NOT NULL -- sales rep's target margin at quoting time, before a vendor is
                                   -- sourced; compare against the computed Gross Margin once one is
                                   -- selected (line_item_sourcing). Internal only, never shown to the customer.
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
--
-- "RFQ" is reserved exclusively for the customer-facing request (matches
-- PM's own site usage). What PM sends to a vendor is a Sourcing Inquiry —
-- a different thing, on the opposite side of the deal — hence
-- supplier_inquiries below, not "supplier_rfqs".

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT NOT NULL,
  specialty TEXT NOT NULL
);

-- A sourcing inquiry: PM asking one vendor to quote some of a customer
-- RFQ's line items.
CREATE TABLE IF NOT EXISTS supplier_inquiries (
  id INTEGER PRIMARY KEY,
  inquiry_number TEXT NOT NULL UNIQUE,  -- e.g. INQ-9001, same style/generation as rfq_number
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  sent_date TEXT NOT NULL,
  status TEXT NOT NULL             -- 'Sent', 'Quoted', 'Declined', 'Expired'
);

CREATE TABLE IF NOT EXISTS supplier_inquiry_line_items (
  id INTEGER PRIMARY KEY,
  supplier_inquiry_id INTEGER NOT NULL REFERENCES supplier_inquiries(id),
  rfq_line_item_id INTEGER NOT NULL REFERENCES rfq_line_items(id),
  quantity_requested INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_quotes (
  id INTEGER PRIMARY KEY,
  supplier_inquiry_id INTEGER NOT NULL REFERENCES supplier_inquiries(id),
  quote_ref TEXT NOT NULL,
  received_date TEXT NOT NULL,
  availability TEXT NOT NULL,      -- 'In Stock', 'Make to Order'
  lead_time_days INTEGER NOT NULL,
  valid_until TEXT NOT NULL,
  estimated_transit_days INTEGER NOT NULL DEFAULT 0  -- freight time on top of lead_time_days
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
  lead_time_days INTEGER NOT NULL,
  notes TEXT                       -- free text from the vendor's quote response, nullable
);

CREATE TABLE IF NOT EXISTS customer_quote_options (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id),
  option_label TEXT NOT NULL,      -- e.g. 'Option A'
  supplier_quote_id INTEGER NOT NULL REFERENCES supplier_quotes(id),
  notes TEXT
);

-- Which vendor is fulfilling each specific line item. Sourcing is decided
-- per line item, not per whole RFQ — PM commonly buys different items on
-- the same deal from different vendors.
CREATE TABLE IF NOT EXISTS line_item_sourcing (
  id INTEGER PRIMARY KEY,
  rfq_line_item_id INTEGER NOT NULL REFERENCES rfq_line_items(id),
  supplier_quote_line_item_id INTEGER NOT NULL REFERENCES supplier_quote_line_items(id),
  selected_date TEXT NOT NULL,
  status TEXT NOT NULL             -- 'Selected', 'Rejected'
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

-- Real conversion rates for turning a vendor's foreign-currency cost into
-- USD for margin reporting. rate_to_usd is "1 unit of currency_code equals
-- this many USD". Approximate public market data, not a live feed.
CREATE TABLE IF NOT EXISTS currency_rates (
  currency_code TEXT PRIMARY KEY,
  rate_to_usd REAL NOT NULL,
  as_of_date TEXT NOT NULL
);

-- Confidentiality boundary: customer attachments and supplier-facing
-- attachments are two separate tables, on purpose. PM has exclusivity
-- with some customers in certain markets, and suppliers must never see
-- which end customer an inquiry is for. Nothing in this codebase should
-- ever copy a row from one of these tables into the other.

-- The customer's original files. Never referenced from any supplier-facing
-- route or view.
CREATE TABLE IF NOT EXISTS rfq_attachments (
  id INTEGER PRIMARY KEY,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL UNIQUE,  -- randomized on disk; original_filename is for display/download only
  uploaded_date TEXT NOT NULL,
  mime_type TEXT NOT NULL
);

-- Files manually uploaded when preparing an outbound inquiry to a vendor.
-- Completely separate from rfq_attachments — never auto-copied or derived
-- from it.
CREATE TABLE IF NOT EXISTS supplier_inquiry_attachments (
  id INTEGER PRIMARY KEY,
  supplier_inquiry_id INTEGER NOT NULL REFERENCES supplier_inquiries(id),
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL UNIQUE,
  uploaded_date TEXT NOT NULL,
  mime_type TEXT NOT NULL
);

-- Order fulfillment lifecycle: converting a won RFQ into a purchase order,
-- grouping its line items into shipments, requesting freight quotes, and
-- the day-to-day expediting work (milestones, contact log, documents)
-- once goods are moving. See docs/ for the full design.

-- Once created, this is the record of the customer's PO against a
-- specific accepted quote. po_number is PM's own internal reference
-- (generated like rfq_number); customer_po_reference is whatever the
-- customer's own PO number/reference actually is, typed in at conversion.
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id),
  po_number TEXT NOT NULL UNIQUE,
  customer_po_reference TEXT NOT NULL,
  received_date TEXT NOT NULL,
  total_value REAL NOT NULL
);

-- The order's own pipeline_stage takes over as the live tracker once it
-- exists — the originating rfqs.pipeline_stage freezes at 'PO Received'
-- permanently and is never updated again.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  order_date TEXT NOT NULL,
  pipeline_stage TEXT NOT NULL DEFAULT 'PO Received' -- 'PO Received', 'In Production', 'Shipped',
                                                       -- 'Delivered', 'Closed', 'Lost'
);

-- Reuses the existing sourcing decision (line_item_sourcing) rather than
-- re-asking which vendor fulfills this line — conversion requires every
-- rfq_line_item to already have a Selected sourcing row.
CREATE TABLE IF NOT EXISTS order_line_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  rfq_line_item_id INTEGER NOT NULL REFERENCES rfq_line_items(id),
  line_item_sourcing_id INTEGER NOT NULL REFERENCES line_item_sourcing(id)
);

-- supplier_id is nullable: auto-populated for the common case (all of a
-- shipment's lines come from one vendor), left null when lines from
-- different vendors are deliberately combined into one shipment — in
-- that case origin/destination are entered/edited manually instead.
-- freight_quote_id optionally links back to a freight_quotes row already
-- obtained during RFQ quoting (see freight_inquiries below), so a
-- freight request doesn't need to be redone unless something's changed.
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  freight_forwarder TEXT,
  tracking_number TEXT,
  mode TEXT,               -- e.g. 'Ocean', 'Air', 'Truck' — free text
  origin TEXT,
  destination TEXT,
  ship_date TEXT,
  eta TEXT,
  pod_received TEXT,       -- nullable date proof-of-delivery was actually received, not a bare flag
  freight_quote_id INTEGER REFERENCES freight_quotes(id)
);

-- Which order lines travel together in a given shipment.
CREATE TABLE IF NOT EXISTS shipment_line_items (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  order_line_item_id INTEGER NOT NULL REFERENCES order_line_items(id)
);

-- Same shape as suppliers — a fixed pool to pick from rather than free
-- text, so a forwarder can't be typo'd into two different records.
CREATE TABLE IF NOT EXISTS freight_forwarders (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT NOT NULL,
  specialty TEXT NOT NULL
);

-- A freight quote request ("FRQ"), sent to a freight forwarder. Tied to
-- the RFQ, not a shipment — freight pricing is part of what builds the
-- customer quote in the first place (vendor price + crating + freight),
-- well before there's a PO or a shipment. Always scoped to line items
-- from a single vendor's pickup location — see freightInquiryGrouping.js
-- for why a request can never mix locations.
CREATE TABLE IF NOT EXISTS freight_inquiries (
  id INTEGER PRIMARY KEY,
  frq_number TEXT NOT NULL UNIQUE,  -- e.g. FRQ-7001, same style/generation as rfq_number/inquiry_number
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  freight_forwarder_id INTEGER NOT NULL REFERENCES freight_forwarders(id),
  sent_date TEXT NOT NULL,
  status TEXT NOT NULL              -- 'Sent', 'Quoted', 'Declined'
);

-- Which specific RFQ line items a given freight request covers — may be a
-- subset of the RFQ, not necessarily all of it.
CREATE TABLE IF NOT EXISTS freight_inquiry_line_items (
  id INTEGER PRIMARY KEY,
  freight_inquiry_id INTEGER NOT NULL REFERENCES freight_inquiries(id),
  rfq_line_item_id INTEGER NOT NULL REFERENCES rfq_line_items(id)
);

CREATE TABLE IF NOT EXISTS freight_quotes (
  id INTEGER PRIMARY KEY,
  freight_inquiry_id INTEGER NOT NULL REFERENCES freight_inquiries(id),
  quote_ref TEXT NOT NULL,
  received_date TEXT NOT NULL,
  price REAL NOT NULL,
  currency TEXT NOT NULL,
  transit_days INTEGER NOT NULL,
  valid_until TEXT NOT NULL,
  notes TEXT                        -- free text from the forwarder's quote response, nullable
);

-- Which freight quote wins for a given RFQ + vendor pickup location.
-- Scoped by (rfq_id, supplier_id) rather than a single freight_inquiry_id
-- because comparing forwarders means comparing across SIBLING freight
-- inquiries that cover the same vendor (one inquiry = one forwarder — see
-- freight_inquiries above), not multiple quotes within one inquiry.
-- Same reject-old/insert-new pattern as line_item_sourcing: selecting a
-- different quote never deletes the prior choice, just marks it Rejected.
CREATE TABLE IF NOT EXISTS freight_quote_selection (
  id INTEGER PRIMARY KEY,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  freight_quote_id INTEGER NOT NULL REFERENCES freight_quotes(id),
  selected_date TEXT NOT NULL,
  status TEXT NOT NULL              -- 'Selected', 'Rejected'
);

-- All 6 rows are auto-created (blank) whenever a shipment is created, so
-- the Expediting screen always shows the full timeline ready for inline
-- editing rather than requiring someone to add each stage manually.
CREATE TABLE IF NOT EXISTS shipment_milestones (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  milestone_type TEXT NOT NULL,   -- 'Production', 'Ready for Pickup/FCA', 'Transit to Port/Airport',
                                   -- 'Ocean/Air Transport', 'Customs Clearance', 'Final Delivery'
  estimated_date TEXT,
  actual_date TEXT,
  notes TEXT
);

-- A simple running contact log for expediting a shipment — newest first.
CREATE TABLE IF NOT EXISTS expediting_log (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  entry_date TEXT NOT NULL,
  contact_type TEXT NOT NULL,     -- 'Call', 'Email', 'Note'
  note TEXT NOT NULL,
  follow_up_date TEXT
);

-- What QA attaches as certificates/paperwork arrive. Same storage pattern
-- as the earlier attachment work (persistent disk, randomized filenames)
-- but no confidentiality split needed here — this isn't customer- or
-- supplier-facing, just internal order paperwork.
CREATE TABLE IF NOT EXISTS shipment_documents (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  doc_type TEXT NOT NULL,         -- 'Packing List', 'Certificate of Compliance', 'Mill Certificate',
                                   -- 'Commercial Invoice', 'Bill of Lading'
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL UNIQUE,
  uploaded_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (
  version INTEGER NOT NULL
);
`;

module.exports = { SCHEMA, SCHEMA_VERSION };
