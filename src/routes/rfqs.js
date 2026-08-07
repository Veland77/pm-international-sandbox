// src/routes/rfqs.js
// RFQ list and detail pages.

const express = require("express");
const { getDb } = require("../db/connection");
const {
  listRfqs,
  getRfqById,
  getLineItems,
  getLatestQuote,
  getQuoteVersionsForRfq,
  getQuoteLineItems,
  getSupplierComparison,
  getCurrencyRates,
  getSupplierInquiriesForRfq,
  getFreightInquiriesForRfq,
} = require("../db/rfqQueries");
const { estimateArrivalDate, toUsd } = require("../db/orderSummary");
const { getLineCostsForRfq } = require("../db/lineItemCostQueries");
const { buildShipmentSizeEstimate } = require("../db/shipmentSizeCalc");
const { buildLineItemDisplayRows, buildTotals, buildFreightLineItem } = require("../db/marginCalc");
const { getRfqAttachments } = require("../db/rfqAttachmentQueries");
const { getCustomerFacingAttachments } = require("../db/customerFacingAttachmentQueries");
const { getSupplierInquiryAttachments } = require("../db/supplierInquiryAttachmentQueries");
const { getOrderForRfq, getShipmentsForOrder } = require("../db/orderQueries");
const { getSelectedFreightQuotesForRfq } = require("../db/freightQuoteSelectionQueries");
const { rfqListPage } = require("../views/rfqList");
const { rfqDetailPage } = require("../views/rfqDetail");

const router = express.Router();

router.get("/", (req, res) => {
  const db = getDb();
  res.send(rfqListPage(listRfqs(db)));
});

router.get("/:id", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);

  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const lineItems = getLineItems(db, rfq.id);
  const quote = getLatestQuote(db, rfq.id);
  const quoteLineItems = quote ? getQuoteLineItems(db, quote.id) : [];
  const rawSupplierComparison = getSupplierComparison(db, rfq.id);

  // One shared calc for every buy/sell/margin number on this page — the
  // Order Summary card, the Line Items table, and the Quote section all
  // read from the same displayRows/totals, so there's exactly one margin
  // per line item, not different versions disagreeing with each other.
  // Freight is never part of that per-item margin — it's its own
  // aggregated line (freightRow), folded into totals alongside the items.
  const { allLineItems, lineCosts } = getLineCostsForRfq(db, rfq.id);
  const anySourced = allLineItems.some((li) => li.supplier_id != null);
  const sellPriceFormValues = {};
  quoteLineItems.forEach((qli) => {
    sellPriceFormValues[qli.rfq_line_item_id] = String(qli.unit_price_usd);
  });
  const displayRows = buildLineItemDisplayRows(allLineItems, lineCosts, sellPriceFormValues);
  const freightSellRaw = quote && quote.freight_sell_price_usd != null ? String(quote.freight_sell_price_usd) : "";
  const freightRow = buildFreightLineItem(allLineItems, lineCosts, freightSellRaw);
  const totals = buildTotals([...displayRows, freightRow]);
  const estimatedArrivalDate = estimateArrivalDate(allLineItems);
  const shipmentSizeEstimate = buildShipmentSizeEstimate(allLineItems);
  const displayRowsByLineItemId = new Map(displayRows.map((row) => [row.rfqLineItemId, row]));

  // The Quote section's own composition (never the Line Items table or
  // Order Summary above, which always stay in the default, freight-
  // exclusive shape) — the sales rep's choice, saved on the quote itself
  // at create/revise time (see schema.js), not a live viewing toggle
  // anymore. In "included" mode, each line's landed_sell_price_usd is the
  // exact combined number the sales rep typed and saved — read directly,
  // never recomputed/folded here — with margin checked against buy +
  // that line's own freight cost (marginIncludesFreight) so it isn't
  // inflated by the freight this price already covers.
  const freightDisplayMode = quote ? quote.freight_display_mode : "separate";
  let quoteDisplayRows = displayRows;
  if (freightDisplayMode === "included") {
    const landedSellPriceFormValues = {};
    quoteLineItems.forEach((qli) => {
      if (qli.landed_sell_price_usd != null) {
        landedSellPriceFormValues[qli.rfq_line_item_id] = String(qli.landed_sell_price_usd);
      }
    });
    quoteDisplayRows = buildLineItemDisplayRows(allLineItems, lineCosts, landedSellPriceFormValues, {
      marginIncludesFreight: true,
    });
  }

  const rates = getCurrencyRates(db);
  const rateMap = new Map(rates.map((r) => [r.currency_code, r.rate_to_usd]));

  // Match each Supplier Comparison row to a per-line freight cost only
  // when it's the EXACT vendor-quote-line actually selected for that
  // line — not just any row for a vendor that happens to be sourced
  // elsewhere on the RFQ. Every other (non-winning) row structurally can
  // never have a freight quote against it, since freight inquiries only
  // ever get created for the already-selected vendor.
  const winningSupplierQuoteLineItemIdByRfqLineItemId = new Map(
    allLineItems
      .filter((li) => li.supplier_quote_line_item_id != null)
      .map((li) => [li.rfq_line_item_id, li.supplier_quote_line_item_id])
  );
  const supplierComparison = rawSupplierComparison.map((row) => {
    const isWinningVendorLine =
      row.supplier_quote_line_item_id != null &&
      winningSupplierQuoteLineItemIdByRfqLineItemId.get(row.rfq_line_item_id) === row.supplier_quote_line_item_id;
    const displayRow = isWinningVendorLine ? displayRowsByLineItemId.get(row.rfq_line_item_id) : null;
    return {
      ...row,
      freightUnitUsd: displayRow ? displayRow.freightUnitUsd : null,
      unitPriceUsd: row.unit_price == null ? null : toUsd(row.unit_price, row.currency, rateMap),
    };
  });

  const rfqAttachments = getRfqAttachments(db, rfq.id);
  const customerFacingAttachments = getCustomerFacingAttachments(db, rfq.id);
  const supplierInquiries = getSupplierInquiriesForRfq(db, rfq.id);
  const supplierInquiryAttachmentsByInquiryId = new Map(
    supplierInquiries.map((inquiry) => [inquiry.id, getSupplierInquiryAttachments(db, inquiry.id)])
  );

  const freightInquiries = getFreightInquiriesForRfq(db, rfq.id);
  const selectedFreightBySupplierId = new Map(
    getSelectedFreightQuotesForRfq(db, rfq.id).map((q) => [
      q.supplier_id,
      { freightForwarderName: q.freight_forwarder_name, usdPrice: toUsd(q.price, q.currency, rateMap) },
    ])
  );

  const order = getOrderForRfq(db, rfq.id);
  const shipments = order ? getShipmentsForOrder(db, order.id) : [];

  // Every version but the current/latest one (already covered by `quote`
  // above) — always 'Superseded', shown as the Quote History list. Each
  // gets its own line items fetched for the sell-price-only history table.
  const quoteHistory = getQuoteVersionsForRfq(db, rfq.id)
    .slice(1)
    .map((v) => ({ ...v, lines: getQuoteLineItems(db, v.id) }));

  res.send(
    rfqDetailPage({
      rfq,
      lineItems,
      quote,
      displayRows,
      quoteDisplayRows,
      freightRow,
      freightDisplayMode,
      totals,
      anySourced,
      estimatedArrivalDate,
      shipmentSizeEstimate,
      supplierComparison,
      quoteHistory,
      rfqAttachments,
      customerFacingAttachments,
      supplierInquiries,
      supplierInquiryAttachmentsByInquiryId,
      freightInquiries,
      selectedFreightBySupplierId,
      order,
      shipments,
    })
  );
});

module.exports = router;
