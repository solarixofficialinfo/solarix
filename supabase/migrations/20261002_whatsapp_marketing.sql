-- ============================================================================
-- SOLARIX CRM — WHATSAPP MARKETING MODULE DATABASE SCHEMA
-- Supabase PostgreSQL Migration
-- Date: 2026-10-02
-- ============================================================================

-- 1. WHATSAPP PROVIDERS TABLE
CREATE TABLE IF NOT EXISTS public.whatsapp_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL DEFAULT 'evolution_go', -- 'evolution_go', 'whatsapp_cloud', 'simulated'
    name VARCHAR(100) NOT NULL DEFAULT 'Default WhatsApp Provider',
    is_active BOOLEAN NOT NULL DEFAULT true,
    credentials JSONB NOT NULL DEFAULT '{}'::jsonb, -- encrypted or server-side only: api_url, api_key, instance_name, access_token, etc.
    settings JSONB NOT NULL DEFAULT '{"rate_limit_per_min": 60, "delay_between_messages_ms": 150, "enforce_opt_in": true}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. WHATSAPP INSTANCES TABLE
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES public.whatsapp_providers(id) ON DELETE SET NULL,
    instance_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(30),
    status VARCHAR(30) NOT NULL DEFAULT 'disconnected', -- 'connected', 'disconnected', 'connecting', 'qr_ready'
    qr_code TEXT,
    uptime_seconds BIGINT NOT NULL DEFAULT 0,
    last_connected_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. WHATSAPP CONTACTS TABLE (Linked to Solarix CRM Clients and Leads)
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    city VARCHAR(100),
    district VARCHAR(100),
    solar_kw NUMERIC(10, 2) DEFAULT 0,
    customer_type VARCHAR(50) DEFAULT 'Residential',
    opt_in_status VARCHAR(30) NOT NULL DEFAULT 'opted_in', -- 'opted_in', 'opted_out', 'unknown'
    opt_in_at TIMESTAMPTZ DEFAULT NOW(),
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. WHATSAPP CONVERSATIONS TABLE (Inbox Threads)
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
    phone_number VARCHAR(30) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    last_message_text TEXT,
    last_message_time TIMESTAMPTZ DEFAULT NOW(),
    last_message_status VARCHAR(30) DEFAULT 'delivered',
    unread_count INT NOT NULL DEFAULT 0,
    assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. WHATSAPP MESSAGES TABLE (Chat & Campaign Message Log)
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
    campaign_id UUID, -- Optional link to campaign
    direction VARCHAR(10) NOT NULL DEFAULT 'outbound', -- 'inbound', 'outbound'
    message_type VARCHAR(20) NOT NULL DEFAULT 'text', -- 'text', 'image', 'video', 'document', 'pdf', 'template'
    text_body TEXT,
    media_url TEXT,
    media_caption TEXT,
    media_mime_type VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'queued', -- 'queued', 'sending', 'sent', 'delivered', 'read', 'failed'
    provider_message_id VARCHAR(150),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. WHATSAPP TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'MARKETING', -- 'MARKETING', 'UTILITY', 'AUTHENTICATION', 'SERVICE', 'REMINDER'
    body_text TEXT NOT NULL,
    media_type VARCHAR(20) DEFAULT 'none', -- 'none', 'image', 'video', 'document', 'pdf'
    media_url TEXT,
    variables JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g. ["customer_name", "solar_capacity", "city"]
    status VARCHAR(30) NOT NULL DEFAULT 'approved', -- 'approved', 'pending', 'rejected', 'draft'
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. WHATSAPP CAMPAIGNS TABLE
CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    campaign_type VARCHAR(50) NOT NULL DEFAULT 'Promotional', -- 'Promotional', 'Customer Update', 'Service Reminder', 'Payment Reminder', 'Solar Maintenance', 'Festival / Greeting', 'Custom'
    status VARCHAR(30) NOT NULL DEFAULT 'Draft', -- 'Draft', 'Scheduled', 'Sending', 'Completed', 'Paused', 'Failed'
    scheduled_at TIMESTAMPTZ,
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
    message_text TEXT NOT NULL,
    media_url TEXT,
    media_type VARCHAR(20) DEFAULT 'none',
    audience_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_audience INT NOT NULL DEFAULT 0,
    sent_count INT NOT NULL DEFAULT 0,
    delivered_count INT NOT NULL DEFAULT 0,
    read_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. WHATSAPP CAMPAIGN CONTACTS TABLE
CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
    phone_number VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'queued', 'sent', 'delivered', 'read', 'failed'
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. WHATSAPP MESSAGE QUEUE TABLE
CREATE TABLE IF NOT EXISTS public.whatsapp_message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
    phone_number VARCHAR(30) NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    message TEXT NOT NULL,
    media_url TEXT,
    media_caption TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'queued', -- 'queued', 'sending', 'sent', 'delivered', 'read', 'failed'
    provider_message_id VARCHAR(150),
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. WHATSAPP AUTOMATIONS TABLE
CREATE TABLE IF NOT EXISTS public.whatsapp_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    trigger_event VARCHAR(60) NOT NULL, -- 'installation_completed', 'service_due', 'payment_due', 'new_lead', 'campaign_completed'
    conditions JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"days_before": 7, "lead_source": "sales_link"}
    action_type VARCHAR(50) NOT NULL DEFAULT 'send_template', -- 'send_template', 'send_message', 'notify_team'
    template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
    delay_minutes INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    execution_count INT NOT NULL DEFAULT 0,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. WHATSAPP ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS public.whatsapp_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    user_name VARCHAR(150),
    action VARCHAR(80) NOT NULL, -- 'campaign_created', 'campaign_started', 'message_sent', 'message_delivered', 'customer_replied', 'provider_connected', etc.
    campaign_id UUID REFERENCES public.whatsapp_campaigns(id) ON DELETE SET NULL,
    campaign_name VARCHAR(200),
    customer_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR MAXIMUM QUERY EFFICIENCY
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_wa_providers_company ON public.whatsapp_providers(company_id);
CREATE INDEX IF NOT EXISTS idx_wa_instances_company ON public.whatsapp_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_company_phone ON public.whatsapp_contacts(company_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_client ON public.whatsapp_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_lead ON public.whatsapp_contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_company ON public.whatsapp_conversations(company_id, last_message_time DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation ON public.whatsapp_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_company_status ON public.whatsapp_messages(company_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_messages_provider_id ON public.whatsapp_messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_company_status ON public.whatsapp_campaigns(company_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_queue_status_created ON public.whatsapp_message_queue(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_wa_queue_campaign ON public.whatsapp_message_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_wa_automations_trigger ON public.whatsapp_automations(company_id, trigger_event, is_active);
CREATE INDEX IF NOT EXISTS idx_wa_activity_company_created ON public.whatsapp_activity_logs(company_id, created_at DESC);

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- Multi-tenant isolation based on company_id in Supabase JWT
-- ============================================================================
ALTER TABLE public.whatsapp_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_activity_logs ENABLE ROW LEVEL SECURITY;

-- Helper policy pattern: Users can only view and modify rows of their own company
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'whatsapp_providers',
            'whatsapp_instances',
            'whatsapp_contacts',
            'whatsapp_conversations',
            'whatsapp_messages',
            'whatsapp_templates',
            'whatsapp_campaigns',
            'whatsapp_campaign_contacts',
            'whatsapp_message_queue',
            'whatsapp_automations',
            'whatsapp_activity_logs'
        ])
    LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I;
            CREATE POLICY tenant_isolation_policy ON public.%I
                FOR ALL
                USING (
                    company_id::text = (auth.jwt() ->> ''company_id'')
                    OR (auth.jwt() ->> ''role'') IN (''super_admin'', ''platform_owner'')
                    OR current_user = ''postgres''
                    OR current_user = ''service_role''
                )
                WITH CHECK (
                    company_id::text = (auth.jwt() ->> ''company_id'')
                    OR (auth.jwt() ->> ''role'') IN (''super_admin'', ''platform_owner'')
                    OR current_user = ''postgres''
                    OR current_user = ''service_role''
                );
        ', tbl, tbl);
    END LOOP;
END $$;
