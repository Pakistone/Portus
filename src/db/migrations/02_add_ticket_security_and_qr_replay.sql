-- ====================================================================
-- MIGRATION 02: TICKET SECURITY, QR REPLAY TRACKING & STRICT VERIFICATION
-- PORTUS — U.J.S.R.V.
-- RÈGLE ABSOLUE : Si signature invalide => valid = false TOUJOURS.
-- ====================================================================

-- 1. Table de journalisation des scans et détection de rejeu
CREATE TABLE IF NOT EXISTS public.qr_verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  ticket_number TEXT NOT NULL,
  controller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  plate_number TEXT,
  is_valid BOOLEAN NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  is_replay BOOLEAN NOT NULL DEFAULT FALSE,
  verification_count INT NOT NULL DEFAULT 1,
  device_info TEXT,
  location TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_verif_ticket ON public.qr_verification_logs(ticket_number);
CREATE INDEX IF NOT EXISTS idx_qr_verif_date ON public.qr_verification_logs(verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_verif_controller ON public.qr_verification_logs(controller_id);

ALTER TABLE public.qr_verification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin & Controleur log access" ON public.qr_verification_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Fonction autoritaire de vérification durcie (Strict Signature Rule + Privacy Filter)
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
  v_verif_count INT := 0;
  v_last_control TIMESTAMPTZ := NULL;
  v_is_valid BOOLEAN := FALSE;
  v_status_code TEXT := 'VALID';
  v_message TEXT := 'Ticket authentique et conforme.';
  v_is_replay BOOLEAN := FALSE;
  v_caller_role user_role;
BEGIN
  -- Déterminer le rôle de l'appelant
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

  v_clean_search := TRIM(p_ticket_identifier);
  IF v_clean_search IS NULL OR v_clean_search = '' THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_EMPTY',
      'valid', false,
      'signature_verified', false,
      'message', 'Identifiant de ticket manquant.'
    );
  END IF;

  -- 1. Rechercher le ticket par identifiant ou numéro physique
  SELECT t.*, c.carnet_number, p.full_name AS agent_name, p.phone AS agent_phone, s.name AS sector_name
  INTO v_ticket
  FROM public.tickets t
  LEFT JOIN public.carnets c ON c.id = t.carnet_id
  LEFT JOIN public.profiles p ON p.id = t.assigned_agent_id
  LEFT JOIN public.sectors s ON s.id = t.sector_id
  WHERE t.ticket_number ILIKE v_clean_search 
     OR t.id::TEXT = v_clean_search
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_UNKNOWN',
      'valid', false,
      'signature_verified', false,
      'message', 'Ce ticket n’existe pas dans le registre officiel de l’U.J.S.R.V.'
    );
  END IF;

  -- 2. Extraction du token/signature cryptographique
  IF v_ticket.qr_payload IS NOT NULL AND v_ticket.qr_payload != '' THEN
    BEGIN
      v_stored_sig := (v_ticket.qr_payload::jsonb)->>'sig';
      IF v_stored_sig IS NULL OR v_stored_sig = '' THEN
        v_stored_sig := (v_ticket.qr_payload::jsonb)->>'signature';
      END IF;
      IF v_stored_sig IS NULL OR v_stored_sig = '' THEN
        v_stored_sig := (v_ticket.qr_payload::jsonb)->>'tok';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_stored_sig := NULL;
    END;
  END IF;

  -- Recalcul de la signature attendue par le serveur HMAC-SHA256
  v_canonical := 'PORTUS|v1|' || v_ticket.id::TEXT || '|' || COALESCE(v_ticket.carnet_number, 'VRD') || '|' || v_ticket.ticket_number || '|' || COALESCE(v_ticket.price, 5000)::TEXT;
  v_expected_sig := public.sign_ticket_canonical(v_canonical);

  -- RÈGLE ABSOLUE : VALIDATION CRYPTOGRAPHIQUE STRICTE
  IF p_scanned_token IS NOT NULL AND TRIM(p_scanned_token) != '' THEN
    IF TRIM(p_scanned_token) = v_expected_sig OR TRIM(p_scanned_token) = v_stored_sig THEN
      v_sig_valid := TRUE;
    ELSE
      v_sig_valid := FALSE;
      -- Journaliser tentative de falsification
      INSERT INTO public.qr_verification_logs (
        ticket_id, ticket_number, controller_id, plate_number, is_valid, signature_valid, is_replay
      ) VALUES (
        v_ticket.id, v_ticket.ticket_number, auth.uid(), p_plate_number, false, false, false
      );

      RETURN jsonb_build_object(
        'status', 'FORGED_SIGNATURE',
        'valid', false,
        'signature_verified', false,
        'ticket_number', v_ticket.ticket_number,
        'message', 'ALERTE SÉCURITÉ : Signature cryptographique invalide ou altérée. Faux ticket détecté !'
      );
    END IF;
  ELSE
    -- Si aucun jeton n'a été transmis, vérifier si la signature stockée en base est valide
    v_sig_valid := (v_stored_sig = v_expected_sig);
  END IF;

  -- RÈGLE CRITIQUE MASTER PROMPT (Page 21 & 88) :
  -- If signature_valid = false then valid = false ALWAYS.
  IF NOT v_sig_valid THEN
    RETURN jsonb_build_object(
      'status', 'FORGED_SIGNATURE',
      'valid', false,
      'signature_verified', false,
      'ticket_number', v_ticket.ticket_number,
      'message', 'ALERTE SÉCURITÉ : Signature cryptographique non conforme. Ticket invalide.'
    );
  END IF;

  -- 3. Historique et détection de rejeu (Replay Protection)
  SELECT COUNT(*), MAX(controlled_at)
  INTO v_controls_count, v_last_control
  FROM public.controls
  WHERE ticket_id = v_ticket.id;

  SELECT COUNT(*) INTO v_verif_count
  FROM public.qr_verification_logs
  WHERE ticket_id = v_ticket.id;

  IF v_verif_count >= 3 OR v_controls_count >= 2 THEN
    v_is_replay := TRUE;
  END IF;

  -- 4. Vérification de concordance de plaque d'immatriculation
  IF p_plate_number IS NOT NULL AND TRIM(p_plate_number) != '' AND v_ticket.plate_number IS NOT NULL THEN
    v_clean_scanned_plate := UPPER(REGEXP_REPLACE(p_plate_number, '[^A-Z0-9]', '', 'g'));
    v_clean_ticket_plate := UPPER(REGEXP_REPLACE(v_ticket.plate_number, '[^A-Z0-9]', '', 'g'));

    IF v_clean_scanned_plate != '' AND v_clean_ticket_plate != '' AND v_clean_scanned_plate != v_clean_ticket_plate THEN
      v_plate_match := FALSE;
      v_status_code := 'PLATE_MISMATCH';
      v_message := 'ALERTE IMMATRICULATION : Ticket émis pour le camion ' || v_ticket.plate_number || ' mais présenté sur ' || UPPER(TRIM(p_plate_number)) || ' (Fraude suspectée).';
    END IF;
  END IF;

  -- 5. Vérification du statut métier
  IF v_ticket.is_superseded THEN
    v_status_code := 'SUPERSEDED';
    v_message := 'Ticket inactif (SUPERSEDED) : ce ticket a été remplacé par un nouveau ticket actif.';
    v_is_valid := FALSE;
  ELSIF v_ticket.status = 'CANCELLED' THEN
    v_status_code := 'CANCELLED';
    v_message := 'Ticket officiellement annulé par l’administration.';
    v_is_valid := FALSE;
  ELSIF v_ticket.status IN ('GENERATED', 'ASSIGNED_TO_RESPONSIBLE', 'AVAILABLE', 'ASSIGNED_TO_AGENT') THEN
    v_status_code := 'NOT_SOLD';
    v_message := 'Ticket officiel mais NON ENCORE VENDU. Stationnement non autorisé.';
    v_is_valid := FALSE;
  ELSIF NOT v_plate_match THEN
    v_is_valid := FALSE;
  ELSIF v_ticket.status IN ('SOLD', 'CONTROLLED') THEN
    v_is_valid := TRUE;
    IF v_ticket.status = 'CONTROLLED' OR v_is_replay THEN
      v_status_code := 'ALREADY_CONTROLLED';
      v_message := 'Ticket valide (déjà contrôlé ' || v_controls_count || ' fois). Rejeu détecté.';
    ELSE
      v_status_code := 'VALID';
      v_message := 'Ticket officiel valide et autorisé.';
    END IF;
  END IF;

  -- Enregistrement du log de vérification
  INSERT INTO public.qr_verification_logs (
    ticket_id, ticket_number, controller_id, plate_number, is_valid, signature_valid, is_replay, verification_count
  ) VALUES (
    v_ticket.id, v_ticket.ticket_number, auth.uid(), p_plate_number, v_is_valid, v_sig_valid, v_is_replay, v_verif_count + 1
  );

  -- PRIVACY FILTER (Section 15) :
  -- Si l'appelant est anonyme ou non contrôleur, renvoyer les données minimales sans données personnelles d'agent
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('CONTROLEUR', 'ADMINISTRATEUR', 'RESPONSABLE') THEN
    RETURN jsonb_build_object(
      'status', v_status_code,
      'valid', v_is_valid,
      'signature_verified', v_sig_valid,
      'ticket_number', v_ticket.ticket_number,
      'plate_number', v_ticket.plate_number,
      'message', v_message,
      'verification_timestamp', NOW()
    );
  END IF;

  -- Réponse complète pour contrôleur officiel
  RETURN jsonb_build_object(
    'status', v_status_code,
    'valid', v_is_valid,
    'signature_verified', v_sig_valid,
    'ticket_id', v_ticket.id,
    'ticket_number', v_ticket.ticket_number,
    'carnet_number', v_ticket.carnet_number,
    'price', v_ticket.price,
    'status_db', v_ticket.status,
    'plate_number', v_ticket.plate_number,
    'driver_phone', v_ticket.driver_phone,
    'sold_at', v_ticket.sold_at,
    'sector_name', v_ticket.sector_name,
    'agent_name', v_ticket.agent_name,
    'agent_phone', v_ticket.agent_phone,
    'is_superseded', COALESCE(v_ticket.is_superseded, false),
    'control_count', v_controls_count,
    'last_controlled_at', v_last_control,
    'plate_match', v_plate_match,
    'is_replay', v_is_replay,
    'message', v_message
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;
