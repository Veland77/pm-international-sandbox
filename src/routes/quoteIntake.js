// src/routes/quoteIntake.js
// "Offer to Customer": turns the sourcing decisions already made (selected
// vendor per line item, selected freight quote) into a customer-facing
// quote. One quote per RFQ for now — a Draft can be edited in place
// (same form, detects the existing Draft and prefills it) but creating a
// second quote once one exists is blocked; that's re-quoting/versioning,
// not built yet.

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
  FREIGHT_LINE_ITEM_CODE,
} = require("../db/marginCalc");
const { createQuote, updateDraftQuote, markQuoteAsSent } = require("../db/quoteBuildQueries");
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

  const existingQuote = getLatestQuote(db, context.rfq.id);
  if (existingQuote && existingQuote.status !== "Draft") {
    return res.redirect(`/rfqs/${context.rfq.id}`);
  }

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
      isEditing: !!existingQuote,
      displayRows,
      freightRow,
      totals,
      formValues: {
        valid_until: defaultValidUntil,
        promised_delivery_date: existingQuote ? existingQuote.promised_delivery_date || "" : "",
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

  const existingQuote = getLatestQuote(db, context.rfq.id);
  if (existingQuote && existingQuote.status !== "Draft") {
    return res.redirect(`/rfqs/${context.rfq.id}`);
  }

  const validUntil = req.body.valid_until;
  const promisedDeliveryDate = req.body.promised_delivery_date || null;
  const sellPriceFormValues = normalizeSellPriceFields(req.body.sell_price);
  const freightSellRaw = req.body.freight_sell_price;
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
        isEditing: !!existingQuote,
        displayRows,
        freightRow,
        totals,
        formValues: {
          valid_until: validUntil,
          promised_delivery_date: promisedDeliveryDate,
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

  if (existingQuote) {
    updateDraftQuote(db, { quoteId: existingQuote.id, validUntil, promisedDeliveryDate, freightSellPriceUsd, lines });
  } else {
    createQuote(db, { rfqId: context.rfq.id, validUntil, promisedDeliveryDate, freightSellPriceUsd, lines });
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
// not just left out of what gets rendered.
router.get("/:id/quote/print", (req, res) => {
  const db = getDb();
  const rfq = getRfqById(db, req.params.id);
  if (!rfq) {
    return res.status(404).send("RFQ not found");
  }

  const latestQuote = getLatestQuote(db, rfq.id);
  if (!latestQuote) {
    return res.status(404).send("No quote yet for this RFQ");
  }

  const quote = getQuoteForPrint(db, latestQuote.id);
  const lineItems = getQuoteLineItemsForPrint(db, latestQuote.id).map((li) => ({
    ...li,
    totalSellUsd: li.sell_unit_price_usd * li.quantity,
  }));

  // Always its own line on the printed document, regardless of whichever
  // freight view happens to be toggled on the live RFQ page — a document
  // being emailed out doesn't need to track that live-only display state,
  // and a single freight line is the more conventional format for an
  // external quote anyway. Same "only shows if actually saved" rule as
  // everywhere else this quote's freight line appears.
  const freightLine =
    quote.freight_sell_price_usd == null
      ? null
      : {
          description: `Freight (${FREIGHT_LINE_ITEM_CODE})`,
          quantity: 1,
          unit: "Shipment",
          sell_unit_price_usd: quote.freight_sell_price_usd,
          totalSellUsd: quote.freight_sell_price_usd,
        };

  const grandTotalUsd =
    lineItems.reduce((sum, li) => sum + li.totalSellUsd, 0) + (freightLine ? freightLine.totalSellUsd : 0);

  const shipmentSizeLineItems = getQuoteShipmentSizeLineItemsForPrint(db, rfq.id);
  const shipmentSizeEstimate = buildShipmentSizeEstimate(shipmentSizeLineItems);

  res.send(quotePrintPage({ quote, lineItems, freightLine, grandTotalUsd, shipmentSizeEstimate }));
});

module.exports = router;
