-- =============================================================================
-- PORTUS — U.J.P.A.S.
-- Migration : db/migrations/08_rbac_remittances.sql
-- Phase     : P1 — Base de données (RLS, record_remittance, assign_tickets, durcissement)
-- Source de vérité : p0_snapshot (/public/assets/aistudio/Paste_October_21__2026_-_9_39PM_abacb3a2)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- P1.1 & P1.2 — Colonnes requises, schéma remittances & séquence déterministe
-- -----------------------------------------------------------------------------
ALTER TABLE public.carnets
  ADD COLUMN IF NOT EXISTS assigned_to_responsable uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS assigned_responsable_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS covered_by_remittance_id uuid;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS covered_by_remittance_id uuid,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + '14 days'::interval);

ALTER TABLE public.sales ALTER COLUMN expires_at SET DEFAULT (now() + '14 days'::interval);

ALTER TABLE public.remittances ALTER COLUMN sector_id DROP NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.remittance_ref_seq
  INCREMENT 1
  MINVALUE 1
  START 1
  CACHE 1;

-- -----------------------------------------------------------------------------
-- P1.3 — Suppression nominative de TOUTES les policies existantes (issues de p0_snapshot
-- et de SupabaseModal.tsx) pour éliminer tout qual = true ou doublon
-- -----------------------------------------------------------------------------

-- 1. public.app_settings
DROP POLICY IF EXISTS "Read app settings authenticated" ON public.app_settings;
DROP POLICY IF EXISTS "Read non-secret app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "settings_admin" ON public.app_settings;
DROP POLICY IF EXISTS "Settings: Lecture publique" ON public.app_settings;
DROP POLICY IF EXISTS "Settings: Ecriture Admin" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_select_policy" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_write_policy" ON public.app_settings;

-- 2. public.audit_logs
DROP POLICY IF EXISTS "Admin and Responsable select audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated insert audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_admin_read" ON public.audit_logs;
DROP POLICY IF EXISTS "Admin full access audit" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit View Policy" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit Insert Policy" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit: Lecture Admin" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit: Insertion Systeme" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;

-- 3. public.carnets
DROP POLICY IF EXISTS "Authenticated read carnets" ON public.carnets;
DROP POLICY IF EXISTS "Responsable access carnets" ON public.carnets;
DROP POLICY IF EXISTS "carnets_admin" ON public.carnets;
DROP POLICY IF EXISTS "carnets_resp_read" ON public.carnets;
DROP POLICY IF EXISTS "Admin full access carnets" ON public.carnets;
DROP POLICY IF EXISTS "Carnets View Policy" ON public.carnets;
DROP POLICY IF EXISTS "Carnets Write Policy" ON public.carnets;
DROP POLICY IF EXISTS "Carnets: Lecture" ON public.carnets;
DROP POLICY IF EXISTS "Carnets: Ecriture" ON public.carnets;
DROP POLICY IF EXISTS "carnets_select_policy" ON public.carnets;
DROP POLICY IF EXISTS "carnets_insert_policy" ON public.carnets;
DROP POLICY IF EXISTS "carnets_update_policy" ON public.carnets;
DROP POLICY IF EXISTS "carnets_delete_policy" ON public.carnets;

-- 4. public.controls
DROP POLICY IF EXISTS "controls_admin" ON public.controls;
DROP POLICY IF EXISTS "controls_controller_insert" ON public.controls;
DROP POLICY IF EXISTS "controls_controller_read" ON public.controls;
DROP POLICY IF EXISTS "Admin full access controls" ON public.controls;
DROP POLICY IF EXISTS "Controleur insert control" ON public.controls;
DROP POLICY IF EXISTS "Controls: Lecture" ON public.controls;
DROP POLICY IF EXISTS "Controls: Insertion" ON public.controls;
DROP POLICY IF EXISTS "controls_select_policy" ON public.controls;
DROP POLICY IF EXISTS "controls_insert_policy" ON public.controls;

-- 5. public.daily_closings
DROP POLICY IF EXISTS "daily_closings_insert_finance" ON public.daily_closings;
DROP POLICY IF EXISTS "daily_closings_read_finance" ON public.daily_closings;
DROP POLICY IF EXISTS "daily_closings_update_finance" ON public.daily_closings;
DROP POLICY IF EXISTS "Closings: Lecture" ON public.daily_closings;
DROP POLICY IF EXISTS "Closings: Soumission" ON public.daily_closings;
DROP POLICY IF EXISTS "Closings: Validation Admin" ON public.daily_closings;
DROP POLICY IF EXISTS "daily_closings_select_policy" ON public.daily_closings;
DROP POLICY IF EXISTS "daily_closings_insert_policy" ON public.daily_closings;
DROP POLICY IF EXISTS "daily_closings_update_policy" ON public.daily_closings;

-- 6. public.expenses
DROP POLICY IF EXISTS "Authenticated read expenses" ON public.expenses;
DROP POLICY IF EXISTS "Insert expenses for admin and responsable" ON public.expenses;
DROP POLICY IF EXISTS "Read expenses for admin and responsable" ON public.expenses;
DROP POLICY IF EXISTS "Responsable and Admin manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "Update Delete expenses for admin" ON public.expenses;
DROP POLICY IF EXISTS "Expenses: Lecture" ON public.expenses;
DROP POLICY IF EXISTS "Expenses: Creation" ON public.expenses;
DROP POLICY IF EXISTS "Expenses: Mise a jour" ON public.expenses;
DROP POLICY IF EXISTS "Expenses: Suppression Admin" ON public.expenses;
DROP POLICY IF EXISTS "expenses_select_policy" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert_policy" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update_policy" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete_policy" ON public.expenses;

-- 7. public.fraud_reports
DROP POLICY IF EXISTS "fraud_admin" ON public.fraud_reports;
DROP POLICY IF EXISTS "fraud_controller_insert" ON public.fraud_reports;
DROP POLICY IF EXISTS "fraud_controller_read" ON public.fraud_reports;
DROP POLICY IF EXISTS "fraud_resp_read_scoped" ON public.fraud_reports;
DROP POLICY IF EXISTS "Admin full access fraud" ON public.fraud_reports;
DROP POLICY IF EXISTS "Frauds: Lecture" ON public.fraud_reports;
DROP POLICY IF EXISTS "Frauds: Signalement" ON public.fraud_reports;
DROP POLICY IF EXISTS "Frauds: Resolution" ON public.fraud_reports;
DROP POLICY IF EXISTS "fraud_reports_select_policy" ON public.fraud_reports;
DROP POLICY IF EXISTS "fraud_reports_insert_policy" ON public.fraud_reports;
DROP POLICY IF EXISTS "fraud_reports_update_policy" ON public.fraud_reports;

-- 8. public.incidents
DROP POLICY IF EXISTS "Creation incidents par agents" ON public.incidents;
DROP POLICY IF EXISTS "Lecture incidents pour tous" ON public.incidents;
DROP POLICY IF EXISTS "Incidents: Lecture" ON public.incidents;
DROP POLICY IF EXISTS "Incidents: Signalement" ON public.incidents;
DROP POLICY IF EXISTS "Incidents: Resolution" ON public.incidents;
DROP POLICY IF EXISTS "incidents_select_policy" ON public.incidents;
DROP POLICY IF EXISTS "incidents_insert_policy" ON public.incidents;
DROP POLICY IF EXISTS "incidents_update_policy" ON public.incidents;

-- 9. public.login_attempts
DROP POLICY IF EXISTS "login_attempts_admin_read" ON public.login_attempts;
DROP POLICY IF EXISTS "LoginAttempts: Lecture Admin" ON public.login_attempts;
DROP POLICY IF EXISTS "LoginAttempts: Insertion" ON public.login_attempts;
DROP POLICY IF EXISTS "login_attempts_select_policy" ON public.login_attempts;

-- 10. public.notifications
DROP POLICY IF EXISTS "Authenticated insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "User update own notifications read status" ON public.notifications;
DROP POLICY IF EXISTS "notifications_self" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: Lecture" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: Creation" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: Marquage lu" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: Suppression" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_policy" ON public.notifications;

-- 11. public.profiles
DROP POLICY IF EXISTS "Authenticated read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Lecture globale des profils actifs UJPAS" ON public.profiles;
DROP POLICY IF EXISTS "Mise a jour utilisateur restreinte" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_safe_self" ON public.profiles;
DROP POLICY IF EXISTS "Admin full access profiles" ON public.profiles;
DROP POLICY IF EXISTS "Responsable read sector profiles" ON public.profiles;
DROP POLICY IF EXISTS "User read own profile" ON public.profiles;
DROP POLICY IF EXISTS "User update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles View Policy" ON public.profiles;
DROP POLICY IF EXISTS "Profiles Update Policy" ON public.profiles;
DROP POLICY IF EXISTS "Profiles Insert Policy" ON public.profiles;
DROP POLICY IF EXISTS "Profiles Delete Policy" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Lecture" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Modification Admin" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Update Self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

-- 12. public.remittance_adjustments
DROP POLICY IF EXISTS "remittance_adjustments_admin" ON public.remittance_adjustments;
DROP POLICY IF EXISTS "remittance_adjustments_resp_read_scoped" ON public.remittance_adjustments;
DROP POLICY IF EXISTS "remittance_adjustments_select_policy" ON public.remittance_adjustments;
DROP POLICY IF EXISTS "remittance_adjustments_write_policy" ON public.remittance_adjustments;

-- 13. public.remittances
DROP POLICY IF EXISTS "Agent read own remittances" ON public.remittances;
DROP POLICY IF EXISTS "Authenticated read remittances" ON public.remittances;
DROP POLICY IF EXISTS "Responsable and Admin manage remittances" ON public.remittances;
DROP POLICY IF EXISTS "rem_admin" ON public.remittances;
DROP POLICY IF EXISTS "rem_resp_insert" ON public.remittances;
DROP POLICY IF EXISTS "rem_resp_read" ON public.remittances;
DROP POLICY IF EXISTS "remittances_select_policy" ON public.remittances;
DROP POLICY IF EXISTS "ujpas_remittances_all_access" ON public.remittances;
DROP POLICY IF EXISTS "Admin full access remittances" ON public.remittances;
DROP POLICY IF EXISTS "Remittances View Policy" ON public.remittances;
DROP POLICY IF EXISTS "Remittances Insert Policy" ON public.remittances;
DROP POLICY IF EXISTS "Remittances Update Policy" ON public.remittances;
DROP POLICY IF EXISTS "Remittances: Lecture" ON public.remittances;
DROP POLICY IF EXISTS "Remittances: Insertion" ON public.remittances;
DROP POLICY IF EXISTS "Remittances: Validation" ON public.remittances;
DROP POLICY IF EXISTS "remittances_insert_policy" ON public.remittances;
DROP POLICY IF EXISTS "remittances_update_policy" ON public.remittances;

-- 14. public.roles
DROP POLICY IF EXISTS "Authenticated read roles" ON public.roles;
DROP POLICY IF EXISTS "Read roles authenticated" ON public.roles;
DROP POLICY IF EXISTS "roles_select_policy" ON public.roles;
DROP POLICY IF EXISTS "roles_write_policy" ON public.roles;

-- 15. public.sales
DROP POLICY IF EXISTS "Authenticated read sales" ON public.sales;
DROP POLICY IF EXISTS "Responsable and Admin insert sales" ON public.sales;
DROP POLICY IF EXISTS "sales_admin" ON public.sales;
DROP POLICY IF EXISTS "sales_agent_insert" ON public.sales;
DROP POLICY IF EXISTS "sales_agent_read" ON public.sales;
DROP POLICY IF EXISTS "sales_resp_read" ON public.sales;
DROP POLICY IF EXISTS "Admin full access sales" ON public.sales;
DROP POLICY IF EXISTS "Agent insert own sale" ON public.sales;
DROP POLICY IF EXISTS "Sales View Policy" ON public.sales;
DROP POLICY IF EXISTS "Sales Insert Policy" ON public.sales;
DROP POLICY IF EXISTS "Sales: Lecture" ON public.sales;
DROP POLICY IF EXISTS "Sales: Insertion Agent" ON public.sales;
DROP POLICY IF EXISTS "Sales: Modification" ON public.sales;
DROP POLICY IF EXISTS "Sales: Suppression Admin" ON public.sales;
DROP POLICY IF EXISTS "sales_select_policy" ON public.sales;
DROP POLICY IF EXISTS "sales_insert_policy" ON public.sales;
DROP POLICY IF EXISTS "sales_delete_policy" ON public.sales;

-- 16. public.sectors
DROP POLICY IF EXISTS "Authenticated read sectors" ON public.sectors;
DROP POLICY IF EXISTS "sectors_admin" ON public.sectors;
DROP POLICY IF EXISTS "sectors_read" ON public.sectors;
DROP POLICY IF EXISTS "Sectors: Lecture publique" ON public.sectors;
DROP POLICY IF EXISTS "Sectors: Ecriture Admin" ON public.sectors;
DROP POLICY IF EXISTS "sectors_select_policy" ON public.sectors;
DROP POLICY IF EXISTS "sectors_write_policy" ON public.sectors;

-- 17. public.sync_queue
DROP POLICY IF EXISTS "Agent manage own sync queue" ON public.sync_queue;
DROP POLICY IF EXISTS "Authenticated manage own sync_queue" ON public.sync_queue;
DROP POLICY IF EXISTS "sync_admin" ON public.sync_queue;
DROP POLICY IF EXISTS "Sync: Acces proprietaire" ON public.sync_queue;
DROP POLICY IF EXISTS "sync_queue_select_policy" ON public.sync_queue;
DROP POLICY IF EXISTS "sync_queue_insert_policy" ON public.sync_queue;
DROP POLICY IF EXISTS "sync_queue_update_policy" ON public.sync_queue;
DROP POLICY IF EXISTS "sync_queue_delete_policy" ON public.sync_queue;

-- 18. public.ticket_assignments
DROP POLICY IF EXISTS "Admin and Responsable insert ticket_assignments" ON public.ticket_assignments;
DROP POLICY IF EXISTS "Authenticated select ticket_assignments" ON public.ticket_assignments;
DROP POLICY IF EXISTS "ticket_assignments_admin" ON public.ticket_assignments;
DROP POLICY IF EXISTS "ticket_assignments_resp_insert" ON public.ticket_assignments;
DROP POLICY IF EXISTS "ticket_assignments_resp_read_scoped" ON public.ticket_assignments;
DROP POLICY IF EXISTS "ticket_assignments_select_policy" ON public.ticket_assignments;
DROP POLICY IF EXISTS "ticket_assignments_insert_policy" ON public.ticket_assignments;

-- 19. public.ticket_status_history
DROP POLICY IF EXISTS "Authenticated insert ticket_status_history" ON public.ticket_status_history;
DROP POLICY IF EXISTS "Authenticated select ticket_status_history" ON public.ticket_status_history;
DROP POLICY IF EXISTS "ticket_status_history_admin" ON public.ticket_status_history;
DROP POLICY IF EXISTS "ticket_status_history_resp_read_scoped" ON public.ticket_status_history;
DROP POLICY IF EXISTS "ticket_status_history_select_policy" ON public.ticket_status_history;
DROP POLICY IF EXISTS "ticket_status_history_insert_policy" ON public.ticket_status_history;

-- 20. public.tickets
DROP POLICY IF EXISTS "Agent and Controleur update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Authenticated read tickets" ON public.tickets;
DROP POLICY IF EXISTS "Responsable manage tickets" ON public.tickets;
DROP POLICY IF EXISTS "tickets_admin" ON public.tickets;
DROP POLICY IF EXISTS "tickets_agent_read" ON public.tickets;
DROP POLICY IF EXISTS "tickets_controller_read" ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert_admin_responsable" ON public.tickets;
DROP POLICY IF EXISTS "tickets_resp_read" ON public.tickets;
DROP POLICY IF EXISTS "tickets_update_operational" ON public.tickets;
DROP POLICY IF EXISTS "Admin full access tickets" ON public.tickets;
DROP POLICY IF EXISTS "Agent read assigned tickets" ON public.tickets;
DROP POLICY IF EXISTS "Controleur verify tickets" ON public.tickets;
DROP POLICY IF EXISTS "Tickets View Policy" ON public.tickets;
DROP POLICY IF EXISTS "Tickets Insert Policy" ON public.tickets;
DROP POLICY IF EXISTS "Tickets Update Policy" ON public.tickets;
DROP POLICY IF EXISTS "Tickets Delete Policy" ON public.tickets;
DROP POLICY IF EXISTS "Tickets: Lecture globale" ON public.tickets;
DROP POLICY IF EXISTS "Tickets: Creation Admin" ON public.tickets;
DROP POLICY IF EXISTS "Tickets: Mise a jour" ON public.tickets;
DROP POLICY IF EXISTS "Tickets: Suppression Admin" ON public.tickets;
DROP POLICY IF EXISTS "tickets_select_policy" ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert_policy" ON public.tickets;
DROP POLICY IF EXISTS "tickets_update_policy" ON public.tickets;
DROP POLICY IF EXISTS "tickets_delete_policy" ON public.tickets;

-- 21. public.vehicles
DROP POLICY IF EXISTS "vehicles_owner_update" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_staff_insert" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_staff_select" ON public.vehicles;
DROP POLICY IF EXISTS "Vehicles: Lecture" ON public.vehicles;
DROP POLICY IF EXISTS "Vehicles: Ecriture" ON public.vehicles;
DROP POLICY IF EXISTS "Vehicles: Mise a jour" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_select_policy" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_insert_policy" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_update_policy" ON public.vehicles;

-- -----------------------------------------------------------------------------
-- Activation explicite de RLS sur les 21 tables publiques de p0_snapshot
-- -----------------------------------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Nouvelles policies RLS strictes par rôle (matrice P1.3)
-- -----------------------------------------------------------------------------

-- 1. public.profiles
-- ADMINISTRATEUR : tous ; RESPONSABLE : soi + tous les AGENT ; CONTROLEUR : soi + tous les AGENT (trombinoscope) ; AGENT : soi uniquement.
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() IN ('RESPONSABLE', 'CONTROLEUR') AND role = 'AGENT')
  );

CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
  )
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

CREATE POLICY "profiles_delete_policy" ON public.profiles
  FOR DELETE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

-- 2. public.carnets (colonne exacte de p0_snapshot : assigned_to_responsable)
CREATE POLICY "carnets_select_policy" ON public.carnets
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() = 'RESPONSABLE' AND assigned_to_responsable = auth.uid())
  );

CREATE POLICY "carnets_insert_policy" ON public.carnets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

CREATE POLICY "carnets_update_policy" ON public.carnets
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() = 'RESPONSABLE' AND assigned_to_responsable = auth.uid())
  )
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() = 'RESPONSABLE' AND assigned_to_responsable = auth.uid())
  );

CREATE POLICY "carnets_delete_policy" ON public.carnets
  FOR DELETE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

-- 3. public.tickets (colonnes exactes de p0_snapshot : assigned_responsable_id, assigned_agent_id, status)
CREATE POLICY "tickets_select_policy" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (
      public.get_current_role() = 'RESPONSABLE'
      AND (assigned_responsable_id = auth.uid() OR status = 'ASSIGNED_TO_AGENT')
    )
    OR (
      public.get_current_role() = 'AGENT'
      AND assigned_agent_id = auth.uid()
    )
    OR (
      public.get_current_role() = 'CONTROLEUR'
      AND status IN ('SOLD', 'CONTROLLED')
    )
  );

CREATE POLICY "tickets_insert_policy" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

CREATE POLICY "tickets_update_policy" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() = 'RESPONSABLE' AND assigned_responsable_id = auth.uid())
    OR (public.get_current_role() = 'AGENT' AND assigned_agent_id = auth.uid())
    OR (public.get_current_role() = 'CONTROLEUR' AND status IN ('SOLD', 'CONTROLLED'))
  )
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() = 'RESPONSABLE' AND assigned_responsable_id = auth.uid())
    OR (public.get_current_role() = 'AGENT' AND assigned_agent_id = auth.uid())
    OR (public.get_current_role() = 'CONTROLEUR' AND status = 'CONTROLLED')
  );

CREATE POLICY "tickets_delete_policy" ON public.tickets
  FOR DELETE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

-- 4. public.sales (colonnes exactes de p0_snapshot : ticket_id, agent_id)
CREATE POLICY "sales_select_policy" ON public.sales
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (
      public.get_current_role() = 'RESPONSABLE'
      AND EXISTS (
        SELECT 1
        FROM public.tickets t
        WHERE t.id = sales.ticket_id
          AND t.assigned_responsable_id = auth.uid()
      )
    )
    OR (
      public.get_current_role() = 'AGENT'
      AND agent_id = auth.uid()
    )
  );

CREATE POLICY "sales_insert_policy" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (
      public.get_current_role() IN ('AGENT', 'RESPONSABLE')
      AND agent_id = auth.uid()
    )
  );

CREATE POLICY "sales_delete_policy" ON public.sales
  FOR DELETE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

-- 5. public.remittances (colonnes exactes de p0_snapshot : responsable_id, agent_id)
-- ADMINISTRATEUR : toutes ; RESPONSABLE : responsable_id = auth.uid() ; AGENT : AUCUN ACCÈS ; CONTROLEUR : AUCUN ACCÈS.
CREATE POLICY "remittances_select_policy" ON public.remittances
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() = 'RESPONSABLE' AND responsable_id = auth.uid())
  );

CREATE POLICY "remittances_insert_policy" ON public.remittances
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

CREATE POLICY "remittances_update_policy" ON public.remittances
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
  )
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

-- 6. public.remittance_adjustments
CREATE POLICY "remittance_adjustments_select_policy" ON public.remittance_adjustments
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (
      public.get_current_role() = 'RESPONSABLE'
      AND EXISTS (
        SELECT 1
        FROM public.remittances r
        WHERE r.id = remittance_adjustments.remittance_id
          AND r.responsable_id = auth.uid()
      )
    )
  );

CREATE POLICY "remittance_adjustments_write_policy" ON public.remittance_adjustments
  FOR ALL TO authenticated
  USING (public.get_current_role() = 'ADMINISTRATEUR')
  WITH CHECK (public.get_current_role() = 'ADMINISTRATEUR');

-- 7. public.controls (colonne exacte de p0_snapshot : controleur_id)
CREATE POLICY "controls_select_policy" ON public.controls
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
    OR (public.get_current_role() = 'CONTROLEUR' AND controleur_id = auth.uid())
  );

CREATE POLICY "controls_insert_policy" ON public.controls
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('ADMINISTRATEUR', 'CONTROLEUR')
    AND controleur_id = auth.uid()
  );

-- 8. public.incidents (colonne exacte de p0_snapshot : reporter_id)
CREATE POLICY "incidents_select_policy" ON public.incidents
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
    OR reporter_id = auth.uid()
  );

CREATE POLICY "incidents_insert_policy" ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
  );

CREATE POLICY "incidents_update_policy" ON public.incidents
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
  )
  WITH CHECK (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
  );

-- 9. public.fraud_reports (colonne exacte de p0_snapshot : controleur_id)
CREATE POLICY "fraud_reports_select_policy" ON public.fraud_reports
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
    OR controleur_id = auth.uid()
  );

CREATE POLICY "fraud_reports_insert_policy" ON public.fraud_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('ADMINISTRATEUR', 'CONTROLEUR', 'RESPONSABLE', 'AGENT')
    AND controleur_id = auth.uid()
  );

CREATE POLICY "fraud_reports_update_policy" ON public.fraud_reports
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
  )
  WITH CHECK (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
  );

-- 10. public.expenses (colonnes exactes de p0_snapshot : created_by, responsible_id, status)
CREATE POLICY "expenses_select_policy" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() = 'RESPONSABLE' AND (created_by = auth.uid() OR responsible_id = auth.uid()))
  );

CREATE POLICY "expenses_insert_policy" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
    AND created_by = auth.uid()
  );

CREATE POLICY "expenses_update_policy" ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() = 'RESPONSABLE' AND created_by = auth.uid())
  )
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() = 'RESPONSABLE' AND created_by = auth.uid())
  );

CREATE POLICY "expenses_delete_policy" ON public.expenses
  FOR DELETE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

-- 11. public.daily_closings (colonne exacte de p0_snapshot : cashier_id)
CREATE POLICY "daily_closings_select_policy" ON public.daily_closings
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (public.get_current_role() = 'RESPONSABLE' AND cashier_id = auth.uid())
  );

CREATE POLICY "daily_closings_insert_policy" ON public.daily_closings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
    AND cashier_id = auth.uid()
  );

CREATE POLICY "daily_closings_update_policy" ON public.daily_closings
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
  )
  WITH CHECK (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

-- 12. public.audit_logs (colonne exacte de p0_snapshot : actor_id)
CREATE POLICY "audit_logs_select_policy" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

CREATE POLICY "audit_logs_insert_policy" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
  );

-- 13. public.notifications (colonne exacte de p0_snapshot : recipient_id)
CREATE POLICY "notifications_select_policy" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_id = auth.uid()
    OR public.get_current_role() = 'ADMINISTRATEUR'
  );

CREATE POLICY "notifications_insert_policy" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
    OR recipient_id = auth.uid()
  );

CREATE POLICY "notifications_update_policy" ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    recipient_id = auth.uid()
    OR public.get_current_role() = 'ADMINISTRATEUR'
  )
  WITH CHECK (
    recipient_id = auth.uid()
    OR public.get_current_role() = 'ADMINISTRATEUR'
  );

CREATE POLICY "notifications_delete_policy" ON public.notifications
  FOR DELETE TO authenticated
  USING (
    recipient_id = auth.uid()
    OR public.get_current_role() = 'ADMINISTRATEUR'
  );

-- 14. public.app_settings (colonne exacte de p0_snapshot : key)
CREATE POLICY "app_settings_select_policy" ON public.app_settings
  FOR SELECT TO authenticated
  USING (key <> 'server_hmac_signing_key');

CREATE POLICY "app_settings_write_policy" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.get_current_role() = 'ADMINISTRATEUR' AND key <> 'server_hmac_signing_key')
  WITH CHECK (public.get_current_role() = 'ADMINISTRATEUR' AND key <> 'server_hmac_signing_key');

-- 15. public.roles
CREATE POLICY "roles_select_policy" ON public.roles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "roles_write_policy" ON public.roles
  FOR ALL TO authenticated
  USING (public.get_current_role() = 'ADMINISTRATEUR')
  WITH CHECK (public.get_current_role() = 'ADMINISTRATEUR');

-- 16. public.sectors
CREATE POLICY "sectors_select_policy" ON public.sectors
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "sectors_write_policy" ON public.sectors
  FOR ALL TO authenticated
  USING (public.get_current_role() = 'ADMINISTRATEUR')
  WITH CHECK (public.get_current_role() = 'ADMINISTRATEUR');

-- 17. public.vehicles
CREATE POLICY "vehicles_select_policy" ON public.vehicles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "vehicles_insert_policy" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR')
  );

CREATE POLICY "vehicles_update_policy" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR')
  )
  WITH CHECK (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR')
  );

-- 18. public.sync_queue (colonne exacte de p0_snapshot : agent_id)
CREATE POLICY "sync_queue_select_policy" ON public.sync_queue
  FOR SELECT TO authenticated
  USING (
    agent_id = auth.uid()
    OR public.get_current_role() = 'ADMINISTRATEUR'
  );

CREATE POLICY "sync_queue_insert_policy" ON public.sync_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id = auth.uid()
  );

CREATE POLICY "sync_queue_update_policy" ON public.sync_queue
  FOR UPDATE TO authenticated
  USING (
    agent_id = auth.uid()
    OR public.get_current_role() = 'ADMINISTRATEUR'
  )
  WITH CHECK (
    agent_id = auth.uid()
    OR public.get_current_role() = 'ADMINISTRATEUR'
  );

CREATE POLICY "sync_queue_delete_policy" ON public.sync_queue
  FOR DELETE TO authenticated
  USING (
    agent_id = auth.uid()
    OR public.get_current_role() = 'ADMINISTRATEUR'
  );

-- 19. public.ticket_assignments (colonnes exactes de p0_snapshot : ticket_id, assigned_by, to_profile_id)
CREATE POLICY "ticket_assignments_select_policy" ON public.ticket_assignments
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (
      public.get_current_role() = 'RESPONSABLE'
      AND (
        assigned_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.tickets t
          WHERE t.id = ticket_assignments.ticket_id
            AND t.assigned_responsable_id = auth.uid()
        )
      )
    )
    OR (
      public.get_current_role() = 'AGENT'
      AND to_profile_id = auth.uid()
    )
  );

CREATE POLICY "ticket_assignments_insert_policy" ON public.ticket_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() IN ('ADMINISTRATEUR', 'RESPONSABLE')
    AND assigned_by = auth.uid()
  );

-- 20. public.ticket_status_history (colonnes exactes de p0_snapshot : ticket_id, changed_by)
CREATE POLICY "ticket_status_history_select_policy" ON public.ticket_status_history
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
    OR (
      public.get_current_role() = 'RESPONSABLE'
      AND EXISTS (
        SELECT 1
        FROM public.tickets t
        WHERE t.id = ticket_status_history.ticket_id
          AND t.assigned_responsable_id = auth.uid()
      )
    )
    OR changed_by = auth.uid()
  );

CREATE POLICY "ticket_status_history_insert_policy" ON public.ticket_status_history
  FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
  );

-- 21. public.login_attempts
CREATE POLICY "login_attempts_select_policy" ON public.login_attempts
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMINISTRATEUR'
  );

-- -----------------------------------------------------------------------------
-- Mise à jour des triggers de protection (tickets, sales, remittances) avec les
-- noms de colonnes exacts de p0_snapshot
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_ticket_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'CANCELLED' AND (OLD.status IS NULL OR OLD.status <> 'CANCELLED') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Privilège insuffisant : Seul l’administrateur général est autorisé à annuler un ticket ou carnet.';
    END IF;
  END IF;

  IF OLD.status IN ('SOLD', 'CONTROLLED') AND NEW.status IN ('AVAILABLE', 'ASSIGNED_TO_RESPONSIBLE', 'ASSIGNED_TO_AGENT', 'GENERATED') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Violation d’intégrité : Impossible de réattribuer ou de libérer un ticket déjà vendu.';
    END IF;
  END IF;

  IF OLD.status IN ('SOLD', 'CONTROLLED') AND NOT public.is_admin() THEN
    IF NEW.price IS DISTINCT FROM OLD.price
       OR NEW.ticket_number IS DISTINCT FROM OLD.ticket_number
       OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
       OR NEW.plate_number IS DISTINCT FROM OLD.plate_number THEN
      RAISE EXCEPTION 'Modification des données financières ou d''identification d''un ticket vendu interdite.';
    END IF;
  END IF;

  IF OLD.covered_by_remittance_id IS NOT NULL
     AND NEW.covered_by_remittance_id IS DISTINCT FROM OLD.covered_by_remittance_id
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Un ticket déjà rattaché à une remise ne peut pas être réassigné.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_sale_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Violation de sécurité : Les ventes enregistrées sont immuables.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Autoriser le rattachement initial covered_by_remittance_id lors d'un encaissement record_remittance
    IF OLD.covered_by_remittance_id IS NULL
       AND NEW.covered_by_remittance_id IS NOT NULL
       AND NEW.ticket_id IS NOT DISTINCT FROM OLD.ticket_id
       AND NEW.agent_id IS NOT DISTINCT FROM OLD.agent_id
       AND NEW.plate_number IS NOT DISTINCT FROM OLD.plate_number
       AND NEW.price IS NOT DISTINCT FROM OLD.price
       AND NEW.sold_at IS NOT DISTINCT FROM OLD.sold_at THEN
      RETURN NEW;
    END IF;

    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Violation de sécurité : Les ventes enregistrées sont immuables.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_remittance_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Montant de remise invalide (%) : Le montant doit être strictement positif.', NEW.amount;
  END IF;

  IF COALESCE(array_length(NEW.ticket_ids_covered, 1), 0) > 0 THEN
    NEW.tickets_count := array_length(NEW.ticket_ids_covered, 1);
  ELSE
    NEW.tickets_count := FLOOR(NEW.amount / 5000);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Privilège insuffisant : Un responsable ne peut pas modifier une remise enregistrée. Seul l’administrateur peut procéder à un ajustement audité.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- P1.4 — Fonction SQL atomique record_remittance
-- Colonnes exactes de public.remittances dans p0_snapshot :
-- id, reference, agent_id, responsable_id, sector_id, amount, tickets_count,
-- ticket_ids_covered, date, time, note, is_corrected, created_at, updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_remittance(
  p_agent_id uuid,
  p_amount integer,
  p_note text DEFAULT NULL
)
RETURNS public.remittances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role public.user_role;
  v_caller_name text;
  v_agent_name text;
  v_agent_sector uuid;
  v_max_tickets integer;
  v_ticket_ids uuid[];
  v_tickets_count integer;
  v_expected integer;
  v_effective_amount integer;
  v_ref text;
  v_remittance public.remittances;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
  END IF;

  SELECT role, full_name
    INTO v_caller_role, v_caller_name
    FROM public.profiles
   WHERE id = v_caller_id
     AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('RESPONSABLE', 'ADMINISTRATEUR') THEN
    RAISE EXCEPTION 'Accès refusé : seuls un RESPONSABLE ou un ADMINISTRATEUR peuvent enregistrer une remise.'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant versé doit être strictement supérieur à 0 FCFA.'
      USING ERRCODE = '22023';
  END IF;

  SELECT full_name, sector_id
    INTO v_agent_name, v_agent_sector
    FROM public.profiles
   WHERE id = p_agent_id;

  IF v_agent_name IS NULL THEN
    RAISE EXCEPTION 'Agent introuvable.'
      USING ERRCODE = 'P0002';
  END IF;

  v_max_tickets := GREATEST(1, FLOOR(p_amount / 5000)::integer);

  -- Verrouillage FOR UPDATE des tickets éligibles :
  -- Statut SOLD ou CONTROLLED, non couverts (covered_by_remittance_id IS NULL),
  -- appartenant à l'agent (assigned_agent_id = p_agent_id),
  -- et si l'appelant est RESPONSABLE : uniquement ses tickets (assigned_responsable_id = v_caller_id).
  WITH locked_tickets AS (
    SELECT t.id, COALESCE(t.price, 5000) AS price
      FROM public.tickets t
     WHERE t.status IN ('SOLD', 'CONTROLLED')
       AND t.covered_by_remittance_id IS NULL
       AND t.assigned_agent_id = p_agent_id
       AND (
         v_caller_role = 'ADMINISTRATEUR'
         OR t.assigned_responsable_id = v_caller_id
       )
     ORDER BY t.sold_at ASC NULLS LAST, t.ticket_number ASC
     LIMIT v_max_tickets
     FOR UPDATE OF t
  )
  SELECT array_agg(id), count(*)::integer, COALESCE(sum(price), 0)::integer
    INTO v_ticket_ids, v_tickets_count, v_expected
    FROM locked_tickets;

  IF v_tickets_count IS NULL OR v_tickets_count = 0 THEN
    IF v_caller_role = 'RESPONSABLE' THEN
      RAISE EXCEPTION 'Aucun ticket vendu non encaissé octroyé par ce responsable pour cet agent.'
        USING ERRCODE = '42501';
    ELSE
      RAISE EXCEPTION 'Aucun ticket vendu non encaissé pour cet agent.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  v_effective_amount := LEAST(p_amount, v_expected);
  v_ref := 'REM-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.remittance_ref_seq')::text, 5, '0');

  INSERT INTO public.remittances (
    reference,
    agent_id,
    responsable_id,
    sector_id,
    amount,
    tickets_count,
    ticket_ids_covered,
    date,
    time,
    note,
    is_corrected,
    created_at,
    updated_at
  ) VALUES (
    v_ref,
    p_agent_id,
    v_caller_id,
    v_agent_sector,
    v_effective_amount,
    v_tickets_count,
    v_ticket_ids,
    CURRENT_DATE,
    CURRENT_TIME,
    p_note,
    false,
    now(),
    now()
  )
  RETURNING * INTO v_remittance;

  UPDATE public.tickets
     SET covered_by_remittance_id = v_remittance.id,
         updated_at = now()
   WHERE id = ANY(v_ticket_ids);

  UPDATE public.sales
     SET covered_by_remittance_id = v_remittance.id
   WHERE ticket_id = ANY(v_ticket_ids)
     AND covered_by_remittance_id IS NULL;

  INSERT INTO public.audit_logs (
    id,
    actor_id,
    actor_name,
    actor_role,
    action,
    timestamp,
    target_entity,
    target_id,
    new_value,
    details,
    created_at
  ) VALUES (
    gen_random_uuid()::text,
    v_caller_id,
    COALESCE(v_caller_name, 'Système'),
    v_caller_role,
    'RECORD_REMITTANCE',
    now(),
    'Remittance',
    v_remittance.id::text,
    jsonb_build_object(
      'reference', v_ref,
      'agent_id', p_agent_id,
      'responsable_id', v_caller_id,
      'tickets_count', v_tickets_count,
      'expected_amount', v_expected,
      'amount', v_effective_amount,
      'ticket_ids_covered', v_ticket_ids
    ),
    'Remise ' || v_ref || ' enregistrée pour ' || v_agent_name || ' (' || v_tickets_count || ' ticket(s), ' || v_effective_amount || ' FCFA)',
    now()
  );

  RETURN v_remittance;
END;
$$;

-- -----------------------------------------------------------------------------
-- P1.5 — Fonction SQL atomique assign_tickets (avec garde de stock actif)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_tickets(
  p_ticket_ids uuid[],
  p_agent_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role public.user_role;
  v_caller_name text;
  v_agent_role public.user_role;
  v_agent_active boolean;
  v_agent_name text;
  v_active_stock_count integer;
  v_eligible_ids uuid[];
  v_updated_count integer;
  v_tid uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
  END IF;

  SELECT role, full_name
    INTO v_caller_role, v_caller_name
    FROM public.profiles
   WHERE id = v_caller_id
     AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('RESPONSABLE', 'ADMINISTRATEUR') THEN
    RAISE EXCEPTION 'Accès refusé : seuls un RESPONSABLE ou un ADMINISTRATEUR peuvent attribuer des tickets.'
      USING ERRCODE = '42501';
  END IF;

  IF p_ticket_ids IS NULL OR COALESCE(array_length(p_ticket_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Aucun ticket sélectionné.'
      USING ERRCODE = '22023';
  END IF;

  SELECT role, is_active, full_name
    INTO v_agent_role, v_agent_active, v_agent_name
    FROM public.profiles
   WHERE id = p_agent_id;

  IF v_agent_role IS NULL OR v_agent_role <> 'AGENT' OR v_agent_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Le bénéficiaire doit être un profil AGENT actif.'
      USING ERRCODE = '22023';
  END IF;

  -- Garde stricte : refus si l'agent possède déjà >= 1 ticket en statut ASSIGNED_TO_AGENT
  SELECT count(*)::integer
    INTO v_active_stock_count
    FROM public.tickets
   WHERE assigned_agent_id = p_agent_id
     AND status = 'ASSIGNED_TO_AGENT';

  IF v_active_stock_count > 0 THEN
    RAISE EXCEPTION 'Attribution refusée : l''agent % détient déjà % ticket(s) actif(s) non vendu(s) (ASSIGNED_TO_AGENT).',
      v_agent_name, v_active_stock_count
      USING ERRCODE = 'P0001';
  END IF;

  -- Verrouillage FOR UPDATE des tickets demandés et vérification de propriété/statut
  WITH locked AS (
    SELECT t.id
      FROM public.tickets t
     WHERE t.id = ANY(p_ticket_ids)
       AND t.status IN ('AVAILABLE', 'GENERATED', 'ASSIGNED_TO_RESPONSIBLE')
       AND t.assigned_agent_id IS NULL
       AND (
         v_caller_role = 'ADMINISTRATEUR'
         OR t.assigned_responsable_id = v_caller_id
       )
     FOR UPDATE OF t
  )
  SELECT array_agg(id)
    INTO v_eligible_ids
    FROM locked;

  IF v_eligible_ids IS NULL OR COALESCE(array_length(v_eligible_ids, 1), 0) <> array_length(p_ticket_ids, 1) THEN
    RAISE EXCEPTION 'Certains tickets ne sont pas disponibles ou n''appartiennent pas à ce responsable.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.tickets
     SET status = 'ASSIGNED_TO_AGENT',
         assigned_agent_id = p_agent_id,
         assigned_responsable_id = COALESCE(assigned_responsable_id, v_caller_id),
         updated_at = now()
   WHERE id = ANY(v_eligible_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  FOREACH v_tid IN ARRAY v_eligible_ids LOOP
    INSERT INTO public.ticket_status_history (
      ticket_id, old_status, new_status, changed_by, changed_at, reason
    ) VALUES (
      v_tid, 'ASSIGNED_TO_RESPONSIBLE', 'ASSIGNED_TO_AGENT', v_caller_id, now(),
      'Attribution à l’agent ' || v_agent_name
    );
  END LOOP;

  INSERT INTO public.audit_logs (
    id,
    actor_id,
    actor_name,
    actor_role,
    action,
    timestamp,
    target_entity,
    target_id,
    new_value,
    details,
    created_at
  ) VALUES (
    gen_random_uuid()::text,
    v_caller_id,
    COALESCE(v_caller_name, 'Système'),
    v_caller_role,
    'ASSIGN_TICKETS_TO_AGENT',
    now(),
    'Agent',
    p_agent_id::text,
    jsonb_build_object(
      'agent_id', p_agent_id,
      'agent_name', v_agent_name,
      'tickets_count', v_updated_count,
      'ticket_ids', v_eligible_ids
    ),
    v_updated_count || ' ticket(s) attribué(s) à ' || v_agent_name,
    now()
  );

  RETURN v_updated_count;
END;
$$;

-- Mise à jour de assign_tickets_to_agent_secure(p_agent_id uuid, p_ticket_ids uuid[])
-- pour appliquer exactement la même garde atomique (signature existante de p0_snapshot)
CREATE OR REPLACE FUNCTION public.assign_tickets_to_agent_secure(
  p_agent_id uuid,
  p_ticket_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  v_count := public.assign_tickets(p_ticket_ids, p_agent_id);
  RETURN jsonb_build_object('success', true, 'assigned_count', v_count);
END;
$$;

-- -----------------------------------------------------------------------------
-- P1.6 — Durcissement des fonctions sensibles & privilèges (signatures exactes de p0_snapshot)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_server_hmac_secret() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sign_ticket_canonical(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resign_all_existing_tickets() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_remittance(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_tickets(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_tickets_to_agent_secure(uuid, uuid[]) TO authenticated;

-- Harmonisation en base de la validité à 14 jours et du nom d'organisation U.J.P.A.S. dans app_settings (key/value)
INSERT INTO public.app_settings (key, value, description, updated_at)
VALUES
  ('validity_days', '14'::jsonb, 'Durée de validité stricte d''un ticket en jours', now()),
  ('organization_name', '"Union des Jeunes du Port pour l’Assistance et la Sécurité (U.J.P.A.S.)"'::jsonb, 'Nom officiel de l''organisation', now())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();

COMMIT;
