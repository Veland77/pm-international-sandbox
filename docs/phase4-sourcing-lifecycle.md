# Phase 4 — Sourcing Lifecycle

Expands the sandbox to model PM's real sourcing workflow, not just a flat RFQ list.

Add one field to the existing `rfqs` table: `pipeline_stage`, one of: New, Sourcing, Comparing Offers, Quoted to Customer, PO Received, In Production, Shipped, Delivered, Closed, or Lost. This is the single at-a-glance answer to "where is this deal right now" — every other table below is detail you drill into from an RFQ.

## New tables

**suppliers** — id, name, country, region, specialty (free text)

**supplier_inquiries** — one row per vendor a given customer RFQ was sent to (a "Sourcing Inquiry" — see the rename note below). id, inquiry_number, rfq_id, supplier_id, sent_date, status (Sent, Quoted, Declined, Expired)

**supplier_inquiry_line_items** — which line items went to which vendor. id, supplier_inquiry_id, rfq_line_item_id, quantity_requested

**supplier_quotes** — a vendor's response. id, supplier_inquiry_id, quote_ref, received_date, availability (In Stock, Make to Order), lead_time_days, valid_until

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

## Correction: sourcing is per line item, not per RFQ

Sourcing needs to be tracked per line item, not per whole RFQ — PM commonly buys item 1 from one vendor and item 2 from a different vendor on the same deal.

**line_item_sourcing** — the source of truth for "which vendor is fulfilling this specific item." id, rfq_line_item_id, supplier_quote_line_item_id, selected_date, status (Selected, Rejected)

(No `orders` table existed in the schema at the time of this correction, so there was nothing to remove there. `customer_quote_options` — the customer-facing quote-option-to-vendor-quote link — is separate and unaffected.)

## New fields (added alongside the correction above)

- `rfqs.customer_requested_delivery_date` — when the customer wants the goods, distinct from `due_date` (which is when they want our quote back)
- `quotes.promised_delivery_date` — the delivery date PM commits to when quoting
- `supplier_quotes.estimated_transit_days` — freight time to add on top of a vendor's `lead_time_days` to estimate when goods actually arrive
- `rfq_line_items.length_m` — nullable real number, item length in meters (used to flag oversized items, e.g. length > 6m, as air-freight constrained)

## RFQ detail page additions

At the top of the page, above everything else: a summary block showing Total Order Value, Total Gross Profit (both $ and %, computed from customer sell price minus the selected vendor's cost per line), and the three delivery dates side by side (customer requested / PM promised / estimated vendor arrival — computed from FCA-ready date + transit days). The line items table shows which vendor was selected per line (when a selection exists) and flags any line item with length_m > 6 visibly ("⚠ Oversized — air freight constrained").

Implementation notes:
- Estimated vendor arrival = vendor's `received_date` + that line's `lead_time_days` (FCA-ready) + `estimated_transit_days`; the summary shows the latest arrival across all sourced lines, since the order isn't complete until the last item lands.
- Seeded demo scenario: Barrow's line items are split across two vendors (mixed sourcing); Delta Ridge and Gulfstream stay single-vendor for contrast.
- Currency conversion and vendor pricing: see the correction below — the approach described in the original build changed.

## Correction: real currency table, honest vendor costs, and two bug fixes

The first pass got three things wrong, found through review rather than by construction:

**1. Currency conversion needs to be a real table, not a hardcoded constant.** Replaced the original `FIXED_DEMO_USD_RATES` JS constant with an actual **currency_rates** table: `currency_code` (PK), `rate_to_usd`, `as_of_date`. Seeded with realistic approximate real-world rates (public market data, not a live feed): USD 1.0, EUR 1.08, CNY 0.139, KRW 0.000725. `src/db/orderSummary.js` also defines `FX_MARGIN_PCT = 0.5` — a currency-conversion spread applied only when converting a vendor's foreign-currency cost to USD (never applied to USD-native costs).

**2. Vendor cost must be independent of customer price, and margin must be allowed to be bad.** The seed data initially derived vendor cost as a fraction of the customer's sell price — that guarantees a good-looking margin every time, which defeats the point of tracking vendor cost separately. It was reverted to independent, hand-picked native-currency prices per vendor/line (`unitPrices` in `seed/supplierFixtures.js`), chosen against the real `currency_rates` + `FX_MARGIN_PCT` so the outcome is deliberate:
  - Barrow & Delta Ridge: the selected vendor on each line lands at a realistic ~17-21% margin.
  - **Gulfstream is the deliberate exception**: its selected vendor (Rhein) was chosen for speed/in-stock availability, not price, and comes out at a genuine **-17% to -25% margin per line** (Total Gross Profit ≈ -18%). The non-selected comparison vendor (Ferro) would have been cheaper but slower (Make to Order, 28 days) — a real "paid extra for speed" tradeoff, visible in the Supplier Comparison table. This is the sandbox's proof that the system surfaces bad deals rather than hiding them; it's deliberately not the default state on every RFQ.

**3. Two bug fixes found during this correction:**
  - The RFQ detail page's line items table now also shows **Buy Price**, **Sell Price**, and **Gross Margin** ($ and %) per line (blank when no vendor is selected yet) — computed by `buildLineItemMargins()` in `orderSummary.js`, which `buildOrderSummary()` reuses for its totals instead of duplicating the loop.
  - `supplier_quotes.sent_date`/`received_date`/`valid_until` and `line_item_sourcing.selected_date` were hardcoded literal date strings — the only dates in `seed.js` not computed relative to "now" like everything else. As real time passes those fixed dates drift into each RFQ's past, eventually producing an estimated vendor arrival date before the RFQ was even created. Fixed by computing them with `daysFromNow()` relative to each RFQ's own timeline.

**4. `quote_line_items.margin_pct` renamed to `target_margin_pct`** (kept, not removed) — it's the sales rep's target margin at quoting time, before a vendor is sourced. It's a genuinely different number from the computed **Gross Margin** (the actual outcome once a vendor is selected), so keeping both is useful; the rename plus the view's "Target Margin %" column header make sure they're never read as contradicting each other.

## Correction: "RFQ" renamed to "Sourcing Inquiry" on the supplier side

"RFQ" was being used for two different things: what a customer sends PM, and what PM sends a vendor. That's a real source of confusion in operation, and was already getting confusing in the code. "RFQ" is now reserved exclusively for the customer-facing request — matching how PM's own site already uses the word. The supplier-facing side is now a **Sourcing Inquiry**:

- `supplier_rfqs` → **`supplier_inquiries`**, with a new `inquiry_number` field (format `INQ-XXXX`, e.g. `INQ-9001`) generated the same way `rfq_number` is — a plain incrementing counter (`inquiryCounter` in `seed.js`, starting at 9001).
- `supplier_rfq_line_items` → **`supplier_inquiry_line_items`**.
- `supplier_quotes.supplier_rfq_id` → **`supplier_inquiry_id`**.
- The `rfq_id` column on `supplier_inquiries` is unchanged — it's a genuine foreign key to the customer's `rfqs` table (which vendor inquiry, for which customer RFQ), so that usage of "rfq" was always correct.
- The RFQ detail page's Supplier Comparison table now leads with an **Inquiry #** column, so it's clear which outbound inquiry a given vendor quote came from.

## Customer/supplier attachment confidentiality separation

PM has exclusivity with some customers in certain markets, and suppliers must never see which end customer an inquiry is for, or they could approach them directly. This is a confidentiality control, not just a feature — so the two attachment systems are built as two entirely independent stacks, not a shared, parameterized one. A shared abstraction is itself a risk here: it's a code path a future edit could accidentally use to blur the line. No function or route in either system imports anything from the other.

**New tables**

- **rfq_attachments** — the customer's original files. id, rfq_id, original_filename, stored_filename, uploaded_date, mime_type. Never referenced from any supplier-facing route or view.
- **supplier_inquiry_attachments** — files manually uploaded when preparing an outbound inquiry. id, supplier_inquiry_id, original_filename, stored_filename, uploaded_date, mime_type. Completely separate; never auto-copied or derived from `rfq_attachments`.

**Storage**: uploaded files go on the persistent disk under `ATTACHMENTS_DIR` (`/data/attachments` in production, matching the `DATABASE_PATH` pattern), in two separate subfolders — `attachments/rfq/` and `attachments/supplier-inquiry/`. Stored filenames are randomized (extension preserved, original name discarded) so identity can't leak through the filename itself; the real filename is kept only in the database and restored on download via `Content-Disposition`.

**Independent modules, one full set per side** (`src/storage/`, `src/db/`, `src/routes/`, `src/views/`) — `rfqAttachment*` for the customer side, `supplierInquiryAttachment*` for the supplier side. Upload uses `multer` (memory storage) for multipart parsing — the one new dependency here, since hand-rolling multipart parsing reliably isn't practical.

**UI (at the time of this build)**: the RFQ detail page got a "Customer Attachments" section labeled **"Internal only — do not share with suppliers"**, and a "Supplier-Facing Attachments" section — grouped per Sourcing Inquiry, since there was no dedicated inquiry page yet — labeled **"Confirmed clean of customer identity"**, with its own independent upload/list/download. See the next section — once the inquiry page existed, the upload UI moved there.

**Verified**: uploaded a test file to a customer RFQ and confirmed it appeared only in Customer Attachments, nowhere in the Supplier Comparison table or Supplier-Facing Attachments for any of that RFQ's inquiries. Uploaded a separate test file as a supplier-inquiry attachment and confirmed the reverse. `tests/attachments.test.js` encodes this as a standing check: inserting into one attachment table never surfaces when querying the other.

## Sourcing Inquiry detail page

Gives each Sourcing Inquiry its own page at `GET /supplier-inquiries/:id` (`src/routes/supplierInquiries.js` + `src/views/supplierInquiryDetail.js`, queries in `src/db/supplierInquiryQueries.js`), instead of everything about an inquiry living embedded on the RFQ page.

Shows: supplier info, the line items requested from that vendor, the vendor's quote if one's been received (pricing, weight/dimensions, crating cost, lead time), and — per quote line item — whether it was actually **Selected** (via `line_item_sourcing`), so it's obvious at a glance which lines this vendor is fulfilling versus which went elsewhere. Deliberately excludes customer sell price/margin — nothing about PM's internal pricing belongs on a page oriented around a single vendor. The `rfq_id`/`rfq_number` it does include are for an internal staff back-link only, not shown to any supplier — this page is meant to be safe to have open while corresponding with the vendor.

Now that inquiries have a proper home, two things that were stopgaps on the RFQ page changed:
- The RFQ page's "Supplier-Facing Attachments" section is now a lightweight links list (inquiry #, vendor, attachment count) pointing to each inquiry's own page, instead of duplicating full upload widgets in two places. The single-inquiry upload/list block (`inquiryAttachmentBlock()`) is exported from `supplierInquiryAttachmentsSection.js` and reused as the real upload UI on the new page.
- Supplier attachment upload now redirects to the inquiry's own page instead of back to the RFQ.
- The Supplier Comparison table's Inquiry # cells now link to the inquiry page.

No schema changes were needed — this reads existing tables — so it shipped without a reseed.

## Future: margin override rule

Documentation only — no code changes yet. This applies once quote creation/editing gets built, not to the RFQ intake form.

Whenever a future step lets someone set or edit a customer-facing sell price, if the resulting margin would be negative (selling below the selected vendor's cost), the system must show a clear warning and require explicit manual confirmation before it can be saved. Not silently allowed, and not silently blocked either — negative margins are sometimes a real, deliberate business decision (loss-leader, relationship deal), but they should never happen by accident.
