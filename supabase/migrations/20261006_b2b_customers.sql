-- SOLARIX: Dedicated B2B Business Customers Master Table
-- Completely separated from CRM / Installation Clients

CREATE TABLE IF NOT EXISTS public.b2b_customers (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT,
    contact_person TEXT DEFAULT '',
    mobile TEXT DEFAULT '',
    alt_mobile TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    gstin TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_customers_company_id ON public.b2b_customers(company_id);
CREATE INDEX IF NOT EXISTS idx_b2b_customers_status ON public.b2b_customers(status);
