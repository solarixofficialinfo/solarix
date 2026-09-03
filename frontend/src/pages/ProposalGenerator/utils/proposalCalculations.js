/**
 * Engineering and financial calculation formulas for Solar PV Proposals.
 * Standardized to match Solarix 3D Designer and MNRE / PM Surya Ghar guidelines.
 */

// Monthly solar irradiation distribution weights (normalized to 1.0)
export const MONTHLY_WEIGHTS = [
  { month: "Jan", full: "January", weight: 0.082, tag: "Winter Sun" },
  { month: "Feb", full: "February", weight: 0.087, tag: "Optimal" },
  { month: "Mar", full: "March", weight: 0.098, tag: "Spring Peak" },
  { month: "Apr", full: "April", weight: 0.102, tag: "Summer Peak" },
  { month: "May", full: "May", weight: 0.105, tag: "High Irradiance" },
  { month: "Jun", full: "June", weight: 0.076, tag: "Pre-Monsoon" },
  { month: "Jul", full: "July", weight: 0.065, tag: "Monsoon Low" },
  { month: "Aug", full: "August", weight: 0.068, tag: "Monsoon Low" },
  { month: "Sep", full: "September", weight: 0.078, tag: "Post-Monsoon" },
  { month: "Oct", full: "October", weight: 0.085, tag: "Clear Skies" },
  { month: "Nov", full: "November", weight: 0.079, tag: "Mild Sunshine" },
  { month: "Dec", full: "December", weight: 0.075, tag: "Winter Solstice" },
];

/**
 * Format number into Indian Rupee representation (e.g. ₹2,50,000)
 */
export function formatINR(val, showDecimals = false) {
  const n = Number(val) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: showDecimals ? 2 : 0,
    minimumFractionDigits: showDecimals ? 2 : 0,
  }).format(n);
}

/**
 * Format raw number with Indian comma grouping
 */
export function formatNumberIN(val, decimals = 0) {
  const n = Number(val) || 0;
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
}

/**
 * Calculate government central subsidy under PM Surya Ghar Muft Bijli Yojana
 * Residential:
 * - 1 kW: ₹30,000
 * - 2 kW: ₹60,000 (₹30,000/kW)
 * - 3 kW and above: ₹78,000 max central subsidy
 * Commercial: ₹0 (Accelerated depreciation applies instead)
 */
export function calculateSubsidy(systemKw, projectType = "residential") {
  const kw = Number(systemKw) || 0;
  if (projectType.toLowerCase().includes("commercial")) {
    return 0;
  }
  if (kw <= 0) return 0;
  if (kw <= 1.0) return 30000;
  if (kw <= 2.0) return 60000;
  return 78000;
}

/**
 * Calculate solar generation and savings projections
 */
export function calculateSolarMetrics({
  systemKw = 5.0,
  tariffRate = 8.5,
  netCost = 172000,
  degradationPct = 0.7,
  tariffEscalationPct = 3.0,
}) {
  const kw = Math.max(0.1, Number(systemKw) || 5.0);
  const tariff = Math.max(1, Number(tariffRate) || 8.5);
  const cost = Math.max(1, Number(netCost) || 0);

  // Industry standard benchmark: ~1,450 kWh per kWp installed annually in India
  const annualKwh = Math.round(kw * 1450);
  const dailyAvgUnits = Math.round((annualKwh / 365) * 10) / 10;
  const annualSavings = Math.round(annualKwh * tariff);

  // Payback period
  const paybackYears = cost > 0 && annualSavings > 0
    ? Math.round((cost / annualSavings) * 10) / 10
    : 0;

  // Environmental offsets
  // CEA (Central Electricity Authority) carbon factor: ~0.82 kg CO2 / kWh
  const co2Tons = Math.round((annualKwh * 0.82) / 100) / 10;
  const treesEquivalent = Math.round(co2Tons * 45);
  const coalSavedKg = Math.round(annualKwh * 0.4);

  // 25-Year Life Cycle Simulation
  let cumulativeSavings = 0;
  let currentTariff = tariff;
  const yearlyProjections = [];

  for (let year = 1; year <= 25; year++) {
    const degradationFactor = Math.pow(1 - degradationPct / 100, year - 1);
    const yearGen = annualKwh * degradationFactor;
    const yearSav = yearGen * currentTariff;
    cumulativeSavings += yearSav;

    if (year <= 10 || year === 15 || year === 20 || year === 25) {
      yearlyProjections.push({
        year,
        generationKwh: Math.round(yearGen),
        tariff: Math.round(currentTariff * 100) / 100,
        annualSavings: Math.round(yearSav),
        cumulativeSavings: Math.round(cumulativeSavings),
      });
    }
    currentTariff *= 1 + tariffEscalationPct / 100;
  }

  // Monthly distribution
  const monthlyData = MONTHLY_WEIGHTS.map((item) => {
    const gen = Math.round(annualKwh * item.weight);
    const sav = Math.round(gen * tariff);
    return {
      month: item.month,
      fullMonth: item.full,
      generation: gen,
      savings: sav,
      tag: item.tag,
    };
  });

  return {
    systemKw: kw,
    annualKwh,
    dailyAvgUnits,
    annualSavings,
    paybackYears,
    lifetimeSavings: Math.round(cumulativeSavings),
    co2Tons,
    treesEquivalent,
    coalSavedKg,
    yearlyProjections,
    monthlyData,
  };
}

/**
 * Calculate payment milestones based on net customer cost
 */
export function calculatePaymentMilestones(netCost, milestones) {
  const total = Math.max(0, Number(netCost) || 0);
  const list = Array.isArray(milestones) && milestones.length > 0
    ? milestones
    : [
        { stage: "Milestone 1", label: "20% Advance with Order Confirmation", pct: 20 },
        { stage: "Milestone 2", label: "70% Upon Material Readiness & Site Dispatch", pct: 70 },
        { stage: "Milestone 3", label: "5% Upon Mechanical & Electrical Installation", pct: 5 },
        { stage: "Milestone 4", label: "5% Upon Net-Meter Installation & Commissioning", pct: 5 },
      ];

  return list.map((m, idx) => {
    const pct = Number(m.pct) || 0;
    const amount = Math.round((total * pct) / 100);
    return {
      id: `ms-${idx + 1}`,
      stage: m.stage || `Milestone ${idx + 1}`,
      label: m.label || `${pct}% Milestone`,
      pct,
      amount,
    };
  });
}
