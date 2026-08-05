// seed/supplierFixtures.js
// Fictional vendor pool and per-RFQ sourcing scenarios used by seedSuppliers.js.
// No real supplier names, pricing, or sourcing data — everything here is invented.

const SUPPLIERS = [
  {
    name: "Shanghai Noble Alloys Co.",
    country: "China",
    region: "Asia Pacific",
    specialty: "Duplex & super duplex pipe and forgings",
  },
  {
    name: "Ferro Adriatica S.p.A.",
    country: "Italy",
    region: "Europe",
    specialty: "Flanges and fittings, EN/ASME dual-certified",
  },
  {
    name: "Hanul Precision Metals",
    country: "South Korea",
    region: "Asia Pacific",
    specialty: "Valves and fasteners",
  },
  {
    name: "Rhein Präzisionsrohre GmbH",
    country: "Germany",
    region: "Europe",
    specialty: "Seamless pipe & tubing, nickel alloys",
  },
];

// Keyed by the account/RFQ loop index in seed.js. Each scenario lists which
// suppliers were sent the RFQ and how they responded, so a handful of RFQs
// show a meaningful multi-vendor comparison (differing price, lead time,
// availability), not just a single quote.
const SUPPLIER_SCENARIOS_BY_RFQ_INDEX = {
  1: [
    { supplierIndex: 0, outreachStatus: "Quoted", availability: "Make to Order", leadTimeDays: 35, priceMultiplier: 0.82, currency: "CNY", estimatedTransitDays: 30 },
    { supplierIndex: 3, outreachStatus: "Quoted", availability: "In Stock", leadTimeDays: 12, priceMultiplier: 1.15, currency: "EUR", estimatedTransitDays: 7 },
    { supplierIndex: 2, outreachStatus: "Declined" },
  ],
  2: [
    { supplierIndex: 1, outreachStatus: "Quoted", availability: "In Stock", leadTimeDays: 18, priceMultiplier: 1.05, currency: "EUR", estimatedTransitDays: 7 },
    { supplierIndex: 0, outreachStatus: "Quoted", availability: "Make to Order", leadTimeDays: 40, priceMultiplier: 0.78, currency: "CNY", estimatedTransitDays: 30 },
    { supplierIndex: 2, outreachStatus: "Expired" },
  ],
  3: [
    { supplierIndex: 3, outreachStatus: "Quoted", availability: "In Stock", leadTimeDays: 15, priceMultiplier: 1.1, currency: "EUR", estimatedTransitDays: 7 },
    { supplierIndex: 1, outreachStatus: "Quoted", availability: "Make to Order", leadTimeDays: 28, priceMultiplier: 0.95, currency: "EUR", estimatedTransitDays: 7 },
    { supplierIndex: 0, outreachStatus: "Declined" },
  ],
};

// Which vendor (by supplierIndex) fulfills each line item, by position, for
// the RFQs above. Barrow (index 1) is split across two vendors — 2 of its 3
// lines from Rhein, 1 from Shanghai — to demonstrate mixed sourcing on a
// single deal. Delta Ridge and Gulfstream stay single-vendor for contrast.
const LINE_ITEM_SOURCING_BY_RFQ_INDEX = {
  1: [3, 0, 3],
  2: [1, 1],
  3: [3, 3, 3],
};

module.exports = { SUPPLIERS, SUPPLIER_SCENARIOS_BY_RFQ_INDEX, LINE_ITEM_SOURCING_BY_RFQ_INDEX };
