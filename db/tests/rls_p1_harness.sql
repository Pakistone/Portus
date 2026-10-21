-- ============================================================================
-- PORTUS — U.J.P.A.S.
-- Fichier : db/tests/rls_p1_harness.sql
-- Objet   : Harnais de preuve RLS P1 (transactionnel avec ROLLBACK final)
--           Teste la matrice complète des 8 cas exigés en P1 sous
--           SET LOCAL ROLE authenticated + request.jwt.claims.
-- ============================================================================

BEGIN;

-- Création de jeux d'essai déterministes isolés dans la transaction (annulés par ROLLBACK)
DO $$
DECLARE
  v_admin_id      UUID := '00000000-0000-4000-a000-000000000001';
  v_resp_a_id     UUID := '00000000-0000-4000-a000-000000000002';
  v_resp_b_id     UUID := '00000000-0000-4000-a000-000000000003';
  v_agent_1_id    UUID := '00000000-0000-4000-a000-000000000004';
  v_agent_2_id    UUID := '00000000-0000-4000-a000-000000000005';
  v_ctrl_id       UUID := '00000000-0000-4000-a000-000000000006';
  v_carnet_a_id   UUID := '00000000-0000-4000-b000-000000000001';
  v_carnet_b_id   UUID := '00000000-0000-4000-b000-000000000002';
  v_tkt_a_sold    UUID := '00000000-0000-4000-c000-000000000001';
  v_tkt_a_free    UUID := '00000000-0000-4000-c000-000000000002';
  v_tkt_b_sold    UUID := '00000000-0000-4000-c000-000000000003';
  v_tkt_ag2_unsold UUID := '00000000-0000-4000-c000-000000000004';
BEGIN
  -- Utilisateurs auth.users factices pour respecter la FK profiles.id -> auth.users.id
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_admin_id,   'p1_admin@portus.test',   '{"username":"p1_admin","full_name":"Admin P1"}'::jsonb, now(), now()),
    (v_resp_a_id,  'p1_respa@portus.test',   '{"username":"p1_respa","full_name":"Resp A P1"}'::jsonb, now(), now()),
    (v_resp_b_id,  'p1_respb@portus.test',   '{"username":"p1_respb","full_name":"Resp B P1"}'::jsonb, now(), now()),
    (v_agent_1_id, 'p1_agent1@portus.test',  '{"username":"p1_agent1","full_name":"Agent 1 Sans Secteur"}'::jsonb, now(), now()),
    (v_agent_2_id, 'p1_agent2@portus.test',  '{"username":"p1_agent2","full_name":"Agent 2 Occupé"}'::jsonb, now(), now()),
    (v_ctrl_id,    'p1_ctrl@portus.test',    '{"username":"p1_ctrl","full_name":"Controleur P1"}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Profils publics (sector_id = NULL sur les agents : pool global sans secteur)
  INSERT INTO public.profiles (id, username, full_name, role, sector_id, is_active)
  VALUES
    (v_admin_id,   'p1_admin',  'Admin P1',             'ADMINISTRATEUR', NULL, TRUE),
    (v_resp_a_id,  'p1_respa',  'Resp A P1',            'RESPONSABLE',    NULL, TRUE),
    (v_resp_b_id,  'p1_respb',  'Resp B P1',            'RESPONSABLE',    NULL, TRUE),
    (v_agent_1_id, 'p1_agent1', 'Agent 1 Sans Secteur', 'AGENT',          NULL, TRUE),
    (v_agent_2_id, 'p1_agent2', 'Agent 2 Occupé',       'AGENT',          NULL, TRUE),
    (v_ctrl_id,    'p1_ctrl',   'Controleur P1',        'CONTROLEUR',     NULL, TRUE)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role,
        sector_id = NULL,
        is_active = TRUE;

  -- Carnets pour Resp A et Resp B
  INSERT INTO public.carnets (id, carnet_number, series_prefix, generation_batch, size, start_number, end_number, created_by, assigned_to_responsable, status)
  VALUES
    (v_carnet_a_id, 'P1-CARNET-A', 'P1A', 'P1-BATCH', 3, 1, 3, v_admin_id, v_resp_a_id, 'ASSIGNED'),
    (v_carnet_b_id, 'P1-CARNET-B', 'P1B', 'P1-BATCH', 3, 4, 6, v_admin_id, v_resp_b_id, 'ASSIGNED')
  ON CONFLICT (id) DO NOTHING;

  -- Tickets :
  -- 1) v_tkt_a_sold : octroyé par Resp A à Agent 1 (sans secteur), VENDU (SOLD), non couvert
  -- 2) v_tkt_a_free : carnet de Resp A, statut ASSIGNED_TO_RESPONSIBLE (prêt à attribuer)
  -- 3) v_tkt_b_sold : octroyé par Resp B à Agent 1, VENDU (SOLD), non couvert
  -- 4) v_tkt_ag2_unsold : octroyé par Resp A à Agent 2, statut ASSIGNED_TO_AGENT (non vendu)
  INSERT INTO public.tickets (
    id, ticket_number, generation_batch, carnet_id, qr_payload, status, price,
    assigned_responsable_id, assigned_agent_id, sector_id, sold_at, plate_number
  ) VALUES
    (v_tkt_a_sold,     'P1A-000001', 'P1-BATCH', v_carnet_a_id, 'QR-P1A-1', 'SOLD',                    5000, v_resp_a_id, v_agent_1_id, NULL, now(), '1111CI01'),
    (v_tkt_a_free,     'P1A-000002', 'P1-BATCH', v_carnet_a_id, 'QR-P1A-2', 'ASSIGNED_TO_RESPONSIBLE', 5000, v_resp_a_id, NULL,         NULL, NULL,  NULL),
    (v_tkt_b_sold,     'P1B-000004', 'P1-BATCH', v_carnet_b_id, 'QR-P1B-4', 'SOLD',                    5000, v_resp_b_id, v_agent_1_id, NULL, now(), '2222CI01'),
    (v_tkt_ag2_unsold, 'P1A-000003', 'P1-BATCH', v_carnet_a_id, 'QR-P1A-3', 'ASSIGNED_TO_AGENT',       5000, v_resp_a_id, v_agent_2_id, NULL, NULL,  NULL)
  ON CONFLICT (id) DO NOTHING;
END $$;

CREATE TEMP TABLE p1_rls_results (
  case_no INT PRIMARY KEY,
  case_label TEXT NOT NULL,
  actual_result TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  passed BOOLEAN NOT NULL
) ON COMMIT DROP;

GRANT ALL ON TABLE p1_rls_results TO authenticated;

-- Bascule en rôle PostgreSQL 'authenticated' (soumis à RLS)
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_admin_id       UUID := '00000000-0000-4000-a000-000000000001';
  v_resp_a_id      UUID := '00000000-0000-4000-a000-000000000002';
  v_resp_b_id      UUID := '00000000-0000-4000-a000-000000000003';
  v_agent_1_id     UUID := '00000000-0000-4000-a000-000000000004';
  v_agent_2_id     UUID := '00000000-0000-4000-a000-000000000005';
  v_ctrl_id        UUID := '00000000-0000-4000-a000-000000000006';
  v_tkt_a_sold     UUID := '00000000-0000-4000-c000-000000000001';
  v_tkt_a_free     UUID := '00000000-0000-4000-c000-000000000002';
  v_tkt_b_sold     UUID := '00000000-0000-4000-c000-000000000003';
  v_tkt_ag2_unsold UUID := '00000000-0000-4000-c000-000000000004';

  v_other_tickets  INT;
  v_remises_count  INT;
  v_other_profiles INT;
  v_own_profiles   INT;
  v_updated_rows   INT;
  v_remise_row     public.remittances%ROWTYPE;
  v_covered_check  UUID;
  v_err_msg        TEXT;
  v_ctrl_agents    INT;
  v_total_agents   INT;
  v_ctrl_non_agent INT;
  v_ctrl_remises   INT;
  v_admin_profiles INT;
  v_admin_tickets  INT;
  v_admin_remises  INT;
BEGIN
  -- ==========================================================================
  -- CAS 1 : AGENT 1 lit 0 ticket d'autrui, 0 remise, 0 profil sauf le sien
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_agent_1_id, 'role', 'authenticated')::text, true);

  SELECT COUNT(*) INTO v_other_tickets FROM public.tickets WHERE assigned_agent_id IS DISTINCT FROM v_agent_1_id;
  SELECT COUNT(*) INTO v_remises_count FROM public.remittances;
  SELECT COUNT(*) INTO v_other_profiles FROM public.profiles WHERE id <> v_agent_1_id;
  SELECT COUNT(*) INTO v_own_profiles FROM public.profiles WHERE id = v_agent_1_id;

  INSERT INTO p1_rls_results VALUES (
    1,
    'AGENT lit 0 ticket d''autrui, 0 remise, 0 profil tiers (et 1 profil propre)',
    format('other_tickets=%s, remises=%s, other_profiles=%s, own_profile=%s', v_other_tickets, v_remises_count, v_other_profiles, v_own_profiles),
    'other_tickets=0, remises=0, other_profiles=0, own_profile=1',
    (v_other_tickets = 0 AND v_remises_count = 0 AND v_other_profiles = 0 AND v_own_profiles = 1)
  );

  -- ==========================================================================
  -- CAS 2 : AGENT 1 tente un UPDATE sur le ticket d'Agent 2 -> 0 ligne affectée
  -- ==========================================================================
  UPDATE public.tickets
     SET status = 'SOLD', plate_number = 'HACK01', sold_at = now()
   WHERE id = v_tkt_ag2_unsold;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  INSERT INTO p1_rls_results VALUES (
    2,
    'AGENT UPDATE sur ticket d''autrui affecte 0 ligne',
    format('updated_rows=%s', v_updated_rows),
    'updated_rows=0',
    (v_updated_rows = 0)
  );

  -- ==========================================================================
  -- CAS 3 : RESPONSABLE A appelle record_remittance pour son propre octroi
  --         (v_tkt_a_sold) d'un agent sans secteur -> SUCCÈS + ticket couvert
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_resp_a_id, 'role', 'authenticated')::text, true);

  v_remise_row := public.record_remittance(v_agent_1_id, 5000, 'Remise test P1 Resp A');
  SELECT covered_by_remittance_id INTO v_covered_check FROM public.tickets WHERE id = v_tkt_a_sold;

  INSERT INTO p1_rls_results VALUES (
    3,
    'RESPONSABLE A encaisse son propre octroi (agent sans secteur) -> succès & ticket couvert',
    format('amount=%s, tickets_count=%s, sector_id=%s, covered=%s',
      v_remise_row.amount, v_remise_row.tickets_count, COALESCE(v_remise_row.sector_id::text, 'NULL'), (v_covered_check = v_remise_row.id)),
    'amount=5000, tickets_count=1, sector_id=NULL, covered=true',
    (v_remise_row.amount = 5000 AND v_remise_row.tickets_count = 1 AND v_remise_row.sector_id IS NULL AND v_covered_check = v_remise_row.id)
  );

  -- ==========================================================================
  -- CAS 4 : RESPONSABLE A appelle record_remittance pour un ticket octroyé par B
  --         (il ne reste que v_tkt_b_sold pour Agent 1) -> EXCEPTION
  -- ==========================================================================
  v_err_msg := 'NO_ERROR';
  BEGIN
    PERFORM public.record_remittance(v_agent_1_id, 5000, 'Tentative sur ticket de Resp B');
  EXCEPTION WHEN OTHERS THEN
    v_err_msg := SQLSTATE;
  END;

  INSERT INTO p1_rls_results VALUES (
    4,
    'RESPONSABLE A appelle record_remittance pour un ticket octroyé par B -> exception',
    format('sqlstate=%s', v_err_msg),
    'sqlstate=42501',
    (v_err_msg = '42501')
  );

  -- ==========================================================================
  -- CAS 5 : assign_tickets sur Agent 2 ayant déjà un ticket ASSIGNED_TO_AGENT non vendu -> EXCEPTION
  -- ==========================================================================
  v_err_msg := 'NO_ERROR';
  BEGIN
    PERFORM public.assign_tickets(ARRAY[v_tkt_a_free], v_agent_2_id);
  EXCEPTION WHEN OTHERS THEN
    v_err_msg := SQLSTATE;
  END;

  INSERT INTO p1_rls_results VALUES (
    5,
    'assign_tickets sur agent ayant un ticket ASSIGNED_TO_AGENT non vendu -> exception',
    format('sqlstate=%s', v_err_msg),
    'sqlstate=P0001',
    (v_err_msg = 'P0001')
  );

  -- ==========================================================================
  -- CAS 6 : AGENT 1 relit public.remittances après création d'une remise pour lui -> 0 ligne
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_agent_1_id, 'role', 'authenticated')::text, true);
  SELECT COUNT(*) INTO v_remises_count FROM public.remittances;

  INSERT INTO p1_rls_results VALUES (
    6,
    'AGENT lit 0 remise même après qu''une remise a été créée pour lui',
    format('remises=%s', v_remises_count),
    'remises=0',
    (v_remises_count = 0)
  );

  -- ==========================================================================
  -- CAS 7 : CONTROLEUR lit tous les profils AGENT et 0 remise
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ctrl_id, 'role', 'authenticated')::text, true);

  SELECT COUNT(*) INTO v_ctrl_agents FROM public.profiles WHERE role = 'AGENT';
  SELECT COUNT(*) INTO v_ctrl_non_agent FROM public.profiles WHERE role <> 'AGENT' AND id <> v_ctrl_id;
  SELECT COUNT(*) INTO v_ctrl_remises FROM public.remittances;

  INSERT INTO p1_rls_results VALUES (
    7,
    'CONTROLEUR lit tous les profils AGENT (>=2), 0 autre rôle tiers, et 0 remise',
    format('agents_read=%s, other_roles_read=%s, remises_read=%s', (v_ctrl_agents >= 2), v_ctrl_non_agent, v_ctrl_remises),
    'agents_read=true, other_roles_read=0, remises_read=0',
    (v_ctrl_agents >= 2 AND v_ctrl_non_agent = 0 AND v_ctrl_remises = 0)
  );

  -- ==========================================================================
  -- CAS 8 : ADMINISTRATEUR lit tout (tous profils, tous tickets, toutes remises)
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);

  SELECT COUNT(*) INTO v_admin_profiles FROM public.profiles WHERE id IN (v_admin_id, v_resp_a_id, v_resp_b_id, v_agent_1_id, v_agent_2_id, v_ctrl_id);
  SELECT COUNT(*) INTO v_admin_tickets FROM public.tickets WHERE id IN (v_tkt_a_sold, v_tkt_a_free, v_tkt_b_sold, v_tkt_ag2_unsold);
  SELECT COUNT(*) INTO v_admin_remises FROM public.remittances WHERE id = v_remise_row.id;

  INSERT INTO p1_rls_results VALUES (
    8,
    'ADMIN lit tout (6 profils test, 4 tickets test, remise créée)',
    format('profiles=%s, tickets=%s, remises=%s', v_admin_profiles, v_admin_tickets, v_admin_remises),
    'profiles=6, tickets=4, remises=1',
    (v_admin_profiles = 6 AND v_admin_tickets = 4 AND v_admin_remises = 1)
  );
END $$;

RESET ROLE;

SELECT case_no, case_label, actual_result, expected_result, passed
  FROM p1_rls_results
 ORDER BY case_no;

ROLLBACK;
