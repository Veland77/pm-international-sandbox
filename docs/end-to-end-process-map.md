# End-to-End Process Map — RFQ to Payment

This is the persistent reference for what the sandbox is ultimately modeling: PM International's real quote-to-cash process, department by department, mapped against what's actually built today. Read this alongside `docs/phase4-sourcing-lifecycle.md` (the data-model design doc) — this file is the *process* view, that one is the *schema* view. Update both when either changes.

Status legend: **Built** (working in the sandbox) · **Partial** (data model exists, workflow/UI missing) · **Not Started** (designed, not built).

Two branches apply across the whole flow and are called out explicitly below:
- **In-stock shortcut** — if a line item is already in PM inventory (Houston / Lakeland / UK), Phase 1 (sourcing) is skipped entirely and the item goes straight to the customer offer.
- **Quote revalidation** — if a customer PO arrives after a vendor quote's `valid_until` date, the vendor must reconfirm pricing (steel is volatile) before the order is placed.

---

## Phase 0 — Demand Generation & Intake

| # | Step | Department | Status | Notes |
|---|------|-----------|--------|-------|
| 0 | Marketing & Lead Generation | Marketing | Not Started | Website, LinkedIn, campaigns. Out of sandbox scope — shown for completeness only. |
| 0.5 | AI Email/Screenshot Intake | Sales | Not Started | Paste an email or screenshot → AI drafts an RFQ + classifies the sender (End User / Distributor-Supply House like DNOW / Unclear). `rfq_intake` staging table already reserved in schema (see phase4 doc §3); actual extraction/classification logic not built. Technically feasible today using Claude's native vision/text understanding — no custom OCR needed. |
| 1 | RFQ Received from Customer | Sales | **Built** | `rfqs` + `rfq_line_items`. Item numbers assigned per `itemNumbers.js` logic. |
| 2 | Check Existing Inventory | Purchasing | Not Started | No inventory table yet. Real stock exists in Houston/Lakeland/UK — mainly fittings, titanium instrument pipe, not exclusively. Needs a static item-number scheme for standard stock items (separate from the per-deal item numbering already built). **This is the in-stock shortcut branch** — if matched, skip to Phase 2 (Customer Offer). |

## Phase 1 — Sourcing & Vendor Comparison

| # | Step | Department | Status | Notes |
|---|------|-----------|--------|-------|
| 3 | Sourcing Inquiry (INQ) Sent to Vendors | Purchasing | **Built** | `supplier_inquiries` + `supplier_inquiry_line_items`, printable PDF, attachments kept structurally separate from customer attachments (`supplier_inquiry_attachments` vs. `rfq_attachments` — never auto-derived from each other). |
| 4 | **Compare Vendor Quotes & Select Winner per Line Item** | Purchasing | **Built** | `line_item_sourcing`. This is the step the original 17-step list didn't name explicitly, even though it's the core of what PM does — different vendors can win different line items on one deal. Compare/select UI live at `/rfqs/:id/line-items/:id/compare` — every vendor quote received for that line item (price, currency, lead time, availability, notes), radio-select-and-submit, reject-old/insert-new so re-selecting keeps a history instead of overwriting it. Verified live. |
| 5 | Freight Quote (FRQ) Requested | Purchasing | **Built** | `freight_inquiries` (tied to `rfq_id`, not `shipment_id` — priced before a PO exists) + `freight_inquiry_line_items`. Auto-splits by vendor pickup location so weight from different origins is never summed into one quote. `freight_forwarders` CRM table backs forwarder selection. |
| 6 | **Select Freight Quote** | Purchasing | **Built** | `freight_quotes`. Compare/select UI live at `/rfqs/:id/freight-inquiries/:id/compare` — pools quotes across every sibling `freight_inquiry` covering the same vendor pickup location (one inquiry = one forwarder, so multiple forwarders show up as multiple inquiries), converts each price to USD via the existing FX logic and sorts by that so quotes in different currencies are genuinely comparable. Selection recorded in new `freight_quote_selection` table, same reject-old/insert-new history pattern as `line_item_sourcing`. Second decision point the original list left implicit. Verified live. |

## Phase 2 — Customer Offer & PO

| # | Step | Department | Status | Notes |
|---|------|-----------|--------|-------|
| 7 | Include Tariffs / Customs (HS Code) | Purchasing | Not Started | Depends on destination country (known internally, never shown to the vendor — confidentiality rule applies here too). Documented as future logic in phase4 doc. |
| 8 | Offer to Customer | Sales | Partial | `customer_quote_options` supports Option A / Option B (e.g. fast/expensive vs. slow/cheap) tied back to the winning vendor quote(s). Quote creation/editing UI not built — quotes currently only exist via seed data. Margin-override rule (negative margin → warning + manual confirmation) documented but not enforced yet. **Fixed (2026-08-06):** the Create Quote form's Sell Price field had two separate bugs — it rejected a comma decimal (e.g. Norwegian-locale "107,07") and blanked itself back to empty on a validation-error re-render (both from using `<input type="number">`, which browsers refuse to display in a non-period format); and, independently, the field's `sell_price[<rfq_line_item_id>]` name let express's body parser (`qs`) silently misread the group as a plain array once every id in it looked like a small number, discarding the real ids so every price came back "missing" no matter what was typed. Both fixed and verified live. |
| 9 | Receiving PO from Customer | Sales | **Built** | `purchase_orders`, tied to the accepted `quote_id`. **Fixed (2026-08-06):** the Convert to Order screen's "Ships With" vendor-reassignment dropdowns had the same id-indexed bracket-field bug as the Sell Price fix above — silently dropped by the same `qs` quirk, so any reassignment away from a line's default vendor grouping was ignored with no error shown at all. Fixed the same way (non-numeric-prefixed field names) and verified live. |
| 10 | **Revalidate Vendor Quote if Expired** | Purchasing | Not Started | `supplier_quotes.valid_until` already exists in the schema — the check against it (and the supplier re-confirmation workflow) isn't built. Real risk given steel price volatility. |

## Phase 3 — Vendor Order & Confirmation

| # | Step | Department | Status | Notes |
|---|------|-----------|--------|-------|
| 11 | Purchase Order Sent to Vendor | Purchasing | **Built** | Formal PO document, mirroring the INQ print pattern, plus real issuance tracking rather than a stateless render-on-request. One PO per vendor sourced on an order (grouped via `line_item_sourcing`, not shipment grouping — a combined shipment's `supplier_id` can be null when different vendors' lines are deliberately shipped together, which isn't the same thing as which vendor gets billed). "Generate Purchase Order" is a deliberate action (`POST /orders/:id/po/:supplierId/generate`) that inserts a `vendor_po_issuances` row (order_id, supplier_id, issued_date — no "generated by" field yet, since there's no login/session concept in this app, only shared HTTP Basic Auth); the print view (`GET .../print`) redirects back to the order page until that row exists, so viewing the document isn't possible without the action having happened. PO number is fully derived (`{po_number}-S{supplierId}`), never stored — the new table only tracks whether/when it was issued. Confidentiality enforced structurally, same as the INQ document: the print queries have no join path to `accounts`/`contacts`/`quote_line_items` at all. Verified live. |
| 12 | Confirmation from Supplier | Purchasing | Not Started | Vendor's formal acknowledgment of the PO. No field/table yet. |
| 13 | Confirmation to Customer | Sales | Not Started | No explicit step/notification yet — currently implicit in order status. |
| 14 | Advance Payment to Vendor (Proforma Invoice) | Accounting | Not Started | Some vendors require payment in advance based on relationship/track record. Needs: a proforma invoice generator, and a credit-terms/risk field on `suppliers` (and `accounts`, for the mirror case — advance payment *from* customers) to drive the decision. **Data model gap — not yet in schema.** |

## Phase 4 — Production, QA & Expediting

| # | Step | Department | Status | Notes |
|---|------|-----------|--------|-------|
| 15 | Expediting with Supplier | Operations | Partial | `expediting_log` — proactive follow-up trail (email/call/note + follow-up date) exists and is seeded. |
| 15b | **QA / ISO 9001 Documentation Trail** | Operations | Not Started | PM is ISO 9001:2015 certified (per their public site) — this system needs to *prove* process was followed, not just record notes. Needs a formal checklist/checkpoint table (photos, measurements, spec confirmation, occasionally an in-person vendor visit on large deliveries) distinct from the free-text `expediting_log`. **Data model gap — flagged, not designed yet.** QA sits organizationally inside Operations, under Documentation. |
| 16 | Documentation, Labels, Proforma & Commercial Invoices | Operations | Partial | `shipment_documents` (Packing List, Certificate of Compliance, Mill Certificate, Commercial Invoice, Bill of Lading) built with real file upload/download. Proforma invoice generation specifically not built (see Phase 3 also). |

## Phase 5 — Freight & Delivery

| # | Step | Department | Status | Notes |
|---|------|-----------|--------|-------|
| 17 | Arrange Freight Collection | Operations | Not Started | From confirmed vendor location(s) once production is ready. |
| 18 | Keep Customer Portal Updated | Sales / Admin | Not Started | This is Module 7 of the original roadmap — a full separate system (customer login, self-service status), not a small step. Not scoped in detail yet; worth a rough mockup so stakeholders can see the shape of it. |
| 19 | Track Freight Milestones | Operations | **Built** | `shipment_milestones` — six stages: Production → Ready for Pickup/FCA → Transit to Port/Airport → Ocean/Air Transport → Customs Clearance → Final Delivery, each with estimated/actual date + notes. |
| 20 | Coordinate Delivery | Operations | Partial | Final-mile handoff — covered loosely by milestone tracking, no dedicated workflow. |

## Phase 6 — Invoicing & Payment

| # | Step | Department | Status | Notes |
|---|------|-----------|--------|-------|
| 21 | Send Invoice / Track Accounts Receivable | Accounting | Not Started | Advance payment from customer where relationship/track record warrants it (mirrors Phase 3's vendor-side logic); final invoice; payment tracking. |
| 22 | **Track Accounts Payable — Pay Vendors** | Accounting | Not Started | PM's own obligation to pay its suppliers, per terms. Not present in the original 17-step list at all — surfaced because Accounting's real function list includes "Vendor payments." |

---

## Data model gaps identified during this review (not yet in schema)

1. **Inventory** — `inventory_items` (or similar): location (Houston/Lakeland/UK), static item number for standard stock, quantity on hand. Drives the in-stock shortcut branch.
2. **Credit terms / risk rating** — on both `suppliers` and `accounts` — needed to decide when advance payment is required in either direction.
3. **Proforma invoices** — a document type distinct from the final commercial invoice, usable both to request vendor advance payment and to request customer advance payment.
4. **Accounts Payable / Accounts Receivable tracking** — actual payment status/ledger, not just invoice generation. See `phase4-sourcing-lifecycle.md`'s "Future: Cost reconciliation and job-locking financial controls" for the vendor-invoice-vs-quoted-cost reconciliation and job-locking rules this needs to be designed with from the start.
5. **QA/ISO checklist table** — structured, checkable records (not free-text log entries) tied to `orders`, to support ISO 9001 audit trail.
6. **Vendor quote revalidation** — a workflow (and likely a status field) around `supplier_quotes.valid_until` lapsing before PO placement.

## Confidentiality rule (applies throughout)

Customers must never be identifiable to suppliers, and vice versa. This is structural, not UI-based: `rfq_attachments` (customer-facing, internal-only) and `supplier_inquiry_attachments` (supplier-facing) are separate tables that are never auto-derived from one another, and query functions like `getInquiryForPrint` never fetch customer fields at all. Any new document type (proforma invoices, PO documents, QA checklists) must follow the same pattern — verified by tests, not just by hiding fields in the UI.

---
*SANDBOX — TEST DATA. This document describes intended real-world process; the running system contains fictional data only.*
