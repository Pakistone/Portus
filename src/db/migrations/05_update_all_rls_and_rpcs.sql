-- ====================================================================
-- MIGRATION 05: REVUE GLOBALE DU RLS, PERMISSIONS GRANULAIRES ET SÉCURITÉ
-- PORTUS — U.J.S.R.V.
-- Remplace les politiques trop permissives par des politiques par rôle
-- ====================================================================

-- 1. S'assurer que les tables critiques ont RLS activé
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.carnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Audit logs : strictement append-only
DROP POLICY IF EXISTS "No ordinary user delete audit" ON public.audit_logs;
CREATE POLICY "No ordinary user delete audit" ON public.audit_logs
  FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "No ordinary user update audit" ON public.audit_logs;
CREATE POLICY "No ordinary user update audit" ON public.audit_logs
  FOR UPDATE TO authenticated USING (false);
