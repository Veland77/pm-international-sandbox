# Phase 4 — Sourcing Lifecycle

Expands the sandbox to model PM's real sourcing workflow, not just a flat RFQ list.

Add one field to the existing `rfqs` table: `pipeline_stage`, one of: New, Sourcing, Comparing Offers, Quoted to Customer, PO Received, In Production, Shipped, Delivered, Closed, or Lost. This is the single at-a-glance answer to "where is this deal right now" — every other table below is detail you drill into from an RFQ.

## New tables

**suppliers** — id, name, country, region, specialty (free text)

**supplier_rfqs** — one row per vendor a given customer RFQ was sent to. id, rfq_id, supplier_id, sent_date, status (Sent, Quoted, Declined, Expired)

**supplier_rfq_line_items** — which line items went to which vendor. id, supplier_rfq_id, rfq_line_item_id, quantity_requested

**supplier_quotes** — a vendor's response. id, supplier_rfq_id, quote_ref, received_date, availability (In Stock, Make to Order), lead_time_days, valid_until

**supplier_quote_line_items** — the comparable numbers. id, supplier_quote_id, rfq_line_item_id, unit_price, currency (plain text, e.g. "USD" or "CNY" — no conversion logic needed), weight_kg, dimensions, crating_cost, lead_time_days

**customer_quote_options** — links a customer-facing quote option to the vendor quote behind it. id, quote_id, option_label (e.g. "Option A"), supplier_quote_id, notes

**item_numbers** — traceability numbering. Format: `{FORM}-{MATERIAL}-{YY}-{SEQUENCE}`, e.g. `SP-DX22-26-00042` for Seamless Pipe, Duplex 2205, 2026, #42.

- Form codes: PL (Plate/Sheet), SP (Seamless Pipe), WP (Welded Pipe), TB (Tubing), RB (Round Bar), FT (Fitting), FL (Flange), VL (Valve), FG (Forging), FS (Fastener)
- Material codes: short codes derived from the materials table (e.g. DX22, SD25, 6MO, TI2, CN9010, NI200, A4130, SS316)
- Sequence: a plain incrementing counter, never literally reused
- id, item_number (unique), rfq_line_item_id, form_id, material_id, spec_summary, status (Active, Not Converted, Superseded), created_date
- Assign a number when a line item is worked into an RFQ. If that RFQ is ultimately lost, append "X" to the item_number itself (00042 becomes 00042X) and set status to Not Converted — the record stays, just clearly marked as not sold. Put this generation logic in its own small file (src/db/itemNumbers.js), not inline in a route.

## Build

1. Write a short implementation plan first per house rules — file list, what each does — before writing code.
2. Add the new tables to schema.js, add pipeline_stage to the rfqs table.
3. Extend seed.js: add 4 suppliers (one each in China, Italy, Korea, Germany), give 2-3 of the existing RFQs a full supplier-comparison scenario (multiple vendors quoted with differing price/lead-time/availability so the comparison is meaningful), generate item numbers for all existing rfq_line_items, backfill pipeline_stage on existing RFQs based on their current status field (New→New, Quoting→Sourcing, Quoted→Quoted to Customer, Won→Closed, Lost→Lost).
4. Extend the /rfqs/:id detail page (still minimal HTML, no styling pass) to show: the pipeline_stage prominently, each line item's item number, and — when supplier quotes exist for that RFQ — a comparison table of vendor, price, lead time, availability, weight/dims, crating cost.
5. Verify locally if possible, otherwise via push + live deploy check as before.
