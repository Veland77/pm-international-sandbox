// src/db/freightIntakeQueries.js
// Read/write helpers for creating a new Freight Inquiry ("FRQ") from an
// RFQ: pick which already-sourced line items need a freight quote, and a
// forwarder to send the request to. Only sourced line items are eligible
// — weight, dimensions, and lead time all come from the selected vendor's
// quote, so an unsourced line has nothing to request freight pricing
// against yet.

const SOURCED_LINE_ITEMS_QUERY = `
  SELECT li.id AS rfq_line_item_id, li.description, li.quantity, li.unit,
         s.name AS supplier_name, s.country AS supplier_country
  FROM rfq_line_items li
  JOIN line_item_sourcing lis ON lis.rfq_line_item_id = li.id AND lis.status = 'Selected'
  JOIN supplier_quote_line_items sqli ON sqli.id = lis.supplier_quote_line_item_id
  JOIN supplier_quotes sq ON sq.id = sqli.supplier_quote_id
  JOIN supplier_inquiries si ON si.id = sq.supplier_inquiry_id
  JOIN suppliers s ON s.id = si.supplier_id
  WHERE li.rfq_id = ?
`;

function getSourcedLineItemsForFreight(db, rfqId) {
  return db.prepare(SOURCED_LINE_ITEMS_QUERY).all(rfqId);
}

// Same approach as inquiryIntakeQueries.js's getNextInquiryNumber: parse
// the highest existing trailing number and add one.
function getNextFrqNumber(db) {
  const rows = db.prepare("SELECT frq_number FROM freight_inquiries").all();
  const maxN = rows.reduce((max, r) => {
    const match = /(\d+)$/.exec(r.frq_number);
    const n = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, n);
  }, 7000);
  return `FRQ-${maxN + 1}`;
}

function createFreightInquiry(db, { rfqId, freightForwarderName, rfqLineItemIds }) {
  const insertInquiry = db.prepare(
    "INSERT INTO freight_inquiries (frq_number, rfq_id, freight_forwarder_name, sent_date, status) VALUES (?, ?, ?, ?, 'Sent')"
  );
  const insertLine = db.prepare(
    "INSERT INTO freight_inquiry_line_items (freight_inquiry_id, rfq_line_item_id) VALUES (?, ?)"
  );

  const run = db.transaction(() => {
    const frqNumber = getNextFrqNumber(db);
    const sentDate = new Date().toISOString().slice(0, 10);
    const freightInquiryId = insertInquiry.run(frqNumber, rfqId, freightForwarderName, sentDate).lastInsertRowid;

    rfqLineItemIds.forEach((rfqLineItemId) => {
      insertLine.run(freightInquiryId, rfqLineItemId);
    });

    return { freightInquiryId, frqNumber };
  });

  return run();
}

module.exports = { getSourcedLineItemsForFreight, getNextFrqNumber, createFreightInquiry };
