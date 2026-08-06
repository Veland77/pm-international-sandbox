// src/db/freightIntakeQueries.js
// Read/write helpers for creating Freight Inquiries ("FRQ") from an RFQ:
// pick which already-sourced line items need a freight quote, and a
// forwarder to send the request to. Only sourced line items are eligible
// — weight, dimensions, and lead time all come from the selected vendor's
// quote, so an unsourced line has nothing to request freight pricing
// against yet.

const { groupLineItemsByVendor } = require("./freightInquiryGrouping");

const SOURCED_LINE_ITEMS_QUERY = `
  SELECT li.id AS rfq_line_item_id, li.description, li.quantity, li.unit,
         s.id AS supplier_id, s.name AS supplier_name, s.country AS supplier_country
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

function getFreightForwardersList(db) {
  return db.prepare("SELECT id, name, country FROM freight_forwarders ORDER BY name").all();
}

// Same approach as inquiryIntakeQueries.js's getNextInquiryNumber: parse
// the highest existing trailing number and add one. Called once per group
// inside createFreightInquiries' transaction, so each subsequent call sees
// the previous group's freshly-inserted row and increments correctly.
function getNextFrqNumber(db) {
  const rows = db.prepare("SELECT frq_number FROM freight_inquiries").all();
  const maxN = rows.reduce((max, r) => {
    const match = /(\d+)$/.exec(r.frq_number);
    const n = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, n);
  }, 7000);
  return `FRQ-${maxN + 1}`;
}

// Creates one freight_inquiries row per distinct vendor among the given
// (already-sourced) line items — never a single request spanning multiple
// pickup locations. All resulting inquiries go to the same forwarder;
// only the pickup location differs between them. Returns one summary
// object per inquiry created.
function createFreightInquiries(db, { rfqId, freightForwarderId, sourcedLineItems }) {
  const insertInquiry = db.prepare(
    "INSERT INTO freight_inquiries (frq_number, rfq_id, freight_forwarder_id, sent_date, status) VALUES (?, ?, ?, ?, 'Sent')"
  );
  const insertLine = db.prepare(
    "INSERT INTO freight_inquiry_line_items (freight_inquiry_id, rfq_line_item_id) VALUES (?, ?)"
  );

  const run = db.transaction(() => {
    const sentDate = new Date().toISOString().slice(0, 10);
    const groups = groupLineItemsByVendor(sourcedLineItems);

    return groups.map((group) => {
      const frqNumber = getNextFrqNumber(db);
      const freightInquiryId = insertInquiry.run(frqNumber, rfqId, freightForwarderId, sentDate).lastInsertRowid;

      group.lineItems.forEach((li) => {
        insertLine.run(freightInquiryId, li.rfq_line_item_id);
      });

      return { freightInquiryId, frqNumber, supplierName: group.supplierName };
    });
  });

  return run();
}

module.exports = {
  getSourcedLineItemsForFreight,
  getFreightForwardersList,
  getNextFrqNumber,
  createFreightInquiries,
};
