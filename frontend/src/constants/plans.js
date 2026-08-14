export const PLANS = {
  starter: {
    id: "starter",
    name: "STARTER",
    tagline: "Small installers & small EPC teams",
    turnover: "Annual turnover: Up to ₹15 lakh",
    monthly_price: 2999,
    yearly_price: 29990,
    max_users: 3,
    max_clients: 100,
    badge: null,
    features: [
      "Up to 3 users",
      "Up to 100 active clients/projects",
      "Core CRM & Client Onboarding",
      "Project Management & Task Portal",
      "Material Requests & Basic Inventory",
      "Inward & Outward Tracking",
      "Product Master & Balance Report",
      "History & Basic Documents",
      "Basic Reports & Notifications",
      "Basic Import / Export"
    ]
  },
  growth: {
    id: "growth",
    name: "GROWTH",
    tagline: "Growing solar EPC companies",
    turnover: "Annual turnover: ₹15–50 lakh",
    monthly_price: 5999,
    yearly_price: 59990,
    max_users: 10,
    max_clients: 500,
    badge: "MOST POPULAR",
    features: [
      "Everything in Starter, plus:",
      "Up to 10 users",
      "Up to 500 active clients/projects",
      "Advanced Inventory & High Value Goods",
      "Serial Number Tracking",
      "Vendor & Procurement Portal",
      "Advanced Documents & Sales Invoices",
      "Receivables & Collection Tracking",
      "Loan & Finance Tracking",
      "Expenses & Project Profitability",
      "Advanced Reports & Permissions",
      "Priority Customer Support"
    ]
  },
  pro: {
    id: "pro",
    name: "PRO",
    tagline: "Established EPC companies",
    turnover: "Annual turnover: Above ₹50 lakh",
    monthly_price: 9999,
    yearly_price: 99990,
    max_users: 25,
    max_clients: "Unlimited",
    badge: "FULL POWER",
    features: [
      "Everything in Growth, plus:",
      "Up to 25 users",
      "Unlimited clients & projects",
      "Advanced Financial Controls",
      "Advanced Profitability Analytics",
      "Multi-branch Support",
      "Advanced Role & Field Permissions",
      "API & External Integrations",
      "Custom Branding & Header Logo",
      "Dedicated Account Manager",
      "Advanced Operational Controls"
    ]
  }
};

export function calcSavings(monthlyPrice, yearlyPrice) {
  const normalAnnualEquivalent = monthlyPrice * 12;
  const annualSavings = normalAnnualEquivalent - yearlyPrice;
  const savingsPercent = Math.round((annualSavings / normalAnnualEquivalent) * 100);
  return {
    normalAnnualEquivalent,
    annualSavings,
    savingsPercent
  };
}
