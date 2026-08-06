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
const { buildLineItemDisplayRows, buildTotals, suggestSellPrice } = require("../db/marginCalc");
const { createQuote, updateDraftQuote, markQuoteAsSent } = require("../db/quoteBuildQueries");
const { quoteNewFormPage } = require("../views/quoteNewForm");

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
  // cost and freight cost marked up separately, then summed) — a starting
  // point, not a decision; fully overridable.
  const sellPriceFormValues = {};
  context.allLineItems.forEach((li) => {
    if (li.supplier_id == null) return;
    const existingSell = existingSellByLineItemId.get(li.rfq_line_item_id);
    if (existingSell != null) {
      sellPriceFormValues[li.rfq_line_item_id] = String(existingSell);
      return;
    }
    const costs = context.lineCosts.get(li.rfq_line_item_id);
    const suggested = costs ? suggestSellPrice(costs.buyUnitPriceUsd, costs.freightUnitUsd) : null;
    if (suggested != null) {
      sellPriceFormValues[li.rfq_line_item_id] = suggested.toFixed(2);
    }
  });

  const displayRows = buildLineItemDisplayRows(context.allLineItems, context.lineCosts, sellPriceFormValues);
  const totals = buildTotals(displayRows);

  const defaultValidUntil = existingQuote
    ? existingQuote.valid_until
    : addDays(new Date().toISOString().slice(0, 10), 30);

  res.send(
    quoteNewFormPage({
      rfq: context.rfq,
      isEditing: !!existingQuote,
      displayRows,
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
  const confirmNegativeMargin = req.body.confirm_negative_margin === "on";

  const sourcedLineItemCount = context.allLineItems.filter((li) => li.supplier_id != null).length;

  const errors = [];
  if (!validUntil) errors.push("Enter a valid-until date.");
  if (sourcedLineItemCount === 0) {
    errors.push("No line items are sourced yet — select a vendor before creating a quote.");
  }

  const displayRows = buildLineItemDisplayRows(context.allLineItems, context.lineCosts, sellPriceFormValues);

  displayRows.forEach((row) => {
    if (row.sourced && row.sellUnitPriceUsd == null) {
      errors.push(`Enter a sell price for "${row.description}".`);
    }
  });

  const hasNegativeMargin = displayRows.some(
    (row) => row.sourced && row.marginUnitUsd != null && row.marginUnitUsd < 0
  );
  if (errors.length === 0 && hasNegativeMargin && !confirmNegativeMargin) {
    errors.push("One or more lines have a negative margin — check the confirmation box below to save anyway.");
  }

  if (errors.length > 0) {
    const totals = buildTotals(displayRows);
    return res.status(400).send(
      quoteNewFormPage({
        rfq: context.rfq,
        isEditing: !!existingQuote,
        displayRows,
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

  if (existingQuote) {
    updateDraftQuote(db, { quoteId: existingQuote.id, validUntil, promisedDeliveryDate, lines });
  } else {
    createQuote(db, { rfqId: context.rfq.id, validUntil, promisedDeliveryDate, lines });
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

module.exports = router;
