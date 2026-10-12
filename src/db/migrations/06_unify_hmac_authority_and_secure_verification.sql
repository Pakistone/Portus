-- ====================================================================
-- MIGRATION 06 : UNIFICATION DE L'AUTORITÉ DE SIGNATURE HMAC-SHA256
-- ET VÉRIFICATION SÉCURISÉE RIGOUREUSE (ANTI-FALSIFICATION SANS BYPASS)
-- ====================================================================

-- 1. MISE À JOUR DE LA FONCTION verify_ticket_secure
-- RÈGLE DE SÉCURITÉ CRITIQUE (F-02) :
-- Un jeton scanné n'est accepté QUE s'il égale la signature HMAC recalculée (v_expected_sig),
-- JAMAIS seulement la valeur stockée (v_stored_sig).
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
  v_message TEXT := 'Ticket authentique et valide.';
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

  -- 2. Extraction du token/signature cryptographique stocké
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

  -- Recalcul autoritaire de la signature attendue par le serveur Postgres
  v_canonical := 'PORTUS|v1|' || v_ticket.id::TEXT || '|' || COALESCE(v_ticket.carnet_number, 'VRD') || '|' || v_ticket.ticket_number || '|' || COALESCE(v_ticket.price, 5000)::TEXT;
  v_expected_sig := public.sign_ticket_canonical(v_canonical);

  -- CONTRÔLE CRITIQUE :
  -- Si un jeton/signature a été scanné dans le QR code, il doit obligatoirement égaler v_expected_sig.
  -- Aucune tolérance basée uniquement sur v_stored_sig afin de bloquer les copies de signatures stockées non autoritaires.
  IF p_scanned_token IS NOT NULL AND TRIM(p_scanned_token) != '' THEN
    IF TRIM(p_scanned_token) = v_expected_sig THEN
      v_sig_valid := TRUE;
    ELSE
      RETURN jsonb_build_object(
        'status', 'FORGED_SIGNATURE',
        'valid', false,
        'signature_verified', false,
        'ticket_number', v_ticket.ticket_number,
        'message', 'ALERTE SÉCURITÉ : Signature cryptographique invalide ou altérée. Faux ticket détecté !'
      );
    END IF;
  ELSE
    -- Recherche manuelle par numéro sans QR : valide uniquement si la signature stockée est conforme
    v_sig_valid := (v_stored_sig IS NOT NULL AND v_stored_sig = v_expected_sig);
  END IF;

  -- 3. Historique des contrôles préalables
  SELECT COUNT(*), MAX(controlled_at)
  INTO v_controls_count, v_last_control
  FROM public.controls
  WHERE ticket_id = v_ticket.id;

  -- 4. Concordance de la plaque d'immatriculation
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
    IF v_ticket.status = 'CONTROLLED' THEN
      v_status_code := 'ALREADY_CONTROLLED';
      v_message := 'Ticket valide (déjà contrôlé ' || v_controls_count || ' fois).';
    ELSE
      v_status_code := 'VALID';
      v_message := 'Ticket officiel valide et autorisé.';
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
    'agent_name', v_ticket.agent_name,
    'agent_phone', v_ticket.agent_phone,
    'sector_name', v_ticket.sector_name,
    'sold_at', v_ticket.sold_at,
    'control_count', v_controls_count,
    'last_control_at', v_last_control,
    'message', v_message
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

-- 2. PROCÉDURE DE RE-SIGNATURE DE TOUS LES TICKETS EXISTANTS
-- Permet la bascule sans rupture des anciens tickets vers l'autorité Postgres unifiée
CREATE OR REPLACE FUNCTION public.resign_all_existing_tickets()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  r RECORD;
  v_canonical TEXT;
  v_sig TEXT;
  v_carnet_ref TEXT;
BEGIN
  FOR r IN 
    SELECT t.id, t.ticket_number, t.carnet_id, t.price, c.carnet_number 
    FROM public.tickets t 
    LEFT JOIN public.carnets c ON c.id = t.carnet_id
  LOOP
    v_carnet_ref := COALESCE(r.carnet_number, 'VRD');
    v_canonical := 'PORTUS|v1|' || r.id::TEXT || '|' || v_carnet_ref || '|' || r.ticket_number || '|' || COALESCE(r.price, 5000)::TEXT;
    v_sig := public.sign_ticket_canonical(v_canonical);

    UPDATE public.tickets SET
      qr_payload = jsonb_build_object(
        'v', 1,
        'tid', r.id,
        'cid', r.carnet_id,
        'ref', v_carnet_ref,
        'num', r.ticket_number,
        'price', COALESCE(r.price, 5000),
        'sig', v_sig,
        'signature', v_sig
      )::TEXT,
      updated_at = NOW()
    WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

-- 3. TRANSACTION DE RÉINITIALISATION OPÉRATIONNELLE SÉCURISÉE (F-01)
-- Préserve scrupuleusement la table audit_logs comme piste d'audit immuable
CREATE OR REPLACE FUNCTION public.reset_operational_database(
  p_admin_user_id UUID,
  p_admin_email TEXT,
  p_confirmation TEXT
)
RETURNS JSONB AS $$
BEGIN
  IF p_confirmation != 'CONFIRMER_PURGE_PORTUS' AND p_confirmation != 'CONFIRMER' THEN
    RAISE EXCEPTION 'Phrase de confirmation invalide.';
  END IF;

  -- Suppression dans l'ordre strict des contraintes FK
  DELETE FROM public.controls;
  DELETE FROM public.fraud_reports;
  DELETE FROM public.sales;
  DELETE FROM public.ticket_status_history;
  DELETE FROM public.ticket_assignments;
  DELETE FROM public.remittance_adjustments;
  DELETE FROM public.remittances;
  DELETE FROM public.expenses;
  DELETE FROM public.tickets;
  DELETE FROM public.carnets;
  DELETE FROM public.notifications;
  DELETE FROM public.login_attempts;
  -- NE JAMAIS SUPPRIMER audit_logs !

  -- Enregistrement de l'action de réinitialisation dans la piste d'audit immuable
  INSERT INTO public.audit_logs (
    id,
    user_id,
    user_email,
    action,
    entity,
    entity_id,
    details,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_admin_user_id,
    p_admin_email,
    'SYSTEM_RESET',
    'DATABASE',
    'ALL_OPERATIONAL_DATA',
    'Purge complète des données opérationnelles effectuée avec succès. Table audit_logs préservée.',
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Base de données opérationnelle réinitialisée avec succès. Piste d’audit conservée.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

COMMENT ON FUNCTION public.verify_ticket_secure IS 'Vérification autoritaire HMAC-SHA256 contre la signature calculée en base';
COMMENT ON FUNCTION public.resign_all_existing_tickets IS 'Procédure administrative pour recalculer et synchroniser les signatures de tous les tickets';
COMMENT ON FUNCTION public.reset_operational_database IS 'Purge transactionnelle des données opérationnelles préservant audit_logs';
