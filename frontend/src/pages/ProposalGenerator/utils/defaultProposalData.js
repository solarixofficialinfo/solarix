/**
 * Factual reference data, standard scope checklists, terms and equipment defaults
 * extracted directly from the reference solar proposal.
 */

export const DEFAULT_PANEL_DATA = {
  make: "INA Solar / Tier-1 ALMM",
  model: "555 WP DCR TOPCon Bifacial",
  technology: "TOPCon / Mono PERC Bifacial",
  wattage: 555,
  warrantyProductYears: 12,
  warrantyPerformanceYears: 30,
};

export const DEFAULT_INVERTER_DATA = {
  make: "UTL Solar / Tier-1 On-Grid",
  model: "Smart Grid-Tied String Inverter with Wi-Fi",
  phase: "Single Phase",
  warrantyYears: 10,
};

export const DEFAULT_STRUCTURE_DATA = {
  type: "Elevated Super Structure",
  description: "Hot-Dip Galvanized Iron (HDGI) Columns with Anodized Aluminium 6063-T6 Purlins",
  height: "1.8m Clearance",
  material: "Aluminium 6063-T6 & HDGI",
  windRating: "Up to 150 km/h wind resistance",
  warrantyYears: 5,
};

export const DEFAULT_CABLES_DATA = {
  dcCable: "4 / 6 sq.mm Tinned Copper UV Protected Solar DC Cable",
  acCable: "4-Core Copper / Aluminium Armoured AC Cable",
  brand: "Polycab / Havells / Siechem",
};

export const DEFAULT_BOS_COMPONENTS = [
  { name: "Array Junction Box (DCDB)", spec: "IP65 Polycarbonate Enclosure with 1000V DC SPD & Fuses", qty: "1 Set" },
  { name: "AC Distribution Box (ACDB)", spec: "IP65 Weatherproof with MCB, Isolator & Type-2 SPD", qty: "1 Set" },
  { name: "Chemical Earthing System", spec: "Dual Maintenance-Free Earth Pits with Copper-Bonded Electrodes", qty: "2 Sets" },
  { name: "Lightning Arrestor (LA)", spec: "Class-I Copper Spike Arrestor with Base Plate & Down Conductor", qty: "1 Set" },
  { name: "Bi-Directional Net Meter", spec: "DISCOM Approved Class 1.0 Bi-directional Solar Energy Meter", qty: "1 Nos" },
  { name: "Wiring Conduits & Accessories", spec: "Heavy-Duty UV-Resistant PVC/HDPE Pipes & Fire-Retardant Cable Trays", qty: "1 Lot" },
  { name: "Hardware & Connectors", spec: "IP68 MC4 Connectors & SS304 Nut-Bolts and Module Clamps", qty: "1 Lot" },
];

export const DEFAULT_WARRANTIES = [
  { component: "Solar PV Modules", coverage: "12 Years Product Warranty / 30 Years Linear Performance Guarantee (85% output)" },
  { component: "Solar String Inverter", coverage: "10 Years Comprehensive Manufacturer Product Warranty with Wi-Fi Logger" },
  { component: "Mounting Framework", coverage: "5 Years Structural & Mechanical Stability Warranty against corrosion" },
  { component: "Balance of System (BOS)", coverage: "1 Year System Warranty covering cables, switchgear & earthing" },
  { component: "Workmanship & Installation", coverage: "5 Years Preventive Maintenance & Service Support" },
];

export const DEFAULT_TIMELINE_STAGES = [
  { stage: "Phase 1", title: "Finalization of Design & Technical Drawings", days: 7, desc: "Site shadow assessment, layout signoff, and structural calculation" },
  { stage: "Phase 2", title: "Engineering, Procurement & Material Supply", days: 15, desc: "Sourcing Tier-1 components and safe dispatch to project site" },
  { stage: "Phase 3", title: "Rooftop Solar Plant Installation & Wiring", days: 20, desc: "Structure assembly, module clamping, inverter wiring & earthing pits" },
  { stage: "Phase 4", title: "Commissioning, Net Metering & Handover", days: 14, desc: "DISCOM inspection, bi-directional meter installation & app setup" },
];

export const DEFAULT_OUR_SCOPE = [
  { text: "Detailed site survey, shadow modeling & rooftop layout engineering", checked: true },
  { text: "Supply of high-efficiency ALMM compliant DCR solar PV modules", checked: true },
  { text: "Supply of smart grid-tied string inverter with integrated Wi-Fi monitoring", checked: true },
  { text: "Fabrication & installation of corrosion-resistant mounting structure", checked: true },
  { text: "Supply & routing of UV-resistant DC cables and armoured AC cables", checked: true },
  { text: "Complete ACDB, DCDB, earthing & lightning protection system", checked: true },
  { text: "Professional installation by trained & certified solar technicians", checked: true },
  { text: "State DISCOM net-metering liaisoning, documentation & sanction assistance", checked: true },
  { text: "Plant pre-commissioning testing, synchronization & customer handover", checked: true },
  { text: "Smartphone monitoring application configuration & user training", checked: true },
  { text: "Zero export device integration (where applicable for commercial consumers)", checked: false },
];

export const DEFAULT_CUSTOMER_SCOPE = [
  { text: "Provide clear, unshaded rooftop space and obstacle-free cable passage", checked: true },
  { text: "Safe, dry, and lockable storage space at site for delivered equipment", checked: true },
  { text: "Uninterrupted single/three-phase electricity & clean water during erection", checked: true },
  { text: "Timely review and approval of engineering drawings & documentation", checked: true },
  { text: "Adherence to agreed milestone payment schedule as per work order", checked: true },
  { text: "Direct payment of statutory DISCOM meter testing & application fees if applicable", checked: true },
  { text: "Reasonable roof access for technicians during commissioning & warranty service", checked: true },
];

export const DEFAULT_TERMS = [
  { title: "Price Validity", desc: "This proposal and commercial offer is valid for 15 calendar days from the date of issue. Prices are subject to revision thereafter based on prevailing raw material costs." },
  { title: "Taxes & Duties", "desc": "Goods and Services Tax (GST) is charged at current applicable rates for solar EPC projects. Any statutory variation in government taxes or duties at time of billing shall be to the customer's account." },
  { title: "Packing & Freight", "desc": "Standard packing, handling, and freight charges for delivery up to customer site are included in the quoted price." },
  { title: "Storage & Custody", "desc": "Materials delivered to the site become the custodial responsibility of the customer. The customer shall provide safe, lockable, and weatherproof storage." },
  { title: "Civil & Grouting", "desc": "Standard civil grouting and non-penetrating ballast anchorages are included. Heavy civil structural modifications or building reinforcement, if mandated by site conditions, shall be billed extra." },
  { title: "Water & Power Supply", "desc": "Continuous electrical power and water for civil curing and module cleaning must be provided free of charge by the customer during execution." },
  { title: "Net Metering & Approvals", "desc": "Net-metering sanctions and bi-directional meter release are subject to DISCOM feasibility approval. The company will act as liaison partner, but DISCOM timelines are governed by utility policies." },
  { title: "Force Majeure", "desc": "Delivery and commissioning schedules are subject to Force Majeure circumstances including natural calamities, severe weather, grid shutdowns, or governmental regulatory changes." },
];

export const WHY_CHOOSE_US_FACTS = [
  { title: "MNRE Approved Solar EPC", desc: "Certified engineering standards adhering to Ministry of New & Renewable Energy channel partner benchmarks." },
  { title: "Comprehensive Energy Audit", desc: "Custom load and tariff assessment ensuring accurate capacity sizing for maximum ROI." },
  { title: "Tailored Engineering Solutions", desc: "Precision structural engineering designed for maximum wind resistance with zero roof compromise." },
  { title: "End-to-End Net-Metering Support", desc: "Seamless handling of all paperwork, DISCOM inspections, and bi-directional meter sanctioning." },
  { title: "PM Surya Ghar Subsidy Assistance", desc: "Guaranteed registration on the National Solar Portal and step-by-step subsidy claim verification." },
  { title: "Accelerated Tax Depreciation", desc: "Commercial clients can leverage 40% accelerated tax depreciation under IT Act Section 32." },
  { title: "Tier-1 High-Efficiency Modules", desc: "ALMM approved, DCR certified solar modules with 30-year linear performance guarantees." },
  { title: "24/7 Cloud Monitoring App", desc: "Real-time generation tracking, performance metrics, and fault alerts on mobile devices." },
  { title: "Dedicated Local Service Support", desc: "Trained local service engineers providing quick-response maintenance and annual checkups." },
];
