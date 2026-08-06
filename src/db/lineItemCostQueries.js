// src/db/lineItemCostQueries.js
// Shared reads behind every buy/freight/sell/margin display on the RFQ
// page (Order Summary, Line Items table, Quote section) and the freight
// column on Supplier Comparison. One query for "every line item plus its
// sourcing," one for "freight coverage scoped to the specific selected
// quote's own shipment" — composed with marginCalc.js's pure functions so
// nothing computes margin its own way.

const { getCurrencyRates } = require("./rfqQueries");
const { toSourcedLineItems, buildLineCosts } = require("./marginCalc");

// Every line item on the RFQ, sourced or not — supplier_id/supplier_name
// are null for a line with no Selected vendor yet, which is how every
// margin display tells sourced apart from unsourced. weight_kg,
// dimensions, lead_time_days, received_date, estimated_transit_days all
// come from the selected vendor's own quote line, same source the Freight
// Inquiry and Expediting screens already use — dimensions is a vendor-
// supplied free-text box size (e.g. "120 x 15 x 15 cm"), not structured
// numeric fields, so it's only ever displayed as-is, never computed with.
// supplier_quote_line_item_id identifies exactly which vendor-quote-line
// was selected, so Supplier Comparison rows can be matched against it
// precisely.
const RFQ_LINE_ITEMS_WITH_SOURCING_QUERY = `
  SELECT li.id AS rfq_line_item_id, li.description, li.quantity, li.unit,
         s.id AS supplier_id, s.name AS supplier_name,
         sqli.id AS supplier_quote_line_item_id,
         sqli.unit_price, sqli.currency, sqli.weight_kg, sqli.dimensions, sqli.lead_time_days,
         sq.received_date, sq.estimated_transit_days
  FROM rfq_line_items li
  LEFT JOIN line_item_sourcing lis ON lis.rfq_line_item_id = li.id AND lis.status = 'Selected'
  LEFT JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  LEFT JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  LEFT JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  LEFT JOIN suppliers s ON s.id = si.supplier_id
  WHERE li.rfq_id = ?
`;

// One row per (a vendor's Selected freight quote, a line item that
// quote's own freight_inquiry actually covers) — scoped to the specific
// quote's coverage, not the vendor's whole shipment, so a line outside
// that quote's freight_inquiry_line_items never dilutes its allocation.
const FREIGHT_COVERAGE_FOR_RFQ_QUERY = `
  SELECT fq.id AS freight_quote_id, fq.price, fq.currency, fil.rfq_line_item_id
  FROM freight_quote_selection fqs
  JOIN freight_quotes fq ON fq.id = fqs.freight_quote_id
  JOIN freight_inquiries fi ON fi.id = fq.freight_inquiry_id
  JOIN freight_inquiry_line_items fil ON fil.freight_inquiry_id = fi.id
  WHERE fqs.rfq_id = ? AND fqs.status = 'Selected'
`;

function getRfqLineItemsWithSourcing(db, rfqId) {
  return db.prepare(RFQ_LINE_ITEMS_WITH_SOURCING_QUERY).all(rfqId);
}

function getFreightCoverageForRfq(db, rfqId) {
  return db.prepare(FREIGHT_COVERAGE_FOR_RFQ_QUERY).all(rfqId);
}

// The one call every buy/freight display needs: line items plus their
// per-line buy price and allocated freight, ready for
// buildLineItemDisplayRows/buildTotals.
function getLineCostsForRfq(db, rfqId) {
  const allLineItems = getRfqLineItemsWithSourcing(db, rfqId);
  const sourcedLineItems = toSourcedLineItems(allLineItems);
  const freightCoverageRows = getFreightCoverageForRfq(db, rfqId);
  const rates = getCurrencyRates(db);
  const lineCosts = buildLineCosts(sourcedLineItems, freightCoverageRows, rates);

  return { allLineItems, lineCosts };
}

module.exports = { getRfqLineItemsWithSourcing, getFreightCoverageForRfq, getLineCostsForRfq };
