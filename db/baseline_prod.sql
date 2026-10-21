-- =============================================================================
-- PORTUS — U.J.P.A.S.
-- Baseline Schéma Canonique de Production (extrait de p0_snapshot & SupabaseModal.tsx:106-450)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TYPES ENUMÉRÉS EXACTS (pg_enum de p0_snapshot)
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_status AS ENUM (
    'GENERATED',
    'ASSIGNED_TO_RESPONSIBLE',
    'AVAILABLE',
    'ASSIGNED_TO_AGENT',
    'SOLD',
    'CONTROLLED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fraud_reason AS ENUM (
    'FAUX_TICKET',
    'IMMATRICULATION_NON_CONFORME',
    'TICKET_EXPIRE',
    'REUTILISATION_FRAUDULEUSE',
    'AUTRE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_level AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sync_status_enum AS ENUM (
    'PENDING',
    'PROCESSING',
    'SYNCED',
    'FAILED',
    'CONFLICT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. TABLES DU SCHÉMA PUBLIC (21 tables issues de p0_snapshot)

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name public.user_role NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  full_name text NOT NULL,
  role public.user_role NOT NULL DEFAULT 'AGENT'::public.user_role,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  matricule text,
  brigade text,
  avatar_url text
);

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address text,
  user_agent text,
  is_successful boolean NOT NULL,
  failure_reason text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.carnets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carnet_number text NOT NULL UNIQUE,
  series_prefix text NOT NULL DEFAULT 'VRD'::text,
  generation_batch text NOT NULL DEFAULT 'GEN-1'::text,
  size integer NOT NULL,
  start_number integer NOT NULL,
  end_number integer NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  assigned_to_responsable uuid REFERENCES public.profiles(id),
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'CREATED'::text,
  assigned_at timestamptz,
  assigned_by_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL,
  generation_batch text NOT NULL DEFAULT 'GEN-1'::text,
  carnet_id uuid NOT NULL REFERENCES public.carnets(id) ON DELETE RESTRICT,
  qr_payload text NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'GENERATED'::public.ticket_status,
  price integer NOT NULL DEFAULT 5000,
  assigned_responsable_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  sale_id uuid,
  sold_at timestamptz,
  plate_number text,
  driver_phone text,
  is_superseded boolean NOT NULL DEFAULT false,
  superseded_by_ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  covered_by_remittance_id uuid,
  control_count integer NOT NULL DEFAULT 0,
  last_controlled_at timestamptz,
  last_controlled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  carnet_id uuid REFERENCES public.carnets(id) ON DELETE SET NULL,
  from_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assignment_type text NOT NULL,
  notes text,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  old_status public.ticket_status,
  new_status public.ticket_status NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE RESTRICT,
  ticket_number text NOT NULL,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  plate_number text NOT NULL,
  driver_phone text,
  sold_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  sync_idempotency_key uuid UNIQUE DEFAULT gen_random_uuid(),
  gps_latitude numeric,
  gps_longitude numeric,
  gps_accuracy numeric,
  gps_status text NOT NULL DEFAULT 'UNAVAILABLE'::text,
  price integer NOT NULL DEFAULT 5000,
  covered_by_remittance_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  carnet_id uuid REFERENCES public.carnets(id) ON DELETE SET NULL,
  expires_at timestamptz DEFAULT (now() + '14 days'::interval),
  payment_method text DEFAULT 'ESPECES'::text
);

CREATE TABLE IF NOT EXISTS public.remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  responsable_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  tickets_count integer NOT NULL DEFAULT 0,
  ticket_ids_covered uuid[] NOT NULL DEFAULT '{}'::uuid[],
  date date NOT NULL DEFAULT CURRENT_DATE,
  time time without time zone NOT NULL DEFAULT CURRENT_TIME,
  note text,
  is_corrected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.remittance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id uuid NOT NULL REFERENCES public.remittances(id) ON DELETE RESTRICT,
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  old_amount integer NOT NULL,
  new_amount integer NOT NULL,
  old_note text,
  new_note text,
  adjusted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  ticket_number text NOT NULL,
  plate_number text NOT NULL,
  controleur_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  controlled_at timestamptz NOT NULL DEFAULT now(),
  is_valid boolean NOT NULL,
  validation_message text NOT NULL,
  gps_latitude numeric,
  gps_longitude numeric,
  gps_accuracy numeric,
  gps_status text NOT NULL DEFAULT 'UNAVAILABLE'::text,
  sync_idempotency_key uuid UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  location text,
  anomaly_detected boolean NOT NULL DEFAULT false,
  notes text
);

CREATE TABLE IF NOT EXISTS public.fraud_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  ticket_number text,
  plate_number text NOT NULL,
  controleur_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason public.fraud_reason NOT NULL,
  comment text NOT NULL,
  photo_url text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  gps_latitude numeric,
  gps_longitude numeric,
  gps_accuracy numeric,
  gps_status text NOT NULL DEFAULT 'UNAVAILABLE'::text,
  status text NOT NULL DEFAULT 'PENDING'::text,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  fraud_type text,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  processing_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  admin_decision_note text,
  admin_decision_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_decision_by_name text,
  admin_decision_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id),
  reporter_name text NOT NULL,
  reporter_role text NOT NULL,
  incident_type text NOT NULL,
  severity text NOT NULL DEFAULT 'MOYENNE'::text,
  plate_number text,
  ticket_number text,
  suspected_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  description text NOT NULL,
  gps_latitude numeric,
  gps_longitude numeric,
  status text NOT NULL DEFAULT 'OUVERT'::text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_reference text NOT NULL UNIQUE,
  closing_date date NOT NULL DEFAULT CURRENT_DATE,
  cashier_id uuid NOT NULL REFERENCES public.profiles(id),
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  opening_balance integer NOT NULL DEFAULT 0,
  cash_sales_amount integer NOT NULL DEFAULT 0,
  digital_sales_amount integer NOT NULL DEFAULT 0,
  refunds_amount integer NOT NULL DEFAULT 0,
  expenses_amount integer NOT NULL DEFAULT 0,
  expected_balance integer NOT NULL,
  declared_balance integer NOT NULL,
  discrepancy integer NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'SUBMITTED'::text,
  confirmed_by uuid REFERENCES public.profiles(id),
  confirmed_at timestamptz,
  is_locked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Dépense opérationnelle'::text,
  category text NOT NULL DEFAULT 'FONCTIONNEMENT'::text,
  amount numeric NOT NULL,
  description text,
  expense_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'APPROVED'::text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  responsible_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  level public.notification_level NOT NULL DEFAULT 'INFO'::public.notification_level,
  type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  actor_role public.user_role NOT NULL,
  action text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  target_entity text NOT NULL,
  target_id text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  gps_latitude numeric,
  gps_longitude numeric,
  details text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_mutation_id uuid NOT NULL UNIQUE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  operation text NOT NULL,
  payload jsonb NOT NULL,
  status public.sync_status_enum NOT NULL DEFAULT 'PENDING'::public.sync_status_enum,
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  client_timestamp timestamptz NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number text NOT NULL UNIQUE,
  vehicle_type text NOT NULL DEFAULT 'camion-citerne'::text,
  driver_name text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  total_tickets_count integer NOT NULL DEFAULT 0,
  total_controls_count integer NOT NULL DEFAULT 0
);
