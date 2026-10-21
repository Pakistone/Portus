-- =============================================================================
-- PORTUS — U.J.P.A.S. (Union des Jeunes du Port pour l'Assistance et la Sécurité)
-- SCRIPT SCHÉMA SUPABASE DÉFINITIF POUR LA PRODUCTION (PostgreSQL)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. EXTENSIONS & PRÉPARATION SÉCURITÉ
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function d'aide pour extraire le rôle de l'utilisateur courant depuis JWT / public.profiles
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- 1. TABLE: profiles (Gouvernance U.J.P.A.S. & Photos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR')),
    sector_id TEXT, -- Optionnel : pool global d'agents
    avatar_url TEXT, -- Photo officielle de l'agent pour trombinoscope
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- -----------------------------------------------------------------------------
-- 2. TABLES: carnets & tickets (Carnets & Billetterie Officielle)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.carnets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carnet_number TEXT UNIQUE NOT NULL,
    series_prefix TEXT DEFAULT 'VRD',
    generation_batch TEXT NOT NULL DEFAULT 'GEN-1',
    size INT NOT NULL DEFAULT 50,
    start_number INT NOT NULL,
    end_number INT NOT NULL,
    total_tickets INT,
    unit_price NUMERIC NOT NULL DEFAULT 1000,
    total_value NUMERIC,
    assigned_to_responsable UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_to_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_to_responsable_name TEXT,
    sector_id UUID,
    status TEXT NOT NULL DEFAULT 'CREATED',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.carnets
    ADD COLUMN IF NOT EXISTS series_prefix TEXT DEFAULT 'VRD',
    ADD COLUMN IF NOT EXISTS generation_batch TEXT NOT NULL DEFAULT 'GEN-1',
    ADD COLUMN IF NOT EXISTS size INT NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS total_tickets INT,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC NOT NULL DEFAULT 1000,
    ADD COLUMN IF NOT EXISTS total_value NUMERIC,
    ADD COLUMN IF NOT EXISTS assigned_to_responsable UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_to_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_to_responsable_name TEXT,
    ADD COLUMN IF NOT EXISTS sector_id UUID,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_carnets_status ON public.carnets(status);
CREATE INDEX IF NOT EXISTS idx_carnets_responsable ON public.carnets(assigned_to_responsable);
CREATE INDEX IF NOT EXISTS idx_carnets_responsable_id ON public.carnets(assigned_to_responsable_id);

CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL,
    carnet_id UUID NOT NULL REFERENCES public.carnets(id) ON DELETE CASCADE, -- Suppression définitive autorisée
    generation_batch TEXT NOT NULL DEFAULT 'GEN-1',
    series_prefix TEXT,
    qr_payload TEXT,
    price NUMERIC NOT NULL DEFAULT 1000,
    status TEXT NOT NULL DEFAULT 'GENERATED',
    assigned_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_to_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_to_agent_name TEXT,
    assigned_to_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_to_responsable_name TEXT,
    sector_id UUID,
    sale_id UUID,
    plate_number TEXT,
    driver_phone TEXT,
    payment_method TEXT DEFAULT 'ESPECES',
    is_superseded BOOLEAN NOT NULL DEFAULT FALSE,
    superseded_by_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    covered_by_remittance_id UUID,
    control_count INT NOT NULL DEFAULT 0,
    last_controlled_at TIMESTAMPTZ,
    last_controlled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancellation_reason TEXT,
    security_hmac TEXT,
    sold_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tickets
    ADD COLUMN IF NOT EXISTS generation_batch TEXT NOT NULL DEFAULT 'GEN-1',
    ADD COLUMN IF NOT EXISTS series_prefix TEXT,
    ADD COLUMN IF NOT EXISTS qr_payload TEXT,
    ADD COLUMN IF NOT EXISTS assigned_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_to_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_to_agent_name TEXT,
    ADD COLUMN IF NOT EXISTS assigned_to_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_to_responsable_name TEXT,
    ADD COLUMN IF NOT EXISTS sector_id UUID,
    ADD COLUMN IF NOT EXISTS sale_id UUID,
    ADD COLUMN IF NOT EXISTS plate_number TEXT,
    ADD COLUMN IF NOT EXISTS driver_phone TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'ESPECES',
    ADD COLUMN IF NOT EXISTS is_superseded BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS superseded_by_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS covered_by_remittance_id UUID,
    ADD COLUMN IF NOT EXISTS control_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_controlled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_controlled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS security_hmac TEXT,
    ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.tickets SET assigned_responsable_id = assigned_to_responsable_id WHERE assigned_responsable_id IS NULL AND assigned_to_responsable_id IS NOT NULL;
UPDATE public.tickets SET assigned_agent_id = assigned_to_agent_id WHERE assigned_agent_id IS NULL AND assigned_to_agent_id IS NOT NULL;
UPDATE public.carnets SET assigned_to_responsable = assigned_to_responsable_id WHERE assigned_to_responsable IS NULL AND assigned_to_responsable_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_carnet ON public.tickets(carnet_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_responsable ON public.tickets(assigned_responsable_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_agent ON public.tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_agent ON public.tickets(assigned_to_agent_id);

-- -----------------------------------------------------------------------------
-- 3. TABLE: sales (Ventes, Expiration 14 Jours & Moyens de Paiement)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    ticket_number TEXT NOT NULL,
    agent_id UUID NOT NULL REFERENCES public.profiles(id),
    agent_name TEXT NOT NULL,
    responsable_id UUID REFERENCES public.profiles(id),
    plate_number TEXT NOT NULL,
    price NUMERIC NOT NULL DEFAULT 1000,
    payment_method TEXT NOT NULL DEFAULT 'ESPECES' CHECK (payment_method IN ('ESPECES', 'WAVE', 'ORANGE_MONEY', 'MOOV')),
    payment_reference TEXT,
    sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    gps_latitude NUMERIC,
    gps_longitude NUMERIC,
    gps_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_agent ON public.sales(agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_plate ON public.sales(plate_number);
CREATE INDEX IF NOT EXISTS idx_sales_ticket ON public.sales(ticket_number);
CREATE INDEX IF NOT EXISTS idx_sales_expires ON public.sales(expires_at);

-- Trigger auto-calcul d'expiration 14 jours stricts sur les ventes
CREATE OR REPLACE FUNCTION public.trg_compute_sales_expiration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sold_at IS NULL THEN
        NEW.sold_at := NOW();
    END IF;
    IF NEW.expires_at IS NULL OR NEW.expires_at = NEW.sold_at THEN
        NEW.expires_at := NEW.sold_at + INTERVAL '14 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_sales_expiration ON public.sales;
CREATE TRIGGER set_sales_expiration
    BEFORE INSERT OR UPDATE ON public.sales
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_compute_sales_expiration();

-- -----------------------------------------------------------------------------
-- 4. TABLE: remittances (Remises Financières)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.remittances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT UNIQUE NOT NULL,
    agent_id UUID NOT NULL REFERENCES public.profiles(id),
    agent_name TEXT NOT NULL,
    responsable_id UUID REFERENCES public.profiles(id),
    responsable_name TEXT,
    declared_amount NUMERIC NOT NULL,
    validated_amount NUMERIC,
    tickets_count INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (status IN ('EN_ATTENTE', 'VALIDEE', 'REJETEE', 'CORRIGEE')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_remittances_agent ON public.remittances(agent_id);
CREATE INDEX IF NOT EXISTS idx_remittances_responsable ON public.remittances(responsable_id);
CREATE INDEX IF NOT EXISTS idx_remittances_status ON public.remittances(status);

-- -----------------------------------------------------------------------------
-- 5. TABLE: daily_closings (Clôtures & Arrêtés de Caisse)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closing_date DATE NOT NULL,
    responsable_id UUID NOT NULL REFERENCES public.profiles(id),
    responsable_name TEXT NOT NULL,
    total_sales_amount NUMERIC NOT NULL DEFAULT 0,
    total_remittances_amount NUMERIC NOT NULL DEFAULT 0,
    total_expenses_amount NUMERIC NOT NULL DEFAULT 0,
    net_cash_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'CONFIRMED', 'REJECTED')),
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_by UUID REFERENCES public.profiles(id),
    confirmed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON public.daily_closings(closing_date);
CREATE INDEX IF NOT EXISTS idx_daily_closings_responsable ON public.daily_closings(responsable_id);

-- -----------------------------------------------------------------------------
-- 6. TABLE: incidents (Signalements SOS & Incidents Terrain)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id),
    reporter_name TEXT NOT NULL,
    reporter_role TEXT NOT NULL,
    incident_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'MOYENNE' CHECK (severity IN ('FAIBLE', 'MOYENNE', 'HAUTE', 'CRITIQUE')),
    plate_number TEXT,
    ticket_number TEXT,
    suspected_agent_id UUID REFERENCES public.profiles(id),
    description TEXT NOT NULL,
    gps_latitude NUMERIC,
    gps_longitude NUMERIC,
    status TEXT NOT NULL DEFAULT 'OUVERT' CHECK (status IN ('OUVERT', 'EN_COURS', 'RESOLU', 'EVALUED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON public.incidents(reporter_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON public.incidents(created_at);

-- -----------------------------------------------------------------------------
-- 7. TABLE: vehicles & ticket_reprints (Suivi Véhicules & Réimpressions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number TEXT UNIQUE NOT NULL,
    vehicle_type TEXT NOT NULL,
    owner_name TEXT,
    owner_phone TEXT,
    is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    fraud_reason TEXT,
    flagged_by UUID REFERENCES public.profiles(id),
    last_controlled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON public.vehicles(plate_number);

CREATE TABLE IF NOT EXISTS public.ticket_reprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES public.profiles(id),
    requested_by_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 8. TABLE: audit_logs (Journal Immuable Append-Only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    actor_id UUID REFERENCES public.profiles(id),
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id TEXT,
    details TEXT,
    old_value JSONB,
    new_value JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);

-- Trigger pour immuabilité absolue de public.audit_logs (Bloque UPDATE et DELETE)
CREATE OR REPLACE FUNCTION public.trg_prevent_audit_log_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SÉCURITÉ PORTUS: Le journal d audit trail est strictly immuable (UPDATE et DELETE interdits).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_audit_log_mutation ON public.audit_logs;
CREATE TRIGGER prevent_audit_log_mutation
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_prevent_audit_log_tampering();

-- -----------------------------------------------------------------------------
-- 9. ACTIVATION DES POLITIQUES ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_reprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- POLITIQUES RLS: profiles
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lecture profils pour utilisateurs actifs" ON public.profiles;
CREATE POLICY "Lecture profils pour utilisateurs actifs" ON public.profiles
    FOR SELECT TO authenticated
    USING (is_active = TRUE);

DROP POLICY IF EXISTS "Administration profils par Administrateur" ON public.profiles;
CREATE POLICY "Administration profils par Administrateur" ON public.profiles
    FOR ALL TO authenticated
    USING (public.get_current_user_role() = 'ADMINISTRATEUR');

DROP POLICY IF EXISTS "Mise a jour propre profil avatar" ON public.profiles;
CREATE POLICY "Mise a jour propre profil avatar" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- POLITIQUES RLS: carnets
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lecture carnets pour tous les roles autorises" ON public.carnets;
CREATE POLICY "Lecture carnets pour tous les roles autorises" ON public.carnets
    FOR SELECT TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Gestion carnets par Administrateur" ON public.carnets;
CREATE POLICY "Gestion carnets par Administrateur" ON public.carnets
    FOR ALL TO authenticated
    USING (public.get_current_user_role() = 'ADMINISTRATEUR');

DROP POLICY IF EXISTS "Mise a jour carnets par Responsable" ON public.carnets;
CREATE POLICY "Mise a jour carnets par Responsable" ON public.carnets
    FOR UPDATE TO authenticated
    USING (
        public.get_current_user_role() = 'RESPONSABLE' AND
        assigned_to_responsable_id = auth.uid()
    );

-- -----------------------------------------------------------------------------
-- POLITIQUES RLS: tickets
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lecture tickets pour utilisateurs authentifies" ON public.tickets;
CREATE POLICY "Lecture tickets pour utilisateurs authentifies" ON public.tickets
    FOR SELECT TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Gestion tickets par Administrateur" ON public.tickets;
CREATE POLICY "Gestion tickets par Administrateur" ON public.tickets
    FOR ALL TO authenticated
    USING (public.get_current_user_role() = 'ADMINISTRATEUR');

DROP POLICY IF EXISTS "Mise a jour tickets par Responsable et Agent" ON public.tickets;
CREATE POLICY "Mise a jour tickets par Responsable et Agent" ON public.tickets
    FOR UPDATE TO authenticated
    USING (
        public.get_current_user_role() IN ('RESPONSABLE', 'AGENT')
    );

-- -----------------------------------------------------------------------------
-- POLITIQUES RLS: sales
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lecture ventes pour tous" ON public.sales;
CREATE POLICY "Lecture ventes pour tous" ON public.sales
    FOR SELECT TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Insertion ventes par Agents Responsables Admin" ON public.sales;
CREATE POLICY "Insertion ventes par Agents Responsables Admin" ON public.sales
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_current_user_role() IN ('AGENT', 'RESPONSABLE', 'ADMINISTRATEUR')
    );

-- -----------------------------------------------------------------------------
-- POLITIQUES RLS: remittances
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lecture remises pour tous" ON public.remittances;
CREATE POLICY "Lecture remises pour tous" ON public.remittances
    FOR SELECT TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Creation remises par Agents et Responsables" ON public.remittances;
CREATE POLICY "Creation remises par Agents et Responsables" ON public.remittances
    FOR INSERT TO authenticated
    WITH CHECK (
        agent_id = auth.uid() OR public.get_current_user_role() IN ('RESPONSABLE', 'ADMINISTRATEUR')
    );

DROP POLICY IF EXISTS "Validation remises par Responsable et Admin" ON public.remittances;
CREATE POLICY "Validation remises par Responsable et Admin" ON public.remittances
    FOR UPDATE TO authenticated
    USING (
        public.get_current_user_role() IN ('RESPONSABLE', 'ADMINISTRATEUR')
    );

-- -----------------------------------------------------------------------------
-- POLITIQUES RLS: daily_closings
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lecture clotures par tous" ON public.daily_closings;
CREATE POLICY "Lecture clotures par tous" ON public.daily_closings
    FOR SELECT TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Creation clotures par Responsables et Admin" ON public.daily_closings;
CREATE POLICY "Creation clotures par Responsables et Admin" ON public.daily_closings
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_current_user_role() IN ('RESPONSABLE', 'ADMINISTRATEUR')
    );

DROP POLICY IF EXISTS "Verrouillage et Confirmation par Admin Uniquement" ON public.daily_closings;
CREATE POLICY "Verrouillage et Confirmation par Admin Uniquement" ON public.daily_closings
    FOR UPDATE TO authenticated
    USING (
        public.get_current_user_role() = 'ADMINISTRATEUR'
    )
    WITH CHECK (
        public.get_current_user_role() = 'ADMINISTRATEUR'
    );

-- -----------------------------------------------------------------------------
-- POLITIQUES RLS: incidents (SOS)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lecture incidents pour tous" ON public.incidents;
CREATE POLICY "Lecture incidents pour tous" ON public.incidents
    FOR SELECT TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Creation incidents par tous les agents terrain" ON public.incidents;
CREATE POLICY "Creation incidents par tous les agents terrain" ON public.incidents
    FOR INSERT TO authenticated
    WITH CHECK (
        reporter_id = auth.uid()
    );

DROP POLICY IF EXISTS "Resolution incidents par Responsables et Admin" ON public.incidents;
CREATE POLICY "Resolution incidents par Responsables et Admin" ON public.incidents
    FOR UPDATE TO authenticated
    USING (
        public.get_current_user_role() IN ('RESPONSABLE', 'ADMINISTRATEUR')
    );

-- -----------------------------------------------------------------------------
-- POLITIQUES RLS: vehicles (Interdiction Agent de lever la fraude)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lecture vehicules" ON public.vehicles;
CREATE POLICY "Lecture vehicules" ON public.vehicles
    FOR SELECT TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Interdiction aux Agents de modifier la fraude" ON public.vehicles;
CREATE POLICY "Interdiction aux Agents de modifier la fraude" ON public.vehicles
    FOR UPDATE TO authenticated
    USING (
        public.get_current_user_role() IN ('CONTROLEUR', 'RESPONSABLE', 'ADMINISTRATEUR')
    );

-- -----------------------------------------------------------------------------
-- POLITIQUES RLS: ticket_reprints (Interdiction auto-approbation)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lecture réimpressions" ON public.ticket_reprints;
CREATE POLICY "Lecture réimpressions" ON public.ticket_reprints
    FOR SELECT TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Demande réimpression par Agent" ON public.ticket_reprints;
CREATE POLICY "Demande réimpression par Agent" ON public.ticket_reprints
    FOR INSERT TO authenticated
    WITH CHECK (
        requested_by = auth.uid() AND status = 'PENDING'
    );

DROP POLICY IF EXISTS "Approbation réimpression par Responsables et Admin" ON public.ticket_reprints;
CREATE POLICY "Approbation réimpression par Responsables et Admin" ON public.ticket_reprints
    FOR UPDATE TO authenticated
    USING (
        public.get_current_user_role() IN ('RESPONSABLE', 'ADMINISTRATEUR')
    );

-- -----------------------------------------------------------------------------
-- POLITIQUES RLS: audit_logs (Append-Only)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lecture audit_logs" ON public.audit_logs;
CREATE POLICY "Lecture audit_logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "Insertion audit_logs pour tous" ON public.audit_logs;
CREATE POLICY "Insertion audit_logs pour tous" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (TRUE);

COMMIT;
