// seed/additionalJobFixtures.js
// Extra fictional jobs, additive to what seed.js already builds, so three
// specific actions each have several fresh examples ready to click through
// by hand: sending a Sourcing Inquiry, creating a Quote, and generating a
// vendor Purchase Order. No real PM data — same fictional pattern as the
// rest of seed/. Line items reference catalog entries by `key` (see
// catalogLineByKey in seed.js).

// --- Group 1: fresh RFQs, nothing sent to any vendor yet ---
// Ready for "New Sourcing Inquiry" to be clicked by hand.
const FRESH_RFQ_JOBS = [
  {
    accountName: "Harborline Fabrication Group",
    industry: "Marine",
    region: "US",
    accountStatus: "Active",
    contact: { name: "Trevor Lang", title: "Buyer", email: "t.lang@harborline-example.com", phone: "+1 555 010 0101" },
    projectSuffix: "Topside Piping Package",
    lines: [
      { key: "duplexPipe", quantity: 40 },
      { key: "ss316Forging", quantity: 8 },
    ],
  },
  {
    accountName: "Kestrel Energy Partners",
    industry: "Oil & Gas",
    region: "US",
    accountStatus: "Active",
    contact: { name: "Monica Reyes", title: "Procurement Lead", email: "m.reyes@kestrelenergy-example.com", phone: "+1 555 010 0102" },
    projectSuffix: "Wellhead Valve Package",
    lines: [
      { key: "molyValve", quantity: 15 },
      { key: "alloySteelPlate", quantity: 6 },
    ],
  },
  {
    accountName: "Solvik Offshore AS",
    industry: "Offshore",
    region: "Norway",
    accountStatus: "Active",
    contact: { name: "Ingrid Vaage", title: "Purchasing Manager", email: "i.vaage@solvikoffshore-example.com", phone: "+47 100 00103" },
    projectSuffix: "Riser Package",
    lines: [
      { key: "superDuplexFlange", quantity: 12 },
      { key: "nickelRoundBar", quantity: 20 },
      { key: "copperNickelTubing", quantity: 30 },
    ],
  },
  {
    accountName: "Ironclad Process Systems",
    industry: "Mining",
    region: "US",
    accountStatus: "Prospect",
    contact: { name: "Walt Dunmore", title: "Supply Chain Manager", email: "w.dunmore@ironcladprocess-example.com", phone: "+1 555 010 0104" },
    projectSuffix: "Slurry Handling Package",
    lines: [
      { key: "titaniumFasteners", quantity: 25 },
      { key: "ss316Forging", quantity: 10 },
    ],
  },
];

// --- Group 2: fully sourced (vendor + freight selected), no customer
// quote yet — same state as the Meridian job in seed.js, ready for
// repeated "Create Quote" practice. Single vendor per job, quoted on
// every line, all lines Selected.
const SOURCED_NO_QUOTE_JOBS = [
  {
    accountName: "Whitfield Marine Engineering",
    industry: "Marine",
    region: "US",
    accountStatus: "Active",
    contact: { name: "Marcus Yeoh", title: "Buyer", email: "m.yeoh@whitfieldmarine-example.com", phone: "+1 555 010 0201" },
    projectSuffix: "Deck Piping Package",
    lines: [
      { key: "duplexPipe", quantity: 50 },
      { key: "copperNickelTubing", quantity: 25 },
    ],
    supplierIndex: 0, // Shanghai Noble Alloys Co.
    unitPrices: [580, 210],
    currency: "CNY",
    leadTimeDays: 25,
    availability: "Make to Order",
    estimatedTransitDays: 28,
    freightForwarderName: "Pacific Rim Ocean Carriers",
    freightQuoteRef: "PRO-Q-3312",
    freightPrice: 610,
    freightCurrency: "USD",
    freightTransitDays: 22,
    freightNotes: "Ocean freight — Shanghai to Lakeland, standard transit",
  },
  {
    accountName: "Copperhead Resources Ltd",
    industry: "Mining",
    region: "US",
    accountStatus: "Active",
    contact: { name: "Renata Falk", title: "Supply Chain Manager", email: "r.falk@copperheadresources-example.com", phone: "+1 555 010 0202" },
    projectSuffix: "Process Piping Package",
    lines: [
      { key: "nickelRoundBar", quantity: 15 },
      { key: "superDuplexFlange", quantity: 10 },
    ],
    supplierIndex: 3, // Rhein Präzisionsrohre GmbH
    unitPrices: [340, 118],
    currency: "EUR",
    leadTimeDays: 20,
    availability: "In Stock",
    estimatedTransitDays: 9,
    freightForwarderName: "Rheinland Express Cargo",
    freightQuoteRef: "REC-Q-5540",
    freightPrice: 480,
    freightCurrency: "EUR",
    freightTransitDays: 10,
    freightNotes: "European trucking to port, then ocean transit",
  },
  {
    accountName: "Baltic Subsea Solutions",
    industry: "Offshore",
    region: "Germany",
    accountStatus: "Active",
    contact: { name: "Jonas Reiter", title: "Procurement Lead", email: "j.reiter@balticsubsea-example.com", phone: "+49 100 00203" },
    projectSuffix: "Subsea Structural Package",
    lines: [
      { key: "alloySteelPlate", quantity: 8 },
      { key: "titaniumFasteners", quantity: 20 },
    ],
    supplierIndex: 1, // Ferro Adriatica S.p.A.
    unitPrices: [96, 88],
    currency: "EUR",
    leadTimeDays: 16,
    availability: "In Stock",
    estimatedTransitDays: 7,
    freightForwarderName: "Mediterranean Freight Solutions",
    freightQuoteRef: "MFS-Q-6602",
    freightPrice: 690,
    freightCurrency: "EUR",
    freightTransitDays: 8,
    freightNotes: "Ocean freight — Genoa to Rotterdam, standard transit",
  },
  {
    accountName: "Sundown Energy Services",
    industry: "Oil & Gas",
    region: "US",
    accountStatus: "Active",
    contact: { name: "Bianca Sorrell", title: "Buyer", email: "b.sorrell@sundownenergy-example.com", phone: "+1 555 010 0204" },
    projectSuffix: "Ball Valve Package",
    lines: [
      { key: "molyValve", quantity: 12 },
      { key: "ss316Forging", quantity: 6 },
    ],
    supplierIndex: 2, // Hanul Precision Metals
    unitPrices: [155000, 98000],
    currency: "KRW",
    leadTimeDays: 14,
    availability: "In Stock",
    estimatedTransitDays: 18,
    freightForwarderName: "Southwest Air & Sea",
    freightQuoteRef: "SAS-Q-7715",
    freightPrice: 540,
    freightCurrency: "USD",
    freightTransitDays: 16,
    freightNotes: "Trans-Pacific ocean freight — Busan to Houston",
  },
];

// --- Group 3: quoted, PO received, converted to Order — with at least
// one vendor's PO not yet generated (seed.js never writes to
// vendor_po_issuances; only the app's own "Generate Purchase Order"
// button does), ready for repeated practice with that action.
//
// `lines` is the RFQ's own line item order; each line names which
// vendor (by supplierIndex) actually wins it. Every vendor in `vendors`
// must quote a price for EVERY line in that order (seedSuppliersForRfq
// sends each vendor's inquiry against the whole RFQ) — for a line a
// vendor doesn't win, that's just a plausible comparison-only price, not
// used for the customer's quoted sell price. milestoneStage drives both
// the shipment's milestone timeline and the order's own pipeline_stage
// (see ORDER_PIPELINE_STAGE_BY_MILESTONE_STAGE / MILESTONE_STAGE_RANK in
// seed.js). Nordkyn is genuinely multi-vendor (two shipments, two
// suppliers), so it also exercises the per-vendor "Status on PM's Orders
// to Suppliers" grouping while practicing Generate PO.
const PENDING_PO_ORDER_JOBS = [
  {
    accountName: "Anchorpoint Industrial LLC",
    industry: "Mining",
    region: "US",
    accountStatus: "Active",
    contact: { name: "Owen Pratt", title: "Procurement Manager", email: "o.pratt@anchorpointindustrial-example.com", phone: "+1 555 010 0301" },
    projectSuffix: "Structural Pipe Package",
    customerPoReference: "ANC-2026-0113",
    createdOffsetDays: -40,
    quoteSentOffsetDays: -32,
    poReceivedOffsetDays: -8,
    lines: [
      { key: "duplexPipe", quantity: 60, wins: 3 },
      { key: "superDuplexFlange", quantity: 15, wins: 3 },
    ],
    vendors: [
      {
        supplierIndex: 3, // Rhein Präzisionsrohre GmbH
        unitPrices: [78, 108],
        currency: "EUR",
        leadTimeDays: 14,
        availability: "In Stock",
        estimatedTransitDays: 8,
        originCity: "Hamburg, Germany",
        trackingNumber: "REC-DE-55810",
        freightForwarderName: "Rheinland Express Cargo",
        freightQuoteRef: "REC-Q-5581",
        freightPrice: 520,
        freightCurrency: "EUR",
        freightTransitDays: 9,
        freightNotes: "European trucking to port, then ocean transit",
        milestoneStage: "early",
      },
    ],
  },
  {
    accountName: "Nordkyn Marine AS",
    industry: "Marine",
    region: "Norway",
    accountStatus: "Active",
    contact: { name: "Sigrid Haugen", title: "Buyer", email: "s.haugen@nordkynmarine-example.com", phone: "+47 100 00302" },
    projectSuffix: "Deck Hardware Package",
    customerPoReference: "NRD-2026-0207",
    createdOffsetDays: -30,
    quoteSentOffsetDays: -22,
    poReceivedOffsetDays: -15,
    lines: [
      { key: "titaniumFasteners", quantity: 18, wins: 1 },
      { key: "molyValve", quantity: 22, wins: 2 },
    ],
    vendors: [
      {
        supplierIndex: 1, // Ferro Adriatica S.p.A. — wins line 0
        unitPrices: [92, 135],
        currency: "EUR",
        leadTimeDays: 15,
        availability: "In Stock",
        estimatedTransitDays: 7,
        originCity: "Genoa, Italy",
        trackingNumber: "MFS-IT-66021",
        freightForwarderName: "Mediterranean Freight Solutions",
        freightQuoteRef: "MFS-Q-6650",
        freightPrice: 410,
        freightCurrency: "EUR",
        freightTransitDays: 8,
        freightNotes: "Ocean freight — Genoa to Bergen",
        milestoneStage: "mid",
      },
      {
        supplierIndex: 2, // Hanul Precision Metals — wins line 1
        unitPrices: [1350000, 148000],
        currency: "KRW",
        leadTimeDays: 12,
        availability: "In Stock",
        estimatedTransitDays: 19,
        originCity: "Busan, South Korea",
        trackingNumber: "PRO-KR-33552",
        freightForwarderName: "Pacific Rim Ocean Carriers",
        freightQuoteRef: "PRO-Q-3355",
        freightPrice: 470,
        freightCurrency: "USD",
        freightTransitDays: 20,
        freightNotes: "Ocean freight — Busan to Bergen",
        milestoneStage: "early",
      },
    ],
  },
  {
    accountName: "Ridgeview E&P",
    industry: "Oil & Gas",
    region: "US",
    accountStatus: "Active",
    contact: { name: "Carla Nunez", title: "Procurement Director", email: "c.nunez@ridgeviewep-example.com", phone: "+1 555 010 0303" },
    projectSuffix: "Tubing & Forgings Package",
    customerPoReference: "RDG-2026-0318",
    createdOffsetDays: -60,
    quoteSentOffsetDays: -50,
    poReceivedOffsetDays: -30,
    lines: [
      { key: "copperNickelTubing", quantity: 35, wins: 0 },
      { key: "ss316Forging", quantity: 9, wins: 0 },
    ],
    vendors: [
      {
        supplierIndex: 0, // Shanghai Noble Alloys Co.
        unitPrices: [195, 620],
        currency: "CNY",
        leadTimeDays: 22,
        availability: "Make to Order",
        estimatedTransitDays: 24,
        originCity: "Shanghai, China",
        trackingNumber: "SAS-CN-77603",
        freightForwarderName: "Southwest Air & Sea",
        freightQuoteRef: "SAS-Q-7760",
        freightPrice: 580,
        freightCurrency: "USD",
        freightTransitDays: 20,
        freightNotes: "Trans-Pacific ocean freight — Shanghai to Houston",
        milestoneStage: "late",
      },
    ],
  },
  {
    accountName: "Falcon Bay Fabrication",
    industry: "Marine",
    region: "US",
    accountStatus: "Active",
    contact: { name: "Devon Okafor", title: "Buyer", email: "d.okafor@falconbayfab-example.com", phone: "+1 555 010 0304" },
    projectSuffix: "Plate & Bar Package",
    customerPoReference: "FBF-2026-0126",
    createdOffsetDays: -75,
    quoteSentOffsetDays: -65,
    poReceivedOffsetDays: -50,
    lines: [
      { key: "alloySteelPlate", quantity: 10, wins: 2 },
      { key: "nickelRoundBar", quantity: 12, wins: 2 },
    ],
    vendors: [
      {
        supplierIndex: 2, // Hanul Precision Metals
        unitPrices: [135000, 168000],
        currency: "KRW",
        leadTimeDays: 11,
        availability: "In Stock",
        estimatedTransitDays: 17,
        originCity: "Busan, South Korea",
        trackingNumber: "PRO-KR-33914",
        freightForwarderName: "Pacific Rim Ocean Carriers",
        freightQuoteRef: "PRO-Q-3391",
        freightPrice: 495,
        freightCurrency: "USD",
        freightTransitDays: 18,
        freightNotes: "Ocean freight — Busan to Lakeland",
        milestoneStage: "delivered",
      },
    ],
  },
];

module.exports = { FRESH_RFQ_JOBS, SOURCED_NO_QUOTE_JOBS, PENDING_PO_ORDER_JOBS };
