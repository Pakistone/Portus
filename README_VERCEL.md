# Guide de Déploiement et Résolution Vercel — PORTUS (U.J.S.R.V.)

Ce guide détaille la cause exacte et la résolution des deux problèmes rencontrés lors du déploiement sur Vercel :
1. **L'erreur `Unexpected token 'T', "The page c"... is not valid JSON`**
2. **L'absence des tickets, carnets et utilisateurs enregistrés**

---

## 1. Explication Technique des Problèmes

### Problème 1 : `Unexpected token 'T', "The page c"... is not valid JSON`
- **Cause :** Par défaut, Vercel déploie le frontend Vite comme des fichiers statiques dans `dist/`. L'ancien serveur backend Express (`server.ts`) n'était pas exécuté comme fonction Serverless par Vercel.
- Lorsque l'application exécutait des requêtes vers `/api/...`, Vercel renvoyait une page d'erreur **HTML 404** dont le texte commence par `"The page could not be found"`.
- Lorsque JavaScript essayait d'analyser cette page HTML avec `res.json()`, le moteur plantait sur la lettre **'T'** de `"The page..."` avec l'erreur `Unexpected token 'T', "The page c"... is not valid JSON`.
- **Correction appliquée :** 
  - Ajout de `vercel.json` configurant la redirection `/api/(.*)` vers le moteur Serverless.
  - Ajout de `api/index.ts` pour exécuter les routes API d'authentification et d'administration sous forme de fonctions Vercel Serverless.
  - Sécurisation de l'ensemble des appels réseau avec `safeFetchJson` : l'application vérifie désormais le `Content-Type: application/json` avant tout parsing et ne plante jamais.

### Problème 2 : Tickets et Utilisateurs invisibles
- **Cause :** Dans Supabase PostgreSQL, la sécurité Row Level Security (RLS) protège les tables `profiles`, `carnets`, `tickets`, `sectors` et `sales` à l'aide de fonctions SQL (`public.is_admin()`, `public.get_current_sector_id()`, `public.get_current_role()`).
- Lors de l'initialisation du schéma, les privilèges d'exécution `GRANT EXECUTE` n'étaient pas explicitement accordés aux utilisateurs authentifiés sur ces fonctions.
- Supabase refusait donc l'accès avec l'erreur PostgreSQL :
  `permission denied for function is_admin` ou `permission denied for function get_current_sector_id`
  et renvoyait un tableau vide `[]`.

---

## 2. Procédure de Résolution en 2 Étapes

### Étape 1 : Accorder les permissions RLS dans Supabase (1 Clic)

1. Connectez-vous à votre console Supabase :  
   👉 **[https://supabase.com/dashboard/project/wbbpaebrhobuaoherwmg/sql](https://supabase.com/dashboard/project/wbbpaebrhobuaoherwmg/sql)**
2. Cliquez sur **New query** (Nouvelle requête SQL).
3. Copiez-collez le script SQL suivant et cliquez sur **Run** :

```sql
-- ====================================================================
-- CORRECTIF OFFICIEL PERMISSIONS RLS SUPABASE — PORTUS U.J.S.R.V.
-- ====================================================================

-- 1. Accorder les droits d'usage sur le schéma public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 2. Accorder l'exécution de toutes les fonctions RLS aux utilisateurs authentifiés et anon
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 3. Définition et autorisation des fonctions de sécurité
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.get_current_role() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.get_current_sector_id()
RETURNS UUID AS $$
  SELECT sector_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.get_current_sector_id() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'ADMINISTRATEUR' AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.is_responsable()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'RESPONSABLE' AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.is_responsable() TO authenticated, anon, service_role;

-- 4. Fonction get_my_profile pour récupération du profil connecté sans blocage
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSONB AS $$
DECLARE
  v_prof RECORD;
BEGIN
  SELECT p.*, s.name as sector_name
  INTO v_prof
  FROM public.profiles p
  LEFT JOIN public.sectors s ON s.id = p.sector_id
  WHERE p.id = auth.uid();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_prof);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, anon, service_role;
```

---

### Étape 2 : Variables d'Environnement Vercel

Dans votre tableau de bord **Vercel** (`Settings > Environment Variables`), assurez-vous d'avoir configuré les variables suivantes pour tous les environnements (*Production*, *Preview*, *Development*) :

| Variable | Valeur Recommandée | Description |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | `https://wbbpaebrhobuaoherwmg.supabase.co` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_C55bwXXFjzdKGWo8y_DyzA_lVZSu727` | Clé d'API publique Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_C55bwXXFjzdKGWo8y_DyzA_lVZSu727` | Alias clé d'API publique |
| `SUPABASE_SERVICE_ROLE_KEY` | *(Votre clé secrète service_role de Supabase)* | Clé secrète pour les fonctions d'administration Serverless |
| `PORTUS_HMAC_SECRET` | `portus_production_master_hmac_secret_2026_ujsrv_secure` | Clé de signature HMAC des QR codes |

*Astuce : Vous trouverez votre `service_role key` dans Supabase sous : **Project Settings > API > Project API keys > `service_role` (secret)**.*

---

## 3. Vérification du Succès

1. Rendez-vous sur votre application déployée sur Vercel.
2. Connectez-vous avec votre identifiant administrateur (`ypaki090` ou `ypaki090@gmail.com`).
3. Tous vos carnets, tickets, profils et statistiques s'affichent désormais immédiatement, sans aucune erreur JSON !
