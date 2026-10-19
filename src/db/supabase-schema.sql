-- ====================================================================
-- SCHEMA POSTGRESQL / SUPABASE SÉCURISÉ & ROBUSTE POUR PORTUS
-- UNION DES JEUNES DU PORT POUR L'ASSISTANCE ET LA SÉCURITÉ (UJPAS)
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TYPES ÉNUMÉRÉS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM (
    'GENERATED',
    'ASSIGNED_TO_RESPONSIBLE',
    'AVAILABLE',
    'ASSIGNED_TO_AGENT',
    'SOLD',
    'CONTROLLED',
    'SUPERSEDED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE fraud_reason AS ENUM (
    'FAUX_TICKET',
    'IMMATRICULATION_NON_CONFORME',
    'TICKET_EXPIRE',
    'REUTILISATION_FRAUDULEUSE',
    'CAMION_DIFFERENT',
    'TICKET_SUSPECT',
    'TICKET_FALSIFIE',
    'TICKET_DEJA_PRESENTE',
    'AUTRE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE sync_status_enum AS ENUM (
    'PENDING',
    'PROCESSING',
    'SYNCED',
    'FAILED',
    'CONFLICT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notification_level AS ENUM (
    'INFO',
    'WARNING',
    'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. TABLE DES RÔLES & PERMISSIONS
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name user_role NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.roles (name, label, description, permissions)
VALUES 
  ('ADMINISTRATEUR', 'Administrateur Général', 'Gestion globale, paramétrages, générations de carnets, corrections exceptionnelles et audit.', '["ALL"]'::jsonb),
  ('RESPONSABLE', 'Responsable de Secteur', 'Supervision du secteur de Vridi, distribution de carnets/tickets, réattribution des invendus, enregistrement des remises.', '["SECTOR_MANAGE", "DISTRIBUTE_TICKETS", "REASSIGN_UNSOLD", "RECORD_REMITTANCE", "VIEW_SECTOR_REPORTS"]'::jsonb),
  ('AGENT', 'Agent Percepteur Terrain', 'Vente exclusive des tickets attribués, encaissement (5 000 FCFA), déclaration d''immatriculation et mode hors-ligne.', '["SELL_ASSIGNED_TICKETS", "VIEW_OWN_SALES", "CHECK_PLATE"]'::jsonb),
  ('CONTROLEUR', 'Contrôleur Routier', 'Contrôle de conformité sur le corridor portuaire, vérification QR code/immatriculation et signalement de fraudes.', '["VERIFY_TICKETS", "RECORD_CONTROL", "REPORT_FRAUD"]'::jsonb)
ON CONFLICT (name) DO UPDATE SET 
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions;

-- 4. TABLE SECTEURS
CREATE TABLE IF NOT EXISTS public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.sectors (code, name, description)
VALUES 
  ('VRD-PORT', 'VRIDI PORT', 'Zone principale du terminal à conteneurs et quais portuaires'),
  ('VRD-CANAL', 'VRIDI CANAL', 'Axe de transit du canal et dépôts logistiques'),
  ('VRD-ZONE-IND', 'VRIDI ZONE INDUSTRIELLE', 'Secteur des usines, raffineries et entrepôts de stockage'),
  ('VRD-TERMINAL', 'VRIDI TERMINAL SUD', 'Zone tampon des poids lourds et camions citernes')
ON CONFLICT (code) DO NOTHING;

-- 5. TABLE PROFILS UTILISATEURS
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'AGENT',
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  phone TEXT,
  matricule TEXT,
  brigade TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS matricule TEXT, ADD COLUMN IF NOT EXISTS brigade TEXT;

-- 6. TABLE LOGIN_ATTEMPTS
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_successful BOOLEAN NOT NULL,
  failure_reason TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. TABLE CARNETS (Status aligné avec TypeScript)
CREATE TABLE IF NOT EXISTS public.carnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carnet_number TEXT NOT NULL UNIQUE,
  series_prefix TEXT NOT NULL DEFAULT 'VRD',
  generation_batch TEXT NOT NULL DEFAULT 'GEN-1',
  size INT NOT NULL CHECK (size > 0 AND size % 3 = 0),
  start_number INT NOT NULL CHECK (start_number > 0),
  end_number INT NOT NULL CHECK (end_number >= start_number),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  assigned_to_responsable UUID REFERENCES public.profiles(id),
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'ASSIGNED', 'EXHAUSTED', 'GENERATED', 'ASSIGNED_TO_RESPONSIBLE', 'PARTIALLY_SOLD', 'SOLD_OUT', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_carnet_size_match CHECK (end_number - start_number + 1 = size)
);

-- 8. TABLE TICKETS
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL,
  carnet_id UUID NOT NULL REFERENCES public.carnets(id) ON DELETE RESTRICT,
  generation_batch TEXT NOT NULL DEFAULT 'GEN-1',
  qr_payload TEXT NOT NULL,
  status ticket_status NOT NULL DEFAULT 'GENERATED',
  price INT NOT NULL DEFAULT 5000 CHECK (price >= 0),
  assigned_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  
  sale_id UUID,
  sold_at TIMESTAMPTZ,
  plate_number TEXT,
  driver_phone TEXT,
  is_superseded BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_by_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  superseded_by_ticket_number TEXT,
  covered_by_remittance_id UUID,

  control_count INT NOT NULL DEFAULT 0 CHECK (control_count >= 0),
  last_controlled_at TIMESTAMPTZ,
  last_controlled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_ticket_generation_number UNIQUE (generation_batch, ticket_number),
  CONSTRAINT chk_ticket_sold_coherence CHECK (
    (status != 'SOLD') OR (sold_at IS NOT NULL AND plate_number IS NOT NULL)
  ),
  CONSTRAINT chk_ticket_cancelled_coherence CHECK (
    (status != 'CANCELLED') OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
  )
);

-- 9. TABLE TICKET_ASSIGNMENTS
CREATE TABLE IF NOT EXISTS public.ticket_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  carnet_id UUID REFERENCES public.carnets(id) ON DELETE SET NULL,
  from_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('RESPONSABLE_ASSIGNMENT', 'AGENT_ASSIGNMENT', 'REASSIGNMENT', 'RETURN')),
  notes TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. TABLE TICKET_STATUS_HISTORY
CREATE TABLE IF NOT EXISTS public.ticket_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  old_status ticket_status,
  new_status ticket_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT
);

-- 11. TABLE SALES
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE RESTRICT,
  ticket_number TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  plate_number TEXT NOT NULL,
  driver_phone TEXT,
  sold_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_idempotency_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  gps_latitude NUMERIC(9, 6),
  gps_longitude NUMERIC(9, 6),
  gps_accuracy NUMERIC(8, 2),
  gps_status TEXT NOT NULL DEFAULT 'UNAVAILABLE' CHECK (gps_status IN ('AVAILABLE', 'UNAVAILABLE')),
  price INT NOT NULL DEFAULT 5000 CHECK (price >= 0),
  covered_by_remittance_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. TABLE REMITTANCES
CREATE TABLE IF NOT EXISTS public.remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  responsable_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE RESTRICT,
  amount INT NOT NULL CHECK (amount > 0),
  tickets_count INT NOT NULL CHECK (tickets_count >= 0),
  ticket_ids_covered UUID[] NOT NULL DEFAULT '{}',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time TIME NOT NULL DEFAULT CURRENT_TIME,
  note TEXT,
  is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. TABLE REMITTANCE_ADJUSTMENTS
CREATE TABLE IF NOT EXISTS public.remittance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id UUID NOT NULL REFERENCES public.remittances(id) ON DELETE RESTRICT,
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 5),
  old_amount INT NOT NULL,
  new_amount INT NOT NULL CHECK (new_amount > 0),
  old_note TEXT,
  new_note TEXT,
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. TABLE CONTROLS
CREATE TABLE IF NOT EXISTS public.controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  ticket_number TEXT NOT NULL,
  plate_number TEXT NOT NULL,
  controleur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  controlled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_valid BOOLEAN NOT NULL,
  validation_message TEXT NOT NULL,
  gps_latitude NUMERIC(9, 6),
  gps_longitude NUMERIC(9, 6),
  gps_accuracy NUMERIC(8, 2),
  gps_status TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  sync_idempotency_key UUID UNIQUE DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. TABLE FRAUD_REPORTS
CREATE TABLE IF NOT EXISTS public.fraud_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  ticket_number TEXT,
  plate_number TEXT NOT NULL,
  controleur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason fraud_reason NOT NULL,
  comment TEXT NOT NULL,
  photo_url TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gps_latitude NUMERIC(9, 6),
  gps_longitude NUMERIC(9, 6),
  gps_accuracy NUMERIC(8, 2),
  gps_status TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. TABLE NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  level notification_level NOT NULL DEFAULT 'INFO',
  type TEXT NOT NULL CHECK (type IN ('FINANCIAL_ALERT', 'ASSIGNMENT', 'SYSTEM', 'FRAUD_ALERT', 'REMITTANCE')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. TABLE AUDIT_LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  actor_role user_role NOT NULL,
  action TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_entity TEXT NOT NULL,
  target_id TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  gps_latitude NUMERIC(9, 6),
  gps_longitude NUMERIC(9, 6),
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. TABLE SYNC_QUEUE
CREATE TABLE IF NOT EXISTS public.sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_mutation_id UUID NOT NULL UNIQUE,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('SALE', 'CONTROL', 'FRAUD_REPORT', 'REMITTANCE')),
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE')),
  payload JSONB NOT NULL,
  status sync_status_enum NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  client_timestamp TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. TABLE APP_SETTINGS
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('ticket_price_fcfa', '5000'::jsonb, 'Prix fixe unitaire de la taxe de stationnement en FCFA'),
  ('ticket_validity_days', '7'::jsonb, 'Durée de validité d''un ticket avant alerte (jours)'),
  ('carnet_size_multiple', '3'::jsonb, 'Multiple obligatoire pour la taille d''un carnet de tickets'),
  ('server_hmac_signing_key', '"PORTUS_SECURE_HMAC_SECRET_2026_VRIDI"'::jsonb, 'Clé secrète HMAC pour la signature cryptographique des QR codes (protégée par RLS)')
ON CONFLICT (key) DO NOTHING;

-- 20. TABLE EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number TEXT,
  title TEXT,
  category TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  beneficiary TEXT,
  payment_method TEXT DEFAULT 'ESPECES',
  expense_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'APPROVED',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  responsible_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  cancellation_reason TEXT,
  correction_reason TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- ACTIVATION RLS SUR TOUTES LES 20 TABLES DE PORTUS
-- ====================================================================
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- POLITIQUES RLS CRITIQUES & SÉCURISATION app_settings (CLÉ HMAC)
-- ====================================================================
DROP POLICY IF EXISTS "Protect secret hmac in app_settings" ON public.app_settings;
CREATE POLICY "Protect secret hmac in app_settings" ON public.app_settings
  FOR ALL TO PUBLIC
  USING (key != 'server_hmac_signing_key' OR public.is_admin())
  WITH CHECK (public.is_admin());

-- Fonctions SECURITY DEFINER utilitaires
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp;

CREATE OR REPLACE FUNCTION public.get_current_sector_id()
RETURNS UUID AS $$
DECLARE
  v_sector_id UUID;
BEGIN
  SELECT sector_id INTO v_sector_id FROM public.profiles WHERE id = auth.uid();
  RETURN v_sector_id;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'ADMINISTRATEUR' AND is_active = TRUE
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp;

CREATE OR REPLACE FUNCTION public.is_responsable()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'RESPONSABLE' AND is_active = TRUE
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp;

-- VERROUILLAGE ET REVOCATION DES PRIVILÈGES PUBLICS SUR LES FONCTIONS SENSIBLES
REVOKE ALL ON FUNCTION public.sign_ticket_canonical(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_operational_database(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resign_all_existing_tickets() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_username_for_auth(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_login_attempt(TEXT, BOOLEAN, UUID, TEXT, TEXT) FROM PUBLIC, anon;

-- POLITIQUE RLS POUR 'profiles' (Correction exposition complète)
DROP POLICY IF EXISTS "Admin full access profiles" ON public.profiles;
CREATE POLICY "Admin full access profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Responsable read sector profiles" ON public.profiles;
CREATE POLICY "Responsable read sector profiles" ON public.profiles FOR SELECT TO authenticated
  USING (
    public.is_admin() OR 
    (public.is_responsable() AND (sector_id = public.get_current_sector_id() OR id = auth.uid())) OR
    id = auth.uid()
  );

DROP POLICY IF EXISTS "User read own profile" ON public.profiles;
CREATE POLICY "User read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin() OR (public.is_responsable() AND sector_id = public.get_current_sector_id()));

-- POLITIQUES RLS POUR RESPONSABLE (carnets, tickets, sales, remittances, expenses)
DROP POLICY IF EXISTS "Admin full access carnets" ON public.carnets;
CREATE POLICY "Admin full access carnets" ON public.carnets FOR ALL TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Responsable read/manage sector carnets" ON public.carnets;
CREATE POLICY "Responsable read/manage sector carnets" ON public.carnets FOR ALL TO authenticated
  USING (public.is_responsable() AND (assigned_to_responsable = auth.uid() || sector_id = public.get_current_sector_id()));

DROP POLICY IF EXISTS "Admin full access tickets" ON public.tickets;
CREATE POLICY "Admin full access tickets" ON public.tickets FOR ALL TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Responsable read sector tickets" ON public.tickets;
CREATE POLICY "Responsable read sector tickets" ON public.tickets FOR SELECT TO authenticated
  USING (public.is_responsable() AND (assigned_responsable_id = auth.uid() || sector_id = public.get_current_sector_id()));

DROP POLICY IF EXISTS "Admin full access sales" ON public.sales;
CREATE POLICY "Admin full access sales" ON public.sales FOR ALL TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Responsable read sector sales" ON public.sales;
CREATE POLICY "Responsable read sector sales" ON public.sales FOR SELECT TO authenticated
  USING (public.is_responsable() AND (sector_id = public.get_current_sector_id() || agent_id IN (SELECT id FROM public.profiles WHERE sector_id = public.get_current_sector_id())));

DROP POLICY IF EXISTS "Admin full access remittances" ON public.remittances;
CREATE POLICY "Admin full access remittances" ON public.remittances FOR ALL TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Responsable manage sector remittances" ON public.remittances;
CREATE POLICY "Responsable manage sector remittances" ON public.remittances FOR ALL TO authenticated
  USING (public.is_responsable() AND (responsable_id = auth.uid() || sector_id = public.get_current_sector_id()));

DROP POLICY IF EXISTS "Admin full access expenses" ON public.expenses;
CREATE POLICY "Admin full access expenses" ON public.expenses FOR ALL TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Responsable manage sector expenses" ON public.expenses;
CREATE POLICY "Responsable manage sector expenses" ON public.expenses FOR ALL TO authenticated
  USING (public.is_responsable() AND (responsible_id = auth.uid() || sector_id = public.get_current_sector_id()));

-- ====================================================================
-- RÈGLE D'EXPIRATION DE 7 JOURS DANS verify_ticket_secure
-- ====================================================================
CREATE OR REPLACE FUNCTION public.verify_ticket_secure(
  p_ticket_number TEXT,
  p_plate_number TEXT,
  p_signature TEXT,
  p_controleur_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_ticket public.tickets%ROWTYPE;
  v_is_valid BOOLEAN := TRUE;
  v_status_code TEXT := 'VALID';
  v_message TEXT := 'Ticket valide et conforme.';
  v_secret TEXT;
  v_expected_signature TEXT;
BEGIN
  SELECT * INTO v_ticket FROM public.tickets WHERE ticket_number = p_ticket_number LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'status_code', 'TICKET_NOT_FOUND',
      'message', 'Ticket introuvable dans la base officielle de Portus.'
    );
  END IF;

  -- Règle d'expiration de 7 jours après la vente
  IF v_ticket.sold_at IS NOT NULL AND v_ticket.sold_at < (NOW() - INTERVAL '7 days') THEN
    v_status_code := 'VALIDITY_EXPIRED';
    v_message := 'Ticket expiré : la durée de validité réglementaire de 7 jours est dépassée.';
    v_is_valid := FALSE;
  ELSIF v_ticket.status = 'CANCELLED' THEN
    v_status_code := 'CANCELLED';
    v_message := 'Ce ticket a été annulé administrativement.';
    v_is_valid := FALSE;
  ELSIF v_ticket.status = 'GENERATED' OR v_ticket.status = 'ASSIGNED_TO_RESPONSIBLE' OR v_ticket.status = 'AVAILABLE' OR v_ticket.status = 'ASSIGNED_TO_AGENT' THEN
    v_status_code := 'NOT_SOLD';
    v_message := 'Ticket non vendu (attribué mais non perçu sur le terrain).';
    v_is_valid := FALSE;
  END IF;

  -- Enregistrement du contrôle
  INSERT INTO public.controls (
    ticket_id, ticket_number, plate_number, controleur_id, is_valid, validation_message
  ) VALUES (
    v_ticket.id, p_ticket_number, p_plate_number, p_controleur_id, v_is_valid, v_message
  );

  RETURN jsonb_build_object(
    'valid', v_is_valid,
    'status_code', v_status_code,
    'message', v_message,
    'ticket_number', v_ticket.ticket_number,
    'plate_number', v_ticket.plate_number,
    'sold_at', v_ticket.sold_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- CORRECTION DE reset_operational_database (Colonnes exactes audit_logs)
-- ====================================================================
CREATE OR REPLACE FUNCTION public.reset_operational_database(
  p_admin_id UUID,
  p_admin_name TEXT,
  p_reason TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Suppression des données opérationnelles (sans toucher aux tables de référence ni aux logs d'audit)
  DELETE FROM public.sales;
  DELETE FROM public.controls;
  DELETE FROM public.fraud_reports;
  DELETE FROM public.remittances;
  DELETE FROM public.ticket_status_history;
  DELETE FROM public.ticket_assignments;
  DELETE FROM public.tickets;
  DELETE FROM public.carnets;

  -- Insertion d'une trace d'audit avec les colonnes exactes
  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_role, action, timestamp, target_entity, target_id, details
  ) VALUES (
    p_admin_id, p_admin_name, 'ADMINISTRATEUR', 'RESET_OPERATIONAL_DATABASE', NOW(), 'DATABASE', 'ALL', p_reason
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- OPTIMISATION ENSEMBLISTE DE resign_all_existing_tickets
-- ====================================================================
CREATE OR REPLACE FUNCTION public.resign_all_existing_tickets()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE public.tickets t
  SET 
    qr_payload = 'PORTUS-SIG-' || t.ticket_number || '-' || c.generation_batch,
    updated_at = NOW()
  FROM public.carnets c
  WHERE c.id = t.carnet_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
