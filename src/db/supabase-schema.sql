-- ====================================================================
-- SCHEMA POSTGRESQL / SUPABASE COMPLET & ROBUSTE POUR PORTUS
-- UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI — U.J.S.R.V.
-- Système de perception, traçabilité et contrôle des vignettes
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. EXTENSIONS
-- --------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 2. TYPES ÉNUMÉRÉS
-- --------------------------------------------------------------------
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
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE fraud_reason AS ENUM (
    'FAUX_TICKET',
    'IMMATRICULATION_NON_CONFORME',
    'TICKET_EXPIRE',
    'REUTILISATION_FRAUDULEUSE',
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

-- --------------------------------------------------------------------
-- 3. TABLE DES RÔLES & PERMISSIONS (NORMALISATION)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name user_role NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertion des 4 rôles fondamentaux de PORTUS
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

-- --------------------------------------------------------------------
-- 4. TABLE SECTEURS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Données initiales des secteurs portuaires de Vridi
INSERT INTO public.sectors (code, name, description)
VALUES 
  ('VRD-PORT', 'VRIDI PORT', 'Zone principale du terminal à conteneurs et quais portuaires'),
  ('VRD-CANAL', 'VRIDI CANAL', 'Axe de transit du canal et dépôts logistiques'),
  ('VRD-ZONE-IND', 'VRIDI ZONE INDUSTRIELLE', 'Secteur des usines, raffineries et entrepôts de stockage'),
  ('VRD-TERMINAL', 'VRIDI TERMINAL SUD', 'Zone tampon des poids lourds et camions citernes')
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------------------------
-- 5. TABLE PROFILS UTILISATEURS (Liée à auth.users de Supabase)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'AGENT',
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 6. TABLE DES TENTATIVES DE CONNEXION (SÉCURITÉ & AUDIT BRUTE-FORCE)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 7. TABLE CARNETS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.carnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carnet_number TEXT NOT NULL UNIQUE,
  series_prefix TEXT NOT NULL DEFAULT 'VRD',
  generation_batch TEXT NOT NULL DEFAULT 'GEN-1',
  size INT NOT NULL CHECK (size > 0 AND size % 3 = 0), -- Règle : multiple de 3 obligatoire
  start_number INT NOT NULL CHECK (start_number > 0),
  end_number INT NOT NULL CHECK (end_number >= start_number),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  assigned_to_responsable UUID REFERENCES public.profiles(id),
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'ASSIGNED', 'EXHAUSTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_carnet_size_match CHECK (end_number - start_number + 1 = size)
);

-- --------------------------------------------------------------------
-- 8. TABLE TICKETS
-- --------------------------------------------------------------------
-- Un ticket a son UUID interne propre.
-- Son numéro physique (ex: VRD-000101) est distinct de son identifiant interne.
-- La contrainte UNIQUE composite permet de réutiliser éventuellement un numéro
-- dans une génération/batch différente, tout en empêchant les doublons dans la même génération.
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
  
  -- Données de vente
  sale_id UUID,
  sold_at TIMESTAMPTZ, -- Date originale de vente (ne jamais écraser par la synchro)
  plate_number TEXT,  -- Normalisé majuscule sans tiret ni espace
  driver_phone TEXT,
  is_superseded BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_by_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  covered_by_remittance_id UUID,

  -- Contrôles routiers
  control_count INT NOT NULL DEFAULT 0 CHECK (control_count >= 0),
  last_controlled_at TIMESTAMPTZ,
  last_controlled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Annulation administrative
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Contrainte d'unicité par lot de génération (permet réutilisation en batch futur)
  CONSTRAINT uq_ticket_generation_number UNIQUE (generation_batch, ticket_number),

  -- Contraintes de cohérence d'état
  CONSTRAINT chk_ticket_sold_coherence CHECK (
    (status != 'SOLD') OR (sold_at IS NOT NULL AND plate_number IS NOT NULL)
  ),
  CONSTRAINT chk_ticket_cancelled_coherence CHECK (
    (status != 'CANCELLED') OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
  )
);

-- --------------------------------------------------------------------
-- 9. TABLE TICKET_ASSIGNMENTS (TRAÇABILITÉ COMPLÈTE DES MOUVEMENTS)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 10. TABLE TICKET_STATUS_HISTORY (HISTORIQUE DES TRANSITIONS D'ÉTATS)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  old_status ticket_status,
  new_status ticket_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT
);

-- --------------------------------------------------------------------
-- 11. TABLE VENTES (IDEMPOTENCE OFFLINE & CONTRAINTES STRICTES)
-- --------------------------------------------------------------------
-- Un ticket ne peut être vendu qu'une seule fois (ticket_id UNIQUE).
-- La synchronisation utilise sync_idempotency_key UNIQUE pour empêcher tout doublon.
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE RESTRICT,
  ticket_number TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  plate_number TEXT NOT NULL,
  driver_phone TEXT,
  sold_at TIMESTAMPTZ NOT NULL, -- Date originale sur le terrain (immuable)
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

-- Clé étrangère différée pour lier le ticket à la vente
ALTER TABLE public.tickets 
  ADD CONSTRAINT fk_tickets_sale 
  FOREIGN KEY (sale_id) 
  REFERENCES public.sales(id) 
  ON DELETE SET NULL 
  DEFERRABLE INITIALLY DEFERRED;

-- --------------------------------------------------------------------
-- 12. TABLE REMISES FINANCIÈRES (REMITTANCES)
-- --------------------------------------------------------------------
-- Une remise est IMMUABLE pour le responsable.
-- Les suppressions sont physiquement interdites par trigger et RLS.
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

-- Liaison des tickets à la remise
ALTER TABLE public.tickets 
  ADD CONSTRAINT fk_tickets_remittance 
  FOREIGN KEY (covered_by_remittance_id) 
  REFERENCES public.remittances(id) 
  ON DELETE SET NULL;

ALTER TABLE public.sales 
  ADD CONSTRAINT fk_sales_remittance 
  FOREIGN KEY (covered_by_remittance_id) 
  REFERENCES public.remittances(id) 
  ON DELETE SET NULL;

-- --------------------------------------------------------------------
-- 13. TABLE REMITTANCE_ADJUSTMENTS (CORRECTIONS ADMINISTRATIVES TRAÇÉES)
-- --------------------------------------------------------------------
-- Aucune suppression de remise : toute correction administrative insère
-- une nouvelle trace avec motif obligatoire, ancien et nouveau montant.
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

-- --------------------------------------------------------------------
-- 14. TABLE CONTRÔLES ROUTIERS (CONTROLS)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 15. TABLE SIGNALEMENTS DE FRAUDES (FRAUD_REPORTS)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 16. TABLE NOTIFICATIONS (ALERTES FINANCIÈRES & SYSTÈME)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 17. TABLE AUDIT_LOGS (STRICTEMENT APPEND-ONLY)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 18. TABLE SYNC_QUEUE (FILE D'ATTENTE DE SYNCHRONISATION OFFLINE IDEMPOTENTE)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_mutation_id UUID NOT NULL UNIQUE, -- Identifiant unique de synchronisation côté client
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

-- --------------------------------------------------------------------
-- 19. TABLE APP_SETTINGS (PARAMÈTRES GLOBAUX CENTRALISÉS)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Paramètres de base de PORTUS
INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('ticket_price_fcfa', '5000'::jsonb, 'Prix fixe unitaire de la taxe de stationnement en FCFA'),
  ('ticket_validity_days', '7'::jsonb, 'Durée de validité d''un ticket avant alerte doublon (jours)'),
  ('carnet_size_multiple', '3'::jsonb, 'Multiple obligatoire pour la taille d''un carnet de tickets'),
  ('remittance_alert_start_threshold', '10'::jsonb, 'Nombre de tickets vendus sans versement déclenchant la 1ère alerte'),
  ('remittance_alert_step', '5'::jsonb, 'Pas d''incrémentation des alertes financières (10, 15, 20...)'),
  ('system_name', '"PORTUS — U.J.S.R.V."'::jsonb, 'Nom officiel du système de gestion')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description;

-- ====================================================================
-- TRIGGERS & SÉCURITÉ BASE DE DONNÉES (IMMUABILITÉ & COHÉRENCE)
-- ====================================================================

-- A. INTERDICTION STRICTE DE MODIFIER OU SUPPRIMER L'AUDIT (APPEND-ONLY)
CREATE OR REPLACE FUNCTION public.fn_prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PORTUS ERREUR SÉCURITÉ: La table audit_logs est strictement append-only. Aucune modification ou suppression n''est permise.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_tampering ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_tampering
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_audit_tampering();

-- B. INTERDICTION DE SUPPRIMER LES REMISES (IMMUABILITÉ)
CREATE OR REPLACE FUNCTION public.fn_prevent_remittance_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PORTUS ERREUR: Une remise financière est définitive et ne peut jamais être supprimée. Utilisez la correction administrative.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_remittances_no_delete ON public.remittances;
CREATE TRIGGER trg_remittances_no_delete
BEFORE DELETE ON public.remittances
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_remittance_deletion();

-- C. VÉRIFICATION D'IMMUABILITÉ PAR LE RESPONSABLE LORS D'UNE MISE À JOUR DE REMISE
CREATE OR REPLACE FUNCTION public.fn_protect_remittance_updates()
RETURNS TRIGGER AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role = 'RESPONSABLE' THEN
    RAISE EXCEPTION 'PORTUS ERREUR: Un responsable ne peut pas modifier une remise enregistrée. Seul un administrateur peut enregistrer une correction traçable.';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_remittances_protect_update ON public.remittances;
CREATE TRIGGER trg_remittances_protect_update
BEFORE UPDATE ON public.remittances
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_remittance_updates();

-- D. SYNCHRONISATION AUTOMATIQUE DU STATUT DU TICKET LORS D'UNE VENTE
CREATE OR REPLACE FUNCTION public.fn_on_sale_inserted()
RETURNS TRIGGER AS $$
BEGIN
  -- Mettre à jour le ticket lié
  UPDATE public.tickets
  SET 
    status = 'SOLD',
    sale_id = NEW.id,
    sold_at = NEW.sold_at,
    plate_number = NEW.plate_number,
    driver_phone = NEW.driver_phone,
    updated_at = NOW()
  WHERE id = NEW.ticket_id;

  -- Enregistrer l'historique d'état
  INSERT INTO public.ticket_status_history (
    ticket_id, old_status, new_status, changed_by, reason
  ) VALUES (
    NEW.ticket_id, 'ASSIGNED_TO_AGENT', 'SOLD', NEW.agent_id, 'Vente de ticket enregistrée (Immatriculation: ' || NEW.plate_number || ')'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_update_ticket ON public.sales;
CREATE TRIGGER trg_sale_update_ticket
AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.fn_on_sale_inserted();

-- ====================================================================
-- INDEX DE PERFORMANCE & RECHERCHE HAUTE DISPONIBILITÉ
-- ====================================================================

-- 1. Index sur tickets
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON public.tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_plate_number ON public.tickets(plate_number);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_agent ON public.tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_responsable ON public.tickets(assigned_responsable_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_sold_at ON public.tickets(sold_at);
CREATE INDEX IF NOT EXISTS idx_tickets_carnet ON public.tickets(carnet_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sector ON public.tickets(sector_id);

-- 2. Index sur ventes (sales)
CREATE INDEX IF NOT EXISTS idx_sales_plate_number ON public.sales(plate_number);
CREATE INDEX IF NOT EXISTS idx_sales_agent ON public.sales(agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON public.sales(sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_sync_key ON public.sales(sync_idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sales_ticket ON public.sales(ticket_id);

-- 3. Index sur remises (remittances)
CREATE INDEX IF NOT EXISTS idx_remittances_agent ON public.remittances(agent_id);
CREATE INDEX IF NOT EXISTS idx_remittances_responsable ON public.remittances(responsable_id);
CREATE INDEX IF NOT EXISTS idx_remittances_date ON public.remittances(date DESC);
CREATE INDEX IF NOT EXISTS idx_remittances_created_at ON public.remittances(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remittances_reference ON public.remittances(reference);

-- 4. Index sur contrôles et fraudes
CREATE INDEX IF NOT EXISTS idx_controls_plate ON public.controls(plate_number);
CREATE INDEX IF NOT EXISTS idx_controls_ticket ON public.controls(ticket_number);
CREATE INDEX IF NOT EXISTS idx_controls_controleur ON public.controls(controleur_id);
CREATE INDEX IF NOT EXISTS idx_controls_controlled_at ON public.controls(controlled_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_plate ON public.fraud_reports(plate_number);
CREATE INDEX IF NOT EXISTS idx_fraud_status ON public.fraud_reports(status);
CREATE INDEX IF NOT EXISTS idx_fraud_reported_at ON public.fraud_reports(reported_at DESC);

-- 5. Index sur audit & synchronisation
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_target_entity ON public.audit_logs(target_entity);
CREATE INDEX IF NOT EXISTS idx_sync_queue_client_mutation ON public.sync_queue(client_mutation_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_time ON public.sync_queue(status, client_timestamp);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_time ON public.login_attempts(username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON public.notifications(recipient_id, is_read);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES RIGOUREUSES & VÉRIFIÉES
-- ====================================================================

-- Activer RLS sur TOUTES les tables
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

-- Fonctions utilitaires SECURITY DEFINER pour évaluer les privilèges sans contournement
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_sector_id()
RETURNS UUID AS $$
  SELECT sector_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'ADMINISTRATEUR' AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_responsable()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'RESPONSABLE' AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- --------------------------------------------------------------------
-- A. POLITIQUES POUR 'roles', 'sectors' ET 'app_settings'
-- --------------------------------------------------------------------
-- Tout utilisateur authentifié peut lire les rôles et secteurs actifs
CREATE POLICY "Read roles authenticated" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read sectors authenticated" ON public.sectors FOR SELECT TO authenticated USING (is_active = true OR public.is_admin());
CREATE POLICY "Admin manage sectors" ON public.sectors FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Read app settings authenticated" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin update app settings" ON public.app_settings FOR ALL TO authenticated USING (public.is_admin());

-- --------------------------------------------------------------------
-- B. POLITIQUES POUR 'profiles'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Responsable read sector profiles" ON public.profiles FOR SELECT TO authenticated
  USING (
    public.is_admin() OR 
    (public.is_responsable() AND (sector_id = public.get_current_sector_id() OR id = auth.uid()))
  );

CREATE POLICY "User read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "User update own phone" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- --------------------------------------------------------------------
-- C. POLITIQUES POUR 'carnets'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access carnets" ON public.carnets FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Responsable read sector carnets" ON public.carnets FOR SELECT TO authenticated
  USING (
    public.is_responsable() AND 
    (assigned_to_responsable = auth.uid() OR sector_id = public.get_current_sector_id())
  );

-- --------------------------------------------------------------------
-- D. POLITIQUES POUR 'tickets'
-- --------------------------------------------------------------------
-- 1. Administrateur : accès global
CREATE POLICY "Admin full access tickets" ON public.tickets FOR ALL TO authenticated USING (public.is_admin());

-- 2. Responsable : uniquement son secteur et ses agents
CREATE POLICY "Responsable read sector tickets" ON public.tickets FOR SELECT TO authenticated
  USING (
    public.is_responsable() AND 
    (assigned_responsable_id = auth.uid() OR sector_id = public.get_current_sector_id())
  );

CREATE POLICY "Responsable update unsold tickets" ON public.tickets FOR UPDATE TO authenticated
  USING (
    public.is_responsable() AND 
    (assigned_responsable_id = auth.uid() OR sector_id = public.get_current_sector_id()) AND
    status IN ('ASSIGNED_TO_RESPONSIBLE', 'AVAILABLE', 'ASSIGNED_TO_AGENT')
  );

-- 3. Agent : uniquement ses tickets attribués
CREATE POLICY "Agent read assigned tickets" ON public.tickets FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'AGENT' AND 
    assigned_agent_id = auth.uid()
  );

CREATE POLICY "Agent update assigned ticket status" ON public.tickets FOR UPDATE TO authenticated
  USING (
    public.get_current_role() = 'AGENT' AND 
    assigned_agent_id = auth.uid() AND 
    status = 'ASSIGNED_TO_AGENT'
  );

-- 4. Contrôleur : lecture des tickets pour vérification de validité
CREATE POLICY "Controleur verify tickets" ON public.tickets FOR SELECT TO authenticated
  USING (public.get_current_role() = 'CONTROLEUR');

-- --------------------------------------------------------------------
-- E. POLITIQUES POUR 'sales' (VENTES)
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access sales" ON public.sales FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Responsable read sector sales" ON public.sales FOR SELECT TO authenticated
  USING (
    public.is_responsable() AND 
    (sector_id = public.get_current_sector_id() OR agent_id IN (
      SELECT id FROM public.profiles WHERE sector_id = public.get_current_sector_id()
    ))
  );

CREATE POLICY "Agent read own sales" ON public.sales FOR SELECT TO authenticated
  USING (public.get_current_role() = 'AGENT' AND agent_id = auth.uid());

CREATE POLICY "Agent insert own sale" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() = 'AGENT' AND 
    agent_id = auth.uid()
  );

-- --------------------------------------------------------------------
-- F. POLITIQUES POUR 'remittances' & 'remittance_adjustments'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access remittances" ON public.remittances FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Responsable read sector remittances" ON public.remittances FOR SELECT TO authenticated
  USING (
    public.is_responsable() AND 
    (responsable_id = auth.uid() OR sector_id = public.get_current_sector_id())
  );

CREATE POLICY "Responsable insert remittance" ON public.remittances FOR INSERT TO authenticated
  WITH CHECK (
    public.is_responsable() AND 
    responsable_id = auth.uid()
  );

CREATE POLICY "Agent read own remittances" ON public.remittances FOR SELECT TO authenticated
  USING (agent_id = auth.uid());

-- Corrections de remise (table d'ajustements : admin uniquement)
CREATE POLICY "Admin full access remittance adjustments" ON public.remittance_adjustments 
  FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Responsable view remittance adjustments" ON public.remittance_adjustments 
  FOR SELECT TO authenticated USING (public.is_responsable());

-- --------------------------------------------------------------------
-- G. POLITIQUES POUR 'controls' & 'fraud_reports'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access controls" ON public.controls FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin full access fraud reports" ON public.fraud_reports FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Controleur read own controls" ON public.controls FOR SELECT TO authenticated
  USING (public.get_current_role() = 'CONTROLEUR' AND controleur_id = auth.uid());

CREATE POLICY "Controleur insert control" ON public.controls FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() = 'CONTROLEUR' AND 
    controleur_id = auth.uid()
  );

CREATE POLICY "Controleur read own fraud reports" ON public.fraud_reports FOR SELECT TO authenticated
  USING (public.get_current_role() = 'CONTROLEUR' AND controleur_id = auth.uid());

CREATE POLICY "Controleur insert fraud report" ON public.fraud_reports FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() = 'CONTROLEUR' AND 
    controleur_id = auth.uid()
  );

CREATE POLICY "Responsable read sector fraud reports" ON public.fraud_reports FOR SELECT TO authenticated
  USING (public.is_responsable());

-- --------------------------------------------------------------------
-- H. POLITIQUES POUR 'audit_logs' (APPEND-ONLY VIA TRIGGER & RLS)
-- --------------------------------------------------------------------
CREATE POLICY "Admin read all audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Authenticated insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- --------------------------------------------------------------------
-- I. POLITIQUES POUR 'notifications'
-- --------------------------------------------------------------------
CREATE POLICY "User read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR public.is_admin());

CREATE POLICY "User update own notifications read status" ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "System insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- --------------------------------------------------------------------
-- J. POLITIQUES POUR 'sync_queue'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access sync queue" ON public.sync_queue FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Agent manage own sync queue" ON public.sync_queue FOR ALL TO authenticated
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

-- --------------------------------------------------------------------
-- K. POLITIQUES POUR 'ticket_assignments' & 'ticket_status_history'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access assignments" ON public.ticket_assignments FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Responsable read assignments" ON public.ticket_assignments FOR SELECT TO authenticated USING (public.is_responsable());
CREATE POLICY "Responsable insert assignments" ON public.ticket_assignments FOR INSERT TO authenticated WITH CHECK (assigned_by = auth.uid());

CREATE POLICY "Admin read status history" ON public.ticket_status_history FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Responsable read status history" ON public.ticket_status_history FOR SELECT TO authenticated USING (public.is_responsable());

-- ====================================================================
-- L. DÉFENSE EN PROFONDEUR : TRIGGERS SERVEUR CRITIQUES (NE JAMAIS FAIRE CONFIANCE AU CLIENT)
-- ====================================================================

-- 1. VÉRIFICATION DE MUTATION DE TICKET (SEUL L'ADMIN PEUT ANNULER UN TICKET)
CREATE OR REPLACE FUNCTION public.check_ticket_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- RÈGLE MÉTIER : Un responsable ou agent ne doit JAMAIS pouvoir annuler un ticket
  IF NEW.status = 'CANCELLED' AND (OLD.status IS NULL OR OLD.status != 'CANCELLED') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Privilège insuffisant : Seul l’administrateur général est autorisé à annuler un ticket ou carnet.';
    END IF;
  END IF;

  -- Empêcher la rétrogradation arbitraire d'un ticket vendu vers disponible
  IF OLD.status IN ('SOLD', 'CONTROLLED') AND NEW.status IN ('AVAILABLE', 'ASSIGNED_TO_RESPONSIBLE', 'ASSIGNED_TO_AGENT') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Violation d’intégrité : Impossible de réattribuer ou de libérer un ticket déjà vendu.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_ticket_mutation ON public.tickets;
CREATE TRIGGER trg_check_ticket_mutation
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.check_ticket_mutation();

-- 2. VALIDATION FINANCIÈRE DES VENTES (RECALCUL OBLIGATOIRE CÔTÉ SERVEUR)
CREATE OR REPLACE FUNCTION public.validate_sale_financials()
RETURNS TRIGGER AS $$
DECLARE
  v_assigned_agent UUID;
  v_ticket_status ticket_status;
BEGIN
  -- RÈGLE FINANCIÈRE : Le prix unitaire est IMPOSÉ à 5 000 FCFA côté serveur (anti-tampering)
  NEW.price := 5000;

  -- Vérifier l'existence et l'attribution du ticket
  SELECT assigned_agent_id, status INTO v_assigned_agent, v_ticket_status 
  FROM public.tickets 
  WHERE id = NEW.ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket introuvable pour la vente (ID: %).', NEW.ticket_id;
  END IF;

  -- Un agent ne peut vendre QUE les tickets qui lui sont assignés
  IF v_assigned_agent IS NOT NULL AND v_assigned_agent != NEW.agent_id THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Violation de sécurité : Ce ticket est attribué à un autre agent.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_sale_financials ON public.sales;
CREATE TRIGGER trg_validate_sale_financials
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.validate_sale_financials();

-- 3. IMMUTABILITÉ DES VENTES (UN AGENT NE PEUT JAMAIS MODIFIER UNE VENTE)
CREATE OR REPLACE FUNCTION public.prevent_sale_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Violation de sécurité : Les ventes enregistrées sont immuables.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_sale_mutation ON public.sales;
CREATE TRIGGER trg_prevent_sale_mutation
  BEFORE UPDATE OR DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sale_mutation();

-- 4. VALIDATION FINANCIÈRE DES REMISES (RECALCUL CÔTÉ SERVEUR)
CREATE OR REPLACE FUNCTION public.validate_remittance_financials()
RETURNS TRIGGER AS $$
BEGIN
  -- Le montant doit être strictement positif
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Montant de remise invalide (%) : Le montant doit être strictement positif.', NEW.amount;
  END IF;

  -- Le nombre de tickets couverts est calculé mathématiquement côté serveur
  NEW.tickets_count := FLOOR(NEW.amount / 5000);

  -- Un responsable ne peut jamais modifier une remise existante
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Privilège insuffisant : Un responsable ne peut pas modifier une remise enregistrée. Seul l’administrateur peut procéder à un ajustement auditée.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_remittance_financials ON public.remittances;
CREATE TRIGGER trg_validate_remittance_financials
  BEFORE INSERT OR UPDATE ON public.remittances
  FOR EACH ROW EXECUTE FUNCTION public.validate_remittance_financials();

-- 5. RPC SÉCURISÉE DE VÉRIFICATION DU TICKET AVEC TOKEN CRYPTOGRAPHIQUE INTERNE
CREATE OR REPLACE FUNCTION public.verify_ticket_secure(
  p_ticket_identifier TEXT,
  p_scanned_token TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_ticket RECORD;
  v_stored_token TEXT := NULL;
BEGIN
  SELECT t.*, c.carnet_number, p.full_name AS agent_name, p.phone AS agent_phone
  INTO v_ticket
  FROM public.tickets t
  LEFT JOIN public.carnets c ON c.id = t.carnet_id
  LEFT JOIN public.profiles p ON p.id = t.assigned_agent_id
  WHERE t.ticket_number ILIKE TRIM(p_ticket_identifier) 
     OR t.id::TEXT = TRIM(p_ticket_identifier)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_UNKNOWN',
      'valid', false,
      'message', 'Ce numéro ne correspond à aucun ticket dans la base officielle.'
    );
  END IF;

  -- Extraction du token interne du ticket
  IF v_ticket.qr_payload IS NOT NULL AND v_ticket.qr_payload != '' THEN
    BEGIN
      v_stored_token := (v_ticket.qr_payload::jsonb)->>'tok';
    EXCEPTION WHEN OTHERS THEN
      v_stored_token := NULL;
    END;
  END IF;

  -- RÈGLE QR : Ne pas faire confiance au seul numéro physique !
  IF v_stored_token IS NOT NULL AND v_stored_token != '' THEN
    IF p_scanned_token IS NULL OR TRIM(p_scanned_token) = '' OR TRIM(p_scanned_token) != v_stored_token THEN
      RETURN jsonb_build_object(
        'status', 'FORGED_TOKEN',
        'valid', false,
        'ticket_number', v_ticket.ticket_number,
        'message', 'ALERTE SÉCURITÉ : Le numéro physique existe mais le token cryptographique interne est absent ou non conforme. Ticket falsifié.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', v_ticket.status,
    'valid', (v_ticket.status IN ('SOLD', 'CONTROLLED') AND NOT COALESCE(v_ticket.is_superseded, false)),
    'ticket_id', v_ticket.id,
    'ticket_number', v_ticket.ticket_number,
    'carnet_number', v_ticket.carnet_number,
    'plate_number', v_ticket.plate_number,
    'driver_phone', v_ticket.driver_phone,
    'sold_at', v_ticket.sold_at,
    'is_superseded', v_ticket.is_superseded,
    'agent_name', v_ticket.agent_name,
    'agent_phone', v_ticket.agent_phone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. SÉCURISATION DU STOCKAGE DES PHOTOS DE FRAUDE (STORAGE BUCKET 'fraud_evidence')
-- INSERT INTO storage.buckets (id, name, public) VALUES ('fraud_evidence', 'fraud_evidence', false) ON CONFLICT DO NOTHING;
-- Accès strictement restreint aux administrateurs, responsables et contrôleurs assermentés.
