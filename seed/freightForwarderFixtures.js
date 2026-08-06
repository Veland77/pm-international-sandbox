// seed/freightForwarderFixtures.js
// Fictional freight forwarder pool used by seed.js and offered as the
// dropdown choices on the live Freight Inquiry form. No real forwarder
// names, pricing, or route data — everything here is invented.

const FREIGHT_FORWARDERS = [
  {
    name: "Mediterranean Freight Solutions",
    country: "Italy",
    region: "Europe",
    specialty: "Mediterranean & Adriatic ocean freight",
  },
  {
    name: "Southwest Air & Sea",
    country: "United States",
    region: "North America",
    specialty: "Trans-Pacific air & ocean freight",
  },
  {
    name: "Pacific Rim Ocean Carriers",
    country: "Singapore",
    region: "Asia Pacific",
    specialty: "Asia-Europe ocean freight",
  },
  {
    name: "Rheinland Express Cargo",
    country: "Germany",
    region: "Europe",
    specialty: "European trucking & air freight",
  },
];

module.exports = { FREIGHT_FORWARDERS };
