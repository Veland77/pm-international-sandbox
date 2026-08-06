// src/db/freightQuoteSelectionQueries.js
// Reads and writes behind the "Compare Freight Quotes & Select Winner"
// screen. One freight_inquiry always covers exactly one vendor's pickup
// location (see freightInquiryGrouping.js), but comparing forwarders means
// looking across every SIBLING freight_inquiry on the same RFQ that covers
// that same vendor — one inquiry = one forwarder, so multiple forwarders
// show up as multiple inquiries, not multiple rows within one. Selecting a
// quote never deletes a prior choice: the old freight_quote_selection row
// flips to 'Rejected' and a new 'Selected' row is inserted, same pattern
// as line_item_sourcing.

const { toUsd } = require("./orderSummary");

// Derives which vendor a freight_inquiry covers via any one of its line
// items' Selected sourcing — they all resolve to the same vendor by
// construction, so LIMIT 1 is safe here.
const FREIGHT_INQUIRY_FOR_COMPARE_QUERY = `
  SELECT fi.id, fi.rfq_id, fi.frq_number,
         supplr.id AS supplier_id, supplr.name AS supplier_name
  FROM freight_inquiries fi
  JOIN freight_inquiry_line_items fil ON fil.freight_inquiry_id = fi.id
  JOIN line_item_sourcing lis ON lis.rfq_line_item_id = fil.rfq_line_item_id AND lis.status = 'Selected'
  JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  JOIN suppliers supplr ON supplr.id = si.supplier_id
  WHERE fi.id = ?
  LIMIT 1
`;

// Every quote received against any freight_inquiry on this RFQ that covers
// this same vendor — the actual comparison set. GROUP BY fq.id collapses
// the fan-out from a freight_inquiry covering multiple line items back down
// to one row per quote.
const FREIGHT_QUOTES_FOR_PICKUP_LOCATION_QUERY = `
  SELECT fq.id AS freight_quote_id, fq.quote_ref, fq.price, fq.currency,
         fq.transit_days, fq.valid_until, fq.notes,
         ff.name AS freight_forwarder_name, ff.country AS freight_forwarder_country,
         fi.frq_number,
         CASE WHEN fqs.id IS NOT NULL THEN 1 ELSE 0 END AS is_selected
  FROM freight_quotes fq
  JOIN freight_inquiries fi ON fi.id = fq.freight_inquiry_id
  JOIN freight_forwarders ff ON ff.id = fi.freight_forwarder_id
  JOIN freight_inquiry_line_items fil ON fil.freight_inquiry_id = fi.id
  JOIN line_item_sourcing lis ON lis.rfq_line_item_id = fil.rfq_line_item_id AND lis.status = 'Selected'
  JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  LEFT JOIN freight_quote_selection fqs
    ON fqs.freight_quote_id = fq.id AND fqs.status = 'Selected'
  WHERE fi.rfq_id = ? AND si.supplier_id = ?
  GROUP BY fq.id
`;

// The current winner (if any) for every vendor pickup location on an RFQ —
// used by the RFQ detail page to show "Selected Forwarder" / "Selected
// Price" per freight inquiry row without a separate lookup per row.
const SELECTED_FREIGHT_QUOTES_FOR_RFQ_QUERY = `
  SELECT fqs.supplier_id, fq.price, fq.currency, ff.name AS freight_forwarder_name
  FROM freight_quote_selection fqs
  JOIN freight_quotes fq ON fq.id = fqs.freight_quote_id
  JOIN freight_inquiries fi ON fi.id = fq.freight_inquiry_id
  JOIN freight_forwarders ff ON ff.id = fi.freight_forwarder_id
  WHERE fqs.rfq_id = ? AND fqs.status = 'Selected'
`;

function getFreightInquiryForCompare(db, freightInquiryId) {
  return db.prepare(FREIGHT_INQUIRY_FOR_COMPARE_QUERY).get(freightInquiryId);
}

function getFreightQuotesForPickupLocation(db, { rfqId, supplierId }) {
  return db.prepare(FREIGHT_QUOTES_FOR_PICKUP_LOCATION_QUERY).all(rfqId, supplierId);
}

function getSelectedFreightQuotesForRfq(db, rfqId) {
  return db.prepare(SELECTED_FREIGHT_QUOTES_FOR_RFQ_QUERY).all(rfqId);
}

// Pure — attaches a USD-converted price to each quote and sorts ascending,
// so quotes in different currencies are genuinely comparable. A quote in a
// currency with no known rate sorts last rather than crashing or being
// dropped. No DB access, so this is directly unit-testable.
//
// quotes: rows from getFreightQuotesForPickupLocation (price, currency, ...)
// rates: rows from getCurrencyRates ({ currency_code, rate_to_usd })
function sortQuotesByUsdPrice(quotes, rates) {
  const rateMap = new Map(rates.map((r) => [r.currency_code, r.rate_to_usd]));

  return quotes
    .map((q) => ({ ...q, usdPrice: toUsd(q.price, q.currency, rateMap) }))
    .sort((a, b) => {
      if (a.usdPrice == null) return 1;
      if (b.usdPrice == null) return -1;
      return a.usdPrice - b.usdPrice;
    });
}

function selectFreightQuote(db, { rfqId, supplierId, freightQuoteId }) {
  const rejectPriorSelection = db.prepare(
    "UPDATE freight_quote_selection SET status = 'Rejected' WHERE rfq_id = ? AND supplier_id = ? AND status = 'Selected'"
  );
  const insertSelection = db.prepare(`
    INSERT INTO freight_quote_selection (rfq_id, supplier_id, freight_quote_id, selected_date, status)
    VALUES (?, ?, ?, ?, 'Selected')
  `);

  const run = db.transaction(() => {
    rejectPriorSelection.run(rfqId, supplierId);
    const selectedDate = new Date().toISOString().slice(0, 10);
    insertSelection.run(rfqId, supplierId, freightQuoteId, selectedDate);
  });

  run();
}

module.exports = {
  getFreightInquiryForCompare,
  getFreightQuotesForPickupLocation,
  getSelectedFreightQuotesForRfq,
  sortQuotesByUsdPrice,
  selectFreightQuote,
};
