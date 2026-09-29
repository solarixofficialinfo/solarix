import dayjs from "dayjs";

export const formatINR = (val, showDecimals = false) => {
  const n = Number(val) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: showDecimals ? 2 : 0,
    minimumFractionDigits: showDecimals ? 2 : 0,
  }).format(n);
};

export const formatNumberIN = (val, decimals = 0) => {
  const n = Number(val) || 0;
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
};

export const newId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

export const DEFAULT_PAYMENT_TERMS = [
  { id: "pt-1", stage: "Advance / Booking", percent: 20, amount: 0, description: "Along with purchase order & design sign-off" },
  { id: "pt-2", stage: "Material Delivery", percent: 60, amount: 0, description: "Upon delivery of solar modules, inverter & structure at site" },
  { id: "pt-3", stage: "Installation", percent: 15, amount: 0, description: "Upon completion of mechanical & electrical installation" },
  { id: "pt-4", stage: "Commissioning", percent: 5, amount: 0, description: "Upon DISCOM testing, net metering & final commissioning" },
];

export const DEFAULT_TIMELINE = [
  { id: "tl-1", sequence: 1, stage: "Finalization of Design and Drawings", duration: "7 Days" },
  { id: "tl-2", sequence: 2, stage: "Engineering, Procurement, and Supply of Material", duration: "15 Days" },
  { id: "tl-3", sequence: 3, stage: "Solar Plant Installation", duration: "20 Days" },
  { id: "tl-4", sequence: 4, stage: "Commissioning and Testing", duration: "14 Days" },
];

export const DEFAULT_SCOPE_OF_WORK = [
  "Comprehensive site feasibility assessment, 3D shadow analysis, and engineering layout design.",
  "Procurement and safe supply of Tier-1 Solar PV modules, inverter, and HDGI mounting structures.",
  "Civil structure fabrication, foundations, and robust mechanical mounting on designated rooftop.",
  "AC and DC electrical wiring, combiner boxes, circuit breakers, and inverter interconnection.",
  "Chemical earthing electrode installation and high-grade lightning protection system.",
  "Pre-commissioning testing, insulation checks, and quality assurance audit.",
  "Complete documentation and liaison for DISCOM Net-Metering application, sanction, and meter testing.",
  "Integration of remote smartphone / web monitoring portal and customer handover.",
];

export const DEFAULT_TERMS_AND_CONDITIONS = [
  "Quotation Validity: This commercial proposal is valid for 15 days from the date of issuance.",
  "Payment Schedule: Payments shall be released milestone-wise in accordance with the commercial schedule.",
  "Site Readiness: The client shall ensure clear, shadow-free rooftop access, construction power, and water.",
  "Statutory Clearances: DISCOM net-metering approvals and CEIG inspections follow utility statutory timelines.",
  "Warranties: Module: 12-yr product / 25-yr performance; Inverter: 5-yr; Structure & Workmanship: 5-yr.",
  "Taxes & Duties: Applicable GST and statutory levies are as specified in the commercial offer.",
  "Force Majeure: Standard industry force majeure clauses apply to unpreventable delays beyond reasonable control.",
];

export const getInitialQuotation = (companyData = null) => {
  const todayStr = dayjs().format("YYYY-MM-DD");
  const defaultRef = `GVP/QTN/${dayjs().format("YYYY")}/${Math.floor(1000 + Math.random() * 9000)}`;

  const c = companyData || {};

  return {
    id: newId(),
    reference_no: defaultRef,
    date: todayStr,
    status: "draft",
    template: "S1",

    customer: {
      client_id: "",
      name: "",
      address: "",
      phone: "",
      email: "",
      city: "",
    },

    company: {
      name: c.company_name || c.name || "GVP Solar",
      address: c.address || "Pune, Maharashtra",
      phone: c.mobile || c.phone || "+91 98765 00000",
      email: c.email || "info@gvpsolar.com",
      poc: c.owner_name || "Solar Solutions Team",
      gst: c.gst_number || "",
    },

    project: {
      size_kw: 100,
      structure_type: "HDGI Elevated Rooftop",
      system_type: "Grid Connected Solar PV System",
      location: "",
      description: "Rooftop Grid-Tied Solar PV System",
    },

    solar_system: {
      panel: {
        watt_peak: "590 Wp",
        quantity: 170,
        make: "Adani Solar",
        brand: "Adani Solar",
        type: "Mono PERC Bifacial",
        warranty: "12 Years Product / 25 Years Performance",
      },
      inverter: {
        size_kw: "100 kW",
        quantity: 1,
        make: "Solis",
        brand: "Solis",
        phase: "Three Phase",
        warranty: "5 Years Standard Warranty",
      },
      cable: {
        make: "Polycab",
        ac: "4C x 50 sq.mm Aluminium Armoured Cable",
        dc: "1C x 4 sq.mm Copper Solar Cable",
      },
      structure: {
        description: "HDGI Elevated Rooftop Structure with SS304 Fasteners",
      },
      bos: {
        description: "ACDB, DCDB, Chemical Earthing & Lightning Protection",
        warranty: "5 Years Complete Balance of System",
      },
    },

    financials: {
      price_per_kw: 2600,
      project_cost: 260000,
      payback_years: 3.5,
      annual_generation: 150000,
      annual_saving: 1200000,
      tree_saved: 1600,
      co2_reduction: 140,
      monthly_generation: 12500,
      monthly_saving: 100000,
      tariff_rate: 8.0,
    },

    commercial: {
      price: 260000,
      price_per_kw: 2600,
      payment_terms: [...DEFAULT_PAYMENT_TERMS],
      bank_details: {
        bank_name: "HDFC Bank",
        account_name: c.company_name || "GVP Solar Technologies",
        account_number: "50200012345678",
        ifsc: "HDFC0001234",
        branch: "Main Commercial Branch",
      },
    },

    bom: [
      { id: "bom-1", item: "Solar PV Modules", specification: "590 Wp Mono PERC Bifacial", make: "Adani Solar", quantity: 170, unit: "Nos", rate: 0, amount: 0 },
      { id: "bom-2", item: "Grid-Tied Solar Inverter", specification: "100 kW Three Phase String Inverter", make: "Solis", quantity: 1, unit: "Nos", rate: 0, amount: 0 },
      { id: "bom-3", item: "Module Mounting Structure", specification: "HDGI Elevated Rooftop Superstructure", make: "Standard Tier-1", quantity: "100 kW", unit: "Set", rate: 0, amount: 0 },
      { id: "bom-4", item: "DC Solar Cables", specification: "1C x 4/6 sq.mm Copper Solar Cable", make: "Polycab", quantity: 1, unit: "Lot", rate: 0, amount: 0 },
      { id: "bom-5", item: "AC Power Cables", specification: "4C x 50 sq.mm Aluminium Armoured Cable", make: "Polycab", quantity: 1, unit: "Lot", rate: 0, amount: 0 },
      { id: "bom-6", item: "AC & DC Distribution Boxes", specification: "With SPD, MCB & Fuse Protection", make: "Standard", quantity: 1, unit: "Set", rate: 0, amount: 0 },
      { id: "bom-7", item: "Chemical Earthing & LA", specification: "Copper Bonded Chemical Earthing + Spike LA", make: "Standard", quantity: 1, unit: "Set", rate: 0, amount: 0 },
      { id: "bom-8", item: "Balance of System & Monitoring", specification: "Bi-directional Meter, Disconnects & BOS", make: "Standard", quantity: 1, unit: "Lot", rate: 0, amount: 0 },
    ],

    timeline: [...DEFAULT_TIMELINE],
    scope_of_work: [...DEFAULT_SCOPE_OF_WORK],
    terms_and_conditions: [...DEFAULT_TERMS_AND_CONDITIONS],
  };
};

/**
 * Calculates dependent metrics based on size_kw, price_per_kw, and tariff_rate.
 * Ensures ONE central source of truth for all derived values.
 */
export const calculateDerivedQuotationMetrics = (q) => {
  const sizeKw = Math.max(0, Number(q.project?.size_kw) || 0);
  const pricePerKw = Math.max(0, Number(q.commercial?.price_per_kw ?? q.financials?.price_per_kw) || 0);
  const tariffRate = Math.max(1, Number(q.financials?.tariff_rate) || 8.0);

  // Exact formula: Project Size × Price per kW = Project Cost
  const projectCost = Math.round(sizeKw * pricePerKw);

  // Benchmark generation: ~1500 kWh / kWp / year
  const annualGen = Math.round(sizeKw * 1500);
  const monthlyGen = Math.round(annualGen / 12);

  // Annual savings: annualGen * tariff
  const annualSaving = Math.round(annualGen * tariffRate);
  const monthlySaving = Math.round(annualSaving / 12);

  // Payback period in years
  const paybackYears = annualSaving > 0 && projectCost > 0
    ? Math.round((projectCost / annualSaving) * 10) / 10
    : 3.5;

  // Environmental offsets
  const treeSaved = Math.round(sizeKw * 16);
  const co2Reduction = Math.round(sizeKw * 1.4 * 10) / 10;

  // Auto-calculated panel count if panel wattage is known (e.g. 590W)
  const rawWp = String(q.solar_system?.panel?.watt_peak || "590").replace(/[^0-9]/g, "");
  const panelWpNum = Number(rawWp) || 590;
  const suggestedPanelQty = sizeKw > 0 && panelWpNum > 0 ? Math.ceil((sizeKw * 1000) / panelWpNum) : (q.solar_system?.panel?.quantity || 170);

  // Recalculate milestone amounts in payment terms based on new projectCost
  const updatedPaymentTerms = (q.commercial?.payment_terms || DEFAULT_PAYMENT_TERMS).map((pt) => {
    const pct = Number(pt.percent) || 0;
    return {
      ...pt,
      amount: Math.round((projectCost * pct) / 100),
    };
  });

  return {
    ...q,
    project: {
      ...q.project,
      size_kw: sizeKw,
    },
    financials: {
      ...q.financials,
      price_per_kw: pricePerKw,
      project_cost: projectCost,
      payback_years: paybackYears,
      annual_generation: annualGen,
      annual_saving: annualSaving,
      monthly_generation: monthlyGen,
      monthly_saving: monthlySaving,
      tree_saved: treeSaved,
      co2_reduction: co2Reduction,
      tariff_rate: tariffRate,
    },
    commercial: {
      ...q.commercial,
      price: projectCost,
      price_per_kw: pricePerKw,
      payment_terms: updatedPaymentTerms,
    },
    solar_system: {
      ...q.solar_system,
      panel: {
        ...q.solar_system?.panel,
        quantity: q.solar_system?.panel?.quantity || suggestedPanelQty,
      },
      inverter: {
        ...q.solar_system?.inverter,
        size_kw: q.solar_system?.inverter?.size_kw || `${sizeKw} kW`,
      },
    },
  };
};
