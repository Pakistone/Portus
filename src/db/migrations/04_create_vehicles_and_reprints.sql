-- ====================================================================
-- MIGRATION 04: REGISTRE DES VÉHICULES ET CONTRÔLE DES RÉIMPRESSIONS
-- PORTUS — U.J.S.R.V.
-- Véhicules : Camion-citerne (prioritaire), Conteneur, Plateau, Benne, Marchandises, Autre
-- Réimpressions : Justification obligatoire, traçabilité et alerte rejeu
-- ====================================================================

-- 1. Table des véhicules
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number TEXT NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL DEFAULT 'CAMION_CITERNE' CHECK (vehicle_type IN (
    'CAMION_CITERNE',
    'CONTENEUR',
    'PLATEAU',
    'BENNE',
    'MARCHANDISES',
    'AUTRE_POIDS_LOURD'
  )),
  make_model TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  company_name TEXT,
  is_flagged_fraud BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason TEXT,
  last_seen_at TIMESTAMPTZ,
  total_tickets_count INT NOT NULL DEFAULT 0,
  total_controls_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON public.vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON public.vehicles(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_flagged ON public.vehicles(is_flagged_fraud);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read vehicles" ON public.vehicles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin and Agent update vehicles" ON public.vehicles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Table des réimpressions de tickets (Reprint Management)
CREATE TABLE IF NOT EXISTS public.ticket_reprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 5),
  reprint_count INT NOT NULL DEFAULT 1,
  is_suspicious BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reprinted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reprints_ticket ON public.ticket_reprints(ticket_id);
CREATE INDEX IF NOT EXISTS idx_reprints_requester ON public.ticket_reprints(requested_by);
CREATE INDEX IF NOT EXISTS idx_reprints_suspicious ON public.ticket_reprints(is_suspicious);

ALTER TABLE public.ticket_reprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read and insert reprints" ON public.ticket_reprints
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
