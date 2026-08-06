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
//
// unitPrices is one native-currency price per line item position (index
// matches the RFQ's own line item order), hand-picked against the real
// currency_rates + FX_MARGIN_PCT so the resulting USD cost tells a
// deliberate story rather than an accidental one:
//   - Barrow & Delta Ridge: the SELECTED vendor on each line lands at a
//     realistic ~17-21% margin once converted.
//   - Gulfstream: the deliberate exception. The selected vendor (Rhein) was
//     chosen for speed/in-stock availability, not price — it comes out at a
//     genuine -17% to -25% margin per line, while the non-selected
//     comparison vendor (Ferro) would have been cheaper but slower
//     (Make to Order, 28 days). That's a real "paid extra for speed"
//     tradeoff, not a bug — margin should surface bad deals, not hide them.
// Prices for non-selected/comparison-only vendors don't need margin tuning,
// just plausible numbers for the comparison table.
const SUPPLIER_SCENARIOS_BY_RFQ_INDEX = {
  1: [
    { supplierIndex: 0, outreachStatus: "Quoted", availability: "Make to Order", leadTimeDays: 35, unitPrices: [550, 780, 1300], currency: "CNY", estimatedTransitDays: 30 },
    {
      supplierIndex: 3,
      outreachStatus: "Quoted",
      availability: "In Stock",
      leadTimeDays: 12,
      unitPrices: [76, 105, 128],
      currency: "EUR",
      estimatedTransitDays: 7,
      notes: [
        "Ex-works packaging included",
        "Mill certs available on request",
        "Priority slot — can expedite for +5% surcharge",
      ],
    },
    { supplierIndex: 2, outreachStatus: "Declined" },
  ],
  2: [
    { supplierIndex: 1, outreachStatus: "Quoted", availability: "In Stock", leadTimeDays: 18, unitPrices: [76, 102], currency: "EUR", estimatedTransitDays: 7 },
    { supplierIndex: 0, outreachStatus: "Quoted", availability: "Make to Order", leadTimeDays: 40, unitPrices: [500, 700], currency: "CNY", estimatedTransitDays: 30 },
    { supplierIndex: 2, outreachStatus: "Expired" },
  ],
  3: [
    { supplierIndex: 3, outreachStatus: "Quoted", availability: "In Stock", leadTimeDays: 15, unitPrices: [115, 150, 188], currency: "EUR", estimatedTransitDays: 7 },
    {
      supplierIndex: 1,
      outreachStatus: "Quoted",
      availability: "Make to Order",
      leadTimeDays: 28,
      unitPrices: [95, 130, 165],
      currency: "EUR",
      estimatedTransitDays: 7,
      notes: [
        "Make-to-order — 28 day lead confirmed with mill",
        "Same production batch as line 1",
        "Standard crating",
      ],
    },
    { supplierIndex: 0, outreachStatus: "Declined" },
  ],
};

// Which vendor (by supplierIndex) fulfills each line item, by position, for
// the RFQs above. Barrow (index 1) is split across two vendors — 2 of its 3
// lines from Rhein, 1 from Shanghai — to demonstrate mixed sourcing on a
// single deal. Delta Ridge stays single-vendor for contrast. Gulfstream is
// also single-vendor, but is the deliberate thin/negative-margin example
// (see unitPrices comment above).
const LINE_ITEM_SOURCING_BY_RFQ_INDEX = {
  1: [3, 0, 3],
  2: [1, 1],
  3: [3, 3, 3],
};

module.exports = { SUPPLIERS, SUPPLIER_SCENARIOS_BY_RFQ_INDEX, LINE_ITEM_SOURCING_BY_RFQ_INDEX };
