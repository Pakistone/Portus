-- ============================================================================
-- MIGRATION 06 : GOUVERNANCE U.J.P.A.S., PHOTOS AGENTS, SOS INCIDENTS,
-- EXPIRATION STRICTE À 14 JOURS, HARD DELETE CARNETS & DURCISSEMENT RLS
-- Organisation : U.J.P.A.S. (Union des Jeunes du Port pour l'Assistance
-- et la Sécurité — Zone Portuaire & Industrielle d'Abidjan)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. PHOTOS DES AGENTS & MOBILITÉ GLOBALE (POOL D'AGENTS DISPONIBLES)
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS matricule TEXT,
  ADD COLUMN IF NOT EXISTS brigade TEXT;

-- Les agents n'ont plus d'obligation de secteur fixe : sector_id est nullable
ALTER TABLE public.profiles
  ALTER COLUMN sector_id DROP NOT NULL;

COMMENT ON COLUMN public.profiles.avatar_url IS 'Photo d’identité officielle compressée (WebP/JPEG DataURL ou URL Storage) pour le Trombinoscope U.J.P.A.S.';

-- Mise à jour de la RLS de lecture sur public.profiles :
-- Tout utilisateur authentifié actif peut consulter la liste des profils/agents
-- (indispensable pour le Trombinoscope de contrôle terrain et l'attribution de carnets en pool global)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Responsable read sector profiles" ON public.profiles;
DROP POLICY IF EXISTS "User read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated active users read all profiles" ON public.profiles;

CREATE POLICY "Authenticated active users read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin full access profiles" ON public.profiles;
CREATE POLICY "Admin full access profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users update own profile avatar and metadata" ON public.profiles;
CREATE POLICY "Users update own profile avatar and metadata" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin() OR public.is_responsable())
  WITH CHECK (id = auth.uid() OR public.is_admin() OR public.is_responsable());


-- ============================================================================
-- 2. TABLE DES SIGNALEMENTS SOS / INCIDENTS TERRAIN (public.incidents)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reporter_name TEXT NOT NULL,
  reporter_role TEXT NOT NULL,
  incident_type TEXT NOT NULL DEFAULT 'SOS_URGENCE' CHECK (
    incident_type IN (
      'SOS_URGENCE',
      'REFUS_OBTEMPERER',
      'ALTERCATION_CHAUFFEUR',
      'TENTATIVE_CORRUPTION',
      'TICKET_FALSIFIE_CONFRONTATION',
      'USURPATION_AGENT',
      'ACCIDENT_BLOCAGE_VOIE',
      'AUTRE'
    )
  ),
  severity TEXT NOT NULL DEFAULT 'CRITICAL' CHECK (
    severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
  ),
  plate_number TEXT,
  ticket_number TEXT,
  suspected_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  gps_latitude NUMERIC(9, 6),
  gps_longitude NUMERIC(9, 6),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (
    status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')
  ),
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON public.incidents(reporter_id);
CREATE INDEX IF NOT EXISTS idx_incidents_plate ON public.incidents(plate_number);

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read incidents" ON public.incidents;
CREATE POLICY "Authenticated users read incidents" ON public.incidents
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users insert incidents" ON public.incidents;
CREATE POLICY "Authenticated users insert incidents" ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (reporter_id = auth.uid() OR public.is_admin() OR public.is_responsable()));

DROP POLICY IF EXISTS "Supervisors and Admin update incidents" ON public.incidents;
CREATE POLICY "Supervisors and Admin update incidents" ON public.incidents
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_responsable() OR reporter_id = auth.uid())
  WITH CHECK (public.is_admin() OR public.is_responsable() OR reporter_id = auth.uid());

DROP POLICY IF EXISTS "Admin delete incidents" ON public.incidents;
CREATE POLICY "Admin delete incidents" ON public.incidents
  FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.incidents IS 'Alertes SOS et signalements d’incidents terrain géolocalisés U.J.P.A.S.';


-- ============================================================================
-- 3. EXPIRATION STRICTE À 14 JOURS & MODES DE PAIEMENT SUR public.sales & public.tickets
-- ============================================================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'ESPECES';

-- Contrainte sur payment_method ('ESPECES', 'WAVE', 'ORANGE_MONEY', 'MOOV')
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sales_payment_method;

ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_payment_method
  CHECK (payment_method IN ('ESPECES', 'WAVE', 'ORANGE_MONEY', 'MOOV'));

-- Rétro-remplissage des dates d'expiration manquantes à sold_at + 14 jours
UPDATE public.sales
SET expires_at = sold_at + INTERVAL '14 days'
WHERE expires_at IS NULL AND sold_at IS NOT NULL;

ALTER TABLE public.sales
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '14 days');

-- Déclencheur automatique pour garantir expires_at = sold_at + 14 days si non fourni
CREATE OR REPLACE FUNCTION public.trg_set_sale_expiration_14d()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.sold_at, NOW()) + INTERVAL '14 days';
  END IF;
  IF NEW.payment_method IS NULL OR TRIM(NEW.payment_method) = '' THEN
    NEW.payment_method := 'ESPECES';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS before_insert_sale_expiration_14d ON public.sales;
CREATE TRIGGER before_insert_sale_expiration_14d
  BEFORE INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_sale_expiration_14d();

-- Ajout également sur public.tickets et public.carnets pour compatibilité complète des colonnes et lecture directe lors du scan
ALTER TABLE public.carnets
  ADD COLUMN IF NOT EXISTS size INT DEFAULT 50,
  ADD COLUMN IF NOT EXISTS assigned_to_responsable UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS assigned_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qr_payload TEXT,
  ADD COLUMN IF NOT EXISTS sector_id UUID,
  ADD COLUMN IF NOT EXISTS plate_number TEXT,
  ADD COLUMN IF NOT EXISTS driver_phone TEXT,
  ADD COLUMN IF NOT EXISTS is_superseded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'ESPECES';

UPDATE public.tickets SET assigned_responsable_id = assigned_to_responsable_id WHERE assigned_responsable_id IS NULL AND assigned_to_responsable_id IS NOT NULL;
UPDATE public.tickets SET assigned_agent_id = assigned_to_agent_id WHERE assigned_agent_id IS NULL AND assigned_to_agent_id IS NOT NULL;
UPDATE public.carnets SET assigned_to_responsable = assigned_to_responsable_id WHERE assigned_to_responsable IS NULL AND assigned_to_responsable_id IS NOT NULL;

UPDATE public.tickets
SET expires_at = sold_at + INTERVAL '14 days'
WHERE expires_at IS NULL AND sold_at IS NOT NULL;

-- Mise à jour du paramètre officiel app_settings à 14 jours
INSERT INTO public.app_settings (key, value, description)
VALUES ('ticket_validity_days', '14'::jsonb, 'Durée de validité stricte d’un ticket U.J.P.A.S. (14 jours)')
ON CONFLICT (key) DO UPDATE
SET value = '14'::jsonb,
    description = 'Durée de validité stricte d’un ticket U.J.P.A.S. (14 jours)',
    updated_at = NOW();


-- ============================================================================
-- 4. SUPPRESSION DÉFINITIVE DE CARNET (ON DELETE CASCADE & RLS ADMIN DELETE)
-- ============================================================================
-- Remplacement de ON DELETE RESTRICT par ON DELETE CASCADE sur public.tickets(carnet_id)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'tickets'
      AND kcu.column_name = 'carnet_id'
      AND ccu.table_name = 'carnets'
  ) LOOP
    EXECUTE 'ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.tickets
  ADD CONSTRAINT fk_tickets_carnet_cascade
  FOREIGN KEY (carnet_id)
  REFERENCES public.carnets(id)
  ON DELETE CASCADE;

-- Assurer également que public.sales.ticket_id permette la cascade lors de la purge d'un carnet par l'admin
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'sales'
      AND kcu.column_name = 'ticket_id'
      AND ccu.table_name = 'tickets'
  ) LOOP
    EXECUTE 'ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.sales
  ADD CONSTRAINT fk_sales_ticket_cascade
  FOREIGN KEY (ticket_id)
  REFERENCES public.tickets(id)
  ON DELETE CASCADE;

-- Politiques explicites de suppression pour ADMINISTRATEUR et gestion globale par RESPONSABLE
DROP POLICY IF EXISTS "Admin explicit delete carnets" ON public.carnets;
CREATE POLICY "Admin explicit delete carnets" ON public.carnets
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin explicit delete tickets" ON public.tickets;
CREATE POLICY "Admin explicit delete tickets" ON public.tickets
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Permettre à tout RESPONSABLE actif de gérer/attribuer les carnets et tickets au pool global d'agents
DROP POLICY IF EXISTS "Responsable read/manage sector carnets" ON public.carnets;
CREATE POLICY "Responsable read/manage sector carnets" ON public.carnets
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_responsable())
  WITH CHECK (public.is_admin() OR public.is_responsable());

DROP POLICY IF EXISTS "Responsable read sector tickets" ON public.tickets;
DROP POLICY IF EXISTS "Responsable manage pool tickets" ON public.tickets;
CREATE POLICY "Responsable manage pool tickets" ON public.tickets
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_responsable() OR assigned_agent_id = auth.uid())
  WITH CHECK (public.is_admin() OR public.is_responsable() OR assigned_agent_id = auth.uid());


-- ============================================================================
-- 5. FLUX FINANCIER & DURCISSEMENT RLS (vehicles, ticket_reprints, daily_closings, remittances)
-- L'Administrateur est maître de tout, le Responsable (Superviseur) fait le point
-- à l'Administrateur, et le rôle TRESORIER est éradiqué/masqué.
-- ============================================================================

-- 5.1. Normalisation d'éventuels anciens profils TRESORIER / CAISSIER vers RESPONSABLE
UPDATE public.profiles
SET role = 'RESPONSABLE'::user_role
WHERE role::TEXT IN ('TRESORIER', 'CAISSIER', 'FINANCE');

-- 5.2. RLS sur public.vehicles
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and Agent update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated read vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated select vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Controlled update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admin delete vehicles" ON public.vehicles;

CREATE POLICY "Authenticated select vehicles" ON public.vehicles
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated insert vehicles" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Controlled update vehicles" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admin delete vehicles" ON public.vehicles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 5.3. RLS sur public.ticket_reprints
ALTER TABLE public.ticket_reprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read and insert reprints" ON public.ticket_reprints;
DROP POLICY IF EXISTS "Authenticated select reprints" ON public.ticket_reprints;
DROP POLICY IF EXISTS "Authenticated insert reprints" ON public.ticket_reprints;
DROP POLICY IF EXISTS "Admin and Responsable update reprints" ON public.ticket_reprints;
DROP POLICY IF EXISTS "Admin delete reprints" ON public.ticket_reprints;

CREATE POLICY "Authenticated select reprints" ON public.ticket_reprints
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated insert reprints" ON public.ticket_reprints
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() OR public.is_admin() OR public.is_responsable());

CREATE POLICY "Admin and Responsable update reprints" ON public.ticket_reprints
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_responsable())
  WITH CHECK (public.is_admin() OR public.is_responsable());

CREATE POLICY "Admin delete reprints" ON public.ticket_reprints
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 5.4. RLS sur public.daily_closings (Point financier Superviseur -> Administrateur)
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access closings" ON public.daily_closings;
DROP POLICY IF EXISTS "Cashier and Agent view own closings" ON public.daily_closings;
DROP POLICY IF EXISTS "Cashier submit closing" ON public.daily_closings;
DROP POLICY IF EXISTS "Responsable and Admin manage closings" ON public.daily_closings;
DROP POLICY IF EXISTS "Agent view own closings" ON public.daily_closings;

-- L'Administrateur a le contrôle total (validation, verrouillage, suppression)
CREATE POLICY "Admin full access closings" ON public.daily_closings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Le Responsable (Superviseur) soumet et consulte ses points financiers à destination de l'Admin
CREATE POLICY "Responsable and Admin manage closings" ON public.daily_closings
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_responsable() OR cashier_id = auth.uid());

CREATE POLICY "Cashier submit closing" ON public.daily_closings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_responsable() OR cashier_id = auth.uid());

CREATE POLICY "Responsable update unlocked closing" ON public.daily_closings
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR (public.is_responsable() AND cashier_id = auth.uid() AND is_locked = FALSE))
  WITH CHECK (public.is_admin() OR (public.is_responsable() AND cashier_id = auth.uid()));

-- 5.5. RLS sur public.remittances (Pool global : tout Responsable ou Admin peut encaisser la remise d'un Agent)
DROP POLICY IF EXISTS "Responsable manage sector remittances" ON public.remittances;
CREATE POLICY "Responsable manage sector remittances" ON public.remittances
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_responsable() OR agent_id = auth.uid())
  WITH CHECK (public.is_admin() OR public.is_responsable() OR agent_id = auth.uid());


-- ============================================================================
-- 6. MISE À JOUR DE verify_ticket_secure POUR APPLIQUER L'EXPIRATION À 14 JOURS
-- ET L'IDENTITÉ OFFICIELLE U.J.P.A.S. (AVEC PHOTO AGENT VENDEUR)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_ticket_secure(
  p_ticket_identifier TEXT,
  p_scanned_token TEXT DEFAULT NULL,
  p_plate_number TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_ticket RECORD;
  v_stored_sig TEXT := NULL;
  v_expected_sig TEXT := NULL;
  v_canonical TEXT;
  v_sig_valid BOOLEAN := FALSE;
  v_plate_match BOOLEAN := TRUE;
  v_clean_search TEXT;
  v_clean_scanned_plate TEXT := NULL;
  v_clean_ticket_plate TEXT := NULL;
  v_controls_count INT := 0;
  v_last_control TIMESTAMPTZ := NULL;
  v_is_valid BOOLEAN := FALSE;
  v_status_code TEXT := 'VALID';
  v_message TEXT := 'Ticket officiel U.J.P.A.S. authentique et valide (14 jours).';
  v_expires_at TIMESTAMPTZ := NULL;
BEGIN
  v_clean_search := TRIM(p_ticket_identifier);
  IF v_clean_search IS NULL OR v_clean_search = '' THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_EMPTY',
      'valid', false,
      'signature_verified', false,
      'message', 'Identifiant de ticket manquant.'
    );
  END IF;

  SELECT
    t.*,
    c.carnet_number,
    p.full_name AS agent_name,
    p.phone AS agent_phone,
    p.avatar_url AS agent_avatar_url,
    p.matricule AS agent_matricule,
    s.name AS sector_name,
    sl.expires_at AS sale_expires_at,
    sl.payment_method AS sale_payment_method
  INTO v_ticket
  FROM public.tickets t
  LEFT JOIN public.carnets c ON c.id = t.carnet_id
  LEFT JOIN public.profiles p ON p.id = t.assigned_agent_id
  LEFT JOIN public.sectors s ON s.id = t.sector_id
  LEFT JOIN public.sales sl ON sl.ticket_id = t.id
  WHERE t.ticket_number ILIKE v_clean_search
     OR t.id::TEXT = v_clean_search
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_UNKNOWN',
      'valid', false,
      'signature_verified', false,
      'message', 'Ce ticket n’existe pas dans le registre officiel de l’U.J.P.A.S.'
    );
  END IF;

  IF v_ticket.qr_payload IS NOT NULL AND v_ticket.qr_payload != '' THEN
    BEGIN
      v_stored_sig := (v_ticket.qr_payload::jsonb)->>'sig';
      IF v_stored_sig IS NULL OR v_stored_sig = '' THEN
        v_stored_sig := (v_ticket.qr_payload::jsonb)->>'signature';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_stored_sig := NULL;
    END;
  END IF;

  v_canonical := 'PORTUS|v1|' || v_ticket.id::TEXT || '|' || COALESCE(v_ticket.carnet_number, 'VRD') || '|' || v_ticket.ticket_number || '|' || COALESCE(v_ticket.price, 5000)::TEXT;
  v_expected_sig := public.sign_ticket_canonical(v_canonical);

  IF p_scanned_token IS NOT NULL AND TRIM(p_scanned_token) != '' THEN
    IF TRIM(p_scanned_token) = v_expected_sig THEN
      v_sig_valid := TRUE;
    ELSE
      RETURN jsonb_build_object(
        'status', 'FORGED_SIGNATURE',
        'valid', false,
        'signature_verified', false,
        'ticket_number', v_ticket.ticket_number,
        'message', 'ALERTE SÉCURITÉ U.J.P.A.S. : Signature cryptographique invalide ou altérée. Faux ticket détecté !'
      );
    END IF;
  ELSE
    v_sig_valid := (v_stored_sig IS NOT NULL AND v_stored_sig = v_expected_sig);
  END IF;

  SELECT COUNT(*), MAX(controlled_at)
  INTO v_controls_count, v_last_control
  FROM public.controls
  WHERE ticket_id = v_ticket.id;

  IF p_plate_number IS NOT NULL AND TRIM(p_plate_number) != '' AND v_ticket.plate_number IS NOT NULL THEN
    v_clean_scanned_plate := UPPER(REGEXP_REPLACE(p_plate_number, '[^A-Z0-9]', '', 'g'));
    v_clean_ticket_plate := UPPER(REGEXP_REPLACE(v_ticket.plate_number, '[^A-Z0-9]', '', 'g'));

    IF v_clean_scanned_plate != '' AND v_clean_ticket_plate != '' AND v_clean_scanned_plate != v_clean_ticket_plate THEN
      v_plate_match := FALSE;
      v_status_code := 'PLATE_MISMATCH';
      v_message := 'ALERTE IMMATRICULATION : Ticket émis pour le camion ' || v_ticket.plate_number || ' mais présenté sur ' || UPPER(TRIM(p_plate_number)) || ' (Fraude suspectée).';
    END IF;
  END IF;

  -- Calcul strict de l'expiration à 14 jours
  v_expires_at := COALESCE(v_ticket.expires_at, v_ticket.sale_expires_at, v_ticket.sold_at + INTERVAL '14 days');

  IF v_ticket.is_superseded THEN
    v_status_code := 'SUPERSEDED';
    v_message := 'Ticket inactif (SUPERSEDED) : ce ticket a été remplacé par un nouveau ticket actif.';
    v_is_valid := FALSE;
  ELSIF v_ticket.status = 'CANCELLED' THEN
    v_status_code := 'CANCELLED';
    v_message := 'Ticket officiellement annulé par l’administration U.J.P.A.S.';
    v_is_valid := FALSE;
  ELSIF v_ticket.status IN ('GENERATED', 'ASSIGNED_TO_RESPONSIBLE', 'AVAILABLE', 'ASSIGNED_TO_AGENT') THEN
    v_status_code := 'NOT_SOLD';
    v_message := 'Ticket officiel mais NON ENCORE VENDU. Stationnement non autorisé.';
    v_is_valid := FALSE;
  ELSIF v_expires_at IS NOT NULL AND NOW() > v_expires_at THEN
    v_status_code := 'VALIDITY_EXPIRED';
    v_message := 'TICKET EXPIRÉ : La durée de validité stricte de 14 jours est dépassée (Expiré le ' || TO_CHAR(v_expires_at, 'DD/MM/YYYY à HH24:MI') || ').';
    v_is_valid := FALSE;
  ELSIF NOT v_plate_match THEN
    v_is_valid := FALSE;
  ELSIF v_ticket.status IN ('SOLD', 'CONTROLLED') THEN
    v_is_valid := TRUE;
    IF v_ticket.status = 'CONTROLLED' THEN
      v_status_code := 'ALREADY_CONTROLLED';
      v_message := 'Ticket U.J.P.A.S. valide (déjà contrôlé ' || v_controls_count || ' fois — valable 14 jours).';
    ELSE
      v_status_code := 'VALID';
      v_message := 'Ticket officiel U.J.P.A.S. valide et autorisé (validité 14 jours conforme).';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status_code,
    'valid', v_is_valid,
    'signature_verified', v_sig_valid,
    'ticket_id', v_ticket.id,
    'ticket_number', v_ticket.ticket_number,
    'carnet_number', v_ticket.carnet_number,
    'plate_number', v_ticket.plate_number,
    'driver_phone', v_ticket.driver_phone,
    'price', v_ticket.price,
    'payment_method', COALESCE(v_ticket.payment_method, v_ticket.sale_payment_method, 'ESPECES'),
    'agent_id', v_ticket.assigned_agent_id,
    'agent_name', v_ticket.agent_name,
    'agent_phone', v_ticket.agent_phone,
    'agent_avatar_url', v_ticket.agent_avatar_url,
    'agent_matricule', v_ticket.agent_matricule,
    'sector_name', v_ticket.sector_name,
    'sold_at', v_ticket.sold_at,
    'expires_at', v_expires_at,
    'control_count', v_controls_count,
    'last_control_at', v_last_control,
    'message', v_message
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

COMMIT;
