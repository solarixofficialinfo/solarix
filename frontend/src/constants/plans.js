export const PLANS = {
  starter: {
    id: "starter",
    name: "STARTER",
    tagline: "Small installers & small EPC teams",
    turnover: "Annual turnover: Up to ₹15 lakh",
    monthly_price: 3999,
    yearly_price: 29990,
    max_users: 3,
    max_clients: 100,
    storage_gb: 5,
    monthly_pdf_docx: 200,
    monthly_inventory_transactions: 2500,
    monthly_material_requests: 1000,
    badge: null,
    features: [
      "Up to 3 users",
      "Up to 100 active clients/projects",
      "1,000 product master items",
      "5 GB secure document storage",
      "200 PDF/DOCX generations/month",
      "2,500 inventory transactions/month",
      "1,000 material requests/month",
      "Core CRM & Client Onboarding",
      "Project Execution & Task Portal",
      "Inward & Outward Stock Tracking",
      "Document Templates & Client Data",
      "Client Material Ledger & Reports"
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
    storage_gb: 25,
    monthly_pdf_docx: 1000,
    monthly_inventory_transactions: 10000,
    monthly_material_requests: 5000,
    monthly_api_requests: 5000,
    badge: "MOST POPULAR",
    features: [
      "Everything in Starter, plus:",
      "Up to 10 users",
      "Up to 500 active clients/projects",
      "5,000 product master items",
      "25 GB secure document storage",
      "1,000 PDF/DOCX generations/month",
      "10,000 inventory transactions/month",
      "5,000 material requests/month",
      "5,000 API requests/month",
      "Receivables & Collection Workspace",
      "Invoices, Payments, Loan & Expense Tracking",
      "High Value Goods & Challans",
      "Serial Number Tracking",
      "Purchase Orders & Vendor Master",
      "DOCX Document Templates Export",
      "Custom Role & Page Permissions"
    ]
  },
  pro: {
    id: "pro",
    name: "PRO",
    tagline: "Established EPC companies",
    turnover: "Annual turnover: Above ₹50 lakh",
    monthly_price: 8999,
    yearly_price: 79990,
    max_users: 25,
    max_clients: 2500,
    storage_gb: 100,
    monthly_pdf_docx: 5000,
    monthly_inventory_transactions: 50000,
    monthly_material_requests: 20000,
    monthly_api_requests: 50000,
    badge: "FULL POWER",
    features: [
      "Everything in Growth, plus:",
      "Up to 25 users",
      "Up to 2,500 active clients/projects",
      "15,000 product master items",
      "100 GB secure document storage",
      "5,000 PDF/DOCX generations/month",
      "50,000 inventory transactions/month",
      "20,000 material requests/month",
      "50,000 API requests/month",
      "Full Operations & Financial Workspace Access",
      "Maximum Quotas for High-Volume Solar EPCs",
      "Enterprise Scale Data & Document Processing"
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
