// src/routes/quoteIntake.js
// "Offer to Customer": turns the sourcing decisions already made (selected
// vendor per line item, selected freight quote) into a customer-facing
// quote. A still-Draft quote is edited in place (same form, detects the
// existing quote and prefills it). Once a quote has been sent
// (Sent/Accepted/Rejected), editing it instead creates a new version —
// see createQuoteVersion in quoteBuildQueries.js and the state-machine
// notes on the quotes table in schema.js. Editing is blocked entirely
// once an Order already exists for this RFQ: the order/PO total is fixed
// to whichever quote version was active at conversion time, and nothing
// propagates a later quote edit into it, so allowing further revisions
// past that point would be misleading rather than useful.

const express = require("express");
const { getDb } = require("../db/connection");
const { getRfqById, getLatestQuote, getQuoteLineItems } = require("../db/rfqQueries");
const { addDays } = require("../db/orderSummary");
const { getLineCostsForRfq } = require("../db/lineItemCostQueries");
const {
  buildLineItemDisplayRows,
  buildTotals,
  suggestSellPrice,
  buildFreightLineTotal,
  buildFreightLineItem,
  buildLandedPrintLineItems,
  FREIGHT_LINE_ITEM_CODE,
} = require("../db/marginCalc");
const { createQuote, updateDraftQuote, markQuoteAsSent, createQuoteVersion } = require("../db/quoteBuildQueries");
const { getOrderForRfq } = require("../db/orderQueries");
const {
  getQuoteForPrint,
  getQuoteLineItemsForPrint,
  getQuoteShipmentSizeLineItemsForPrint,
} = require("../db/quotePrintQueries");
const { buildShipmentSizeEstimate } = require("../db/shipmentSizeCalc");
const { quoteNewFormPage } = require("../views/quoteNewForm");
const { quotePrintPage } = require("../views/quotePrintPage");

const router = express.Router();

// The Sell Price fields submit as "sell_price[li<rfqLineItemId>]" — see
// quoteNewForm.js for why the "li" prefix is there (it stops express's
// body parser from silently reinterpreting the bracket group as a
// position-indexed array once every key in it looks like a plain number).
// Strip it back off here so the rest of this route can key by plain
// rfq_line_item_id, same as every other sellPriceFormValues consumer.
function normalizeSellPriceFields(rawSellPrice) {
  const normalized = {};
  Object.entries(rawSellPrice || {}).forEach(([key, value]) => {
    normalized[key.replace(/^li/, "")] = value;
  });
  return normalized;
}

function loadContext(db, rfqId) {
  const rfq = getRfqById(db, rfqId);
  if (!rfq) return null;
  const { allLineItems, lineCosts } = getLineCostsForRfq(db, rfqId);
  return { rfq, allLineItems, lineCosts };
}

router.get("/:id/quote/new", (req, res) => {
  const db = getDb();
  const context = loadContext(db, req.params.id);
  if (!context) {
    return res.status(404).send("RFQ not found");
  }

  if (getOrderForRfq(db, context.rfq.id)) {
    return res.redirect(`/rfqs/${context.rfq.id}`);
  }

  const existingQuote = getLatestQuote(db, context.rfq.id);
  const mode = !existingQuote ? "create" : existingQuote.status === "Draft" ? "editDraft" : "revise";

  const existingLines = existingQuote ? getQuoteLineItems(db, existingQuote.id) : [];
  const existingSellByLineItemId = new Map(existingLines.map((l) => [l.rfq_line_item_id, l.unit_price_usd]));

  // Sourced lines with no existing quote get a suggested sell price (item
  // cost marked up alone — freight carries its own markup on its own
  // aggregated line below, never folded into an item's price) — a
  // starting point, not a decision; fully overridable.
  const sellPriceFormValues = {};
  context.allLineItems.forEach((li) => {
    if (li.supplier_id == null) return;
    const existingSell = existingSellByLineItemId.get(li.rfq_line_item_id);
    if (existingSell != null) {
      sellPriceFormValues[li.rfq_line_item_id] = String(existingSell);
      return;
    }
    const costs = context.lineCosts.get(li.rfq_line_item_id);
    const suggested = costs ? suggestSellPrice(costs.buyUnitPriceUsd, null) : null;
    if (suggested != null) {
      sellPriceFormValues[li.rfq_line_item_id] = suggested.toFixed(2);
    }
  });

  // Same suggested-vs-saved rule as every item line: an existing quote's
  // saved freight_sell_price_usd wins; otherwise default to the freight
  // buy total marked up at the same FREIGHT_MARKUP_PCT (suggestSellPrice
  // with buy=0 applies only the freight markup, nothing else).
  const freightBuyTotal = buildFreightLineTotal(context.allLineItems, context.lineCosts);
  const freightSellRaw =
    existingQuote && existingQuote.freight_sell_price_usd != null
      ? String(existingQuote.freight_sell_price_usd)
      : suggestSellPrice(0, freightBuyTotal).toFixed(2);
  const freightRow = buildFreightLineItem(context.allLineItems, context.lineCosts, freightSellRaw);

  const displayRows = buildLineItemDisplayRows(context.allLineItems, context.lineCosts, sellPriceFormValues);
  const totals = buildTotals([...displayRows, freightRow]);

  const defaultValidUntil = existingQuote
    ? existingQuote.valid_until
    : addDays(new Date().toISOString().slice(0, 10), 30);

  res.send(
    quoteNewFormPage({
      rfq: context.rfq,
      mode,
      displayRows,
      freightRow,
      totals,
      formValues: {
        valid_until: defaultValidUntil,
        promised_delivery_date: existingQuote ? existingQuote.promised_delivery_date || "" : "",
        freight_display_mode: existingQuote ? existingQuote.freight_display_mode : "separate",
      },
      errors: [],
    })
  );
});

router.post("/:id/quote/new", (req, res) => {
  const db = getDb();
  const context = loadContext(db, req.params.id);
  if (!context) {
    return res.status(404).send("RFQ not found");
  }

  if (getOrderForRfq(db, context.rfq.id)) {
    return res.redirect(`/rfqs/${context.rfq.id}`);
  }

  const existingQuote = getLatestQuote(db, context.rfq.id);
  const mode = !existingQuote ? "create" : existingQuote.status === "Draft" ? "editDraft" : "revise";

  const validUntil = req.body.valid_until;
  const promisedDeliveryDate = req.body.promised_delivery_date || null;
  const sellPriceFormValues = normalizeSellPriceFields(req.body.sell_price);
  const freightSellRaw = req.body.freight_sell_price;
  const freightDisplayMode = req.body.freight_display_mode === "included" ? "included" : "separate";
  const confirmNegativeMargin = req.body.confirm_negative_margin === "on";

  const sourcedLineItemCount = context.allLineItems.filter((li) => li.supplier_id != null).length;

  const errors = [];
  if (!validUntil) errors.push("Enter a valid-until date.");
  if (sourcedLineItemCount === 0) {
    errors.push("No line items are sourced yet — select a vendor before creating a quote.");
  }

  const displayRows = buildLineItemDisplayRows(context.allLineItems, context.lineCosts, sellPriceFormValues);
  const freightRow = buildFreightLineItem(context.allLineItems, context.lineCosts, freightSellRaw);
  const allRows = [...displayRows, freightRow];

  allRows.forEach((row) => {
    if (row.sourced && row.sellUnitPriceUsd == null) {
      errors.push(`Enter a sell price for "${row.description}".`);
    }
  });

  const hasNegativeMargin = allRows.some((row) => row.sourced && row.marginUnitUsd != null && row.marginUnitUsd < 0);
  if (errors.length === 0 && hasNegativeMargin && !confirmNegativeMargin) {
    errors.push("One or more lines have a negative margin — check the confirmation box below to save anyway.");
  }

  if (errors.length > 0) {
    const totals = buildTotals(allRows);
    return res.status(400).send(
      quoteNewFormPage({
        rfq: context.rfq,
        mode,
        displayRows,
        freightRow,
        totals,
        formValues: {
          valid_until: validUntil,
          promised_delivery_date: promisedDeliveryDate,
          freight_display_mode: freightDisplayMode,
          confirm_negative_margin: confirmNegativeMargin,
        },
        errors,
        hasNegativeMargin,
      })
    );
  }

  const lines = displayRows
    .filter((row) => row.sourced)
    .map((row) => {
      const sourcedRow = context.allLineItems.find((li) => li.rfq_line_item_id === row.rfqLineItemId);
      return {
        rfqLineItemId: row.rfqLineItemId,
        sellUnitPriceUsd: row.sellUnitPriceUsd,
        leadTimeDays: sourcedRow.lead_time_days,
        targetMarginPct: row.marginPct == null ? 0 : row.marginPct,
      };
    });
  const freightSellPriceUsd = freightRow.sellUnitPriceUsd;

  if (mode === "create") {
    createQuote(db, { rfqId: context.rfq.id, validUntil, promisedDeliveryDate, freightSellPriceUsd, freightDisplayMode, lines });
  } else if (mode === "editDraft") {
    updateDraftQuote(db, { quoteId: existingQuote.id, validUntil, promisedDeliveryDate, freightSellPriceUsd, freightDisplayMode, lines });
  } else {
    createQuoteVersion(db, { quoteId: existingQuote.id, validUntil, promisedDeliveryDate, freightSellPriceUsd, freightDisplayMode, lines });
  }

  res.redirect(`/rfqs/${context.rfq.id}`);
});

router.post("/:id/quote/mark-sent", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);
  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const quote = getLatestQuote(db, rfq.id);
  if (quote && quote.status === "Draft") {
    markQuoteAsSent(db, quote.id);
  }

  res.redirect(`/rfqs/${rfq.id}`);
});

// Customer-facing print document — deliberately built from the narrow
// getQuoteForPrint/getQuoteLineItemsForPrint/getQuoteShipmentSizeLineItemsForPrint
// queries (quotePrintQueries.js), never from loadContext/getLineCostsForRfq
// above, so buy price and margin are never fetched into this route at all,
// not just left out of what gets rendered. Scoped to a specific version
// (:quoteId) rather than always "whatever's latest" — every version,
// current or superseded, prints its own document for negotiation
// traceability (see the Quote History list on the RFQ detail page).
// Renders in whichever freight_display_mode that version was actually
// saved/sent in — a real, deliberate part of the sent quote now, not a
// live viewing toggle, so the print doc has to match it rather than
// always forcing "separate" the way it used to.
router.get("/:id/quote/:quoteId/print", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);
  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const quote = getQuoteForPrint(db, req.params.quoteId);
  if (!quote || quote.rfq_id !== rfq.id) {
    return res.status(404).send("Quote not found");
  }

  const rawLineItems = getQuoteLineItemsForPrint(db, quote.id);
  const shipmentSizeLineItems = getQuoteShipmentSizeLineItemsForPrint(db, rfq.id);

  let lineItems;
  let freightLine = null;

  if (quote.freight_display_mode === "included" && quote.freight_sell_price_usd != null) {
    // Folded into each item — weight-only allocation (see
    // buildLandedPrintLineItems for why this can't reuse the live
    // screen's cost-based ratio). No separate Freight row at all.
    const weightByLineItemId = new Map(shipmentSizeLineItems.map((li) => [li.rfq_line_item_id, li.weight_kg]));
    lineItems = buildLandedPrintLineItems(rawLineItems, quote.freight_sell_price_usd, weightByLineItemId).map((li) => ({
      ...li,
      totalSellUsd: li.sell_unit_price_usd * li.quantity,
    }));
  } else {
    lineItems = rawLineItems.map((li) => ({ ...li, totalSellUsd: li.sell_unit_price_usd * li.quantity }));
    // Same "only shows if actually saved" rule as an item line — a quote
    // created before the Freight line existed has no freight_sell_price_usd
    // yet, so nothing renders here for it rather than a misleading blank row.
    freightLine =
      quote.freight_sell_price_usd == null
        ? null
        : {
            description: `Freight (${FREIGHT_LINE_ITEM_CODE})`,
            quantity: 1,
            unit: "Shipment",
            sell_unit_price_usd: quote.freight_sell_price_usd,
            totalSellUsd: quote.freight_sell_price_usd,
          };
  }

  const grandTotalUsd =
    lineItems.reduce((sum, li) => sum + li.totalSellUsd, 0) + (freightLine ? freightLine.totalSellUsd : 0);

  const shipmentSizeEstimate = buildShipmentSizeEstimate(shipmentSizeLineItems);

  res.send(quotePrintPage({ quote, lineItems, freightLine, grandTotalUsd, shipmentSizeEstimate }));
});

module.exports = router;
