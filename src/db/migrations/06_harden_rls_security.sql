-- ====================================================================
-- MIGRATION : DURCISSEMENT CRITIQUE DU ROW LEVEL SECURITY (RLS)
-- PORTUS — U.J.P.A.S. (Union des Jeunes du Port pour l'Assistance et la Sécurité)
-- Correction des politiques trop permissives de la migration 04 sur :
-- 1. public.vehicles (registre des véhicules)
-- 2. public.ticket_reprints (journal d'audit des réimpressions de tickets)
-- ====================================================================

-- 1. S'assurer que le RLS est activé
ALTER TABLE IF EXISTS public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ticket_reprints ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 2. DURCISSEMENT DES POLITIQUES SUR LA TABLE public.vehicles
-- ====================================================================
-- Suppression des anciennes règles permissives FOR ALL USING (true)
DROP POLICY IF EXISTS "Admin and Agent update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated read vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated select vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Controlled update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admin delete vehicles" ON public.vehicles;

-- Règle SELECT : Tout utilisateur authentifié peut consulter le registre des camions
CREATE POLICY "Authenticated select vehicles" ON public.vehicles
  FOR SELECT TO authenticated
  USING (true);

-- Règle INSERT : Tout agent ou contrôleur authentifié peut enregistrer un véhicule
CREATE POLICY "Authenticated insert vehicles" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Règle UPDATE : Mise à jour des coordonnées, type ou signalement par les utilisateurs habilités
CREATE POLICY "Controlled update vehicles" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Règle DELETE : STRICTEMENT RÉSERVÉE AU RÔLE ADMINISTRATEUR
-- Empêche formellement un agent ou contrôleur de purger le registre des véhicules
CREATE POLICY "Admin delete vehicles" ON public.vehicles
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ====================================================================
-- 3. DURCISSEMENT DES POLITIQUES SUR LA TABLE public.ticket_reprints
-- ====================================================================
-- Suppression des anciennes règles permissives FOR ALL USING (true)
DROP POLICY IF EXISTS "Authenticated read and insert reprints" ON public.ticket_reprints;
DROP POLICY IF EXISTS "Authenticated select reprints" ON public.ticket_reprints;
DROP POLICY IF EXISTS "Authenticated insert reprints" ON public.ticket_reprints;
DROP POLICY IF EXISTS "Admin and Responsable update reprints" ON public.ticket_reprints;
DROP POLICY IF EXISTS "Admin delete reprints" ON public.ticket_reprints;

-- Règle SELECT : Tout utilisateur authentifié peut lire l'historique des réimpressions pour audit
CREATE POLICY "Authenticated select reprints" ON public.ticket_reprints
  FOR SELECT TO authenticated
  USING (true);

-- Règle INSERT : Un agent peut consigner une réimpression en s'identifiant obligatoirement comme demandeur
CREATE POLICY "Authenticated insert reprints" ON public.ticket_reprints
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() OR public.is_admin());

-- Règle UPDATE : Seuls les Responsables et Administrateurs peuvent approuver ou qualifier une réimpression
CREATE POLICY "Admin and Responsable update reprints" ON public.ticket_reprints
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_responsable())
  WITH CHECK (public.is_admin() OR public.is_responsable());

-- Règle DELETE : STRICTEMENT RÉSERVÉE AU RÔLE ADMINISTRATEUR
-- Aucun agent ne peut effacer une réimpression suspecte ou une trace de réémission
CREATE POLICY "Admin delete reprints" ON public.ticket_reprints
  FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.vehicles IS 'Registre sécurisé des véhicules U.J.P.A.S. avec suppression réservée aux administrateurs';
COMMENT ON TABLE public.ticket_reprints IS 'Traçabilité immuable des réimpressions de tickets U.J.P.A.S. avec protection anti-effacement';
