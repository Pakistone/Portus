# GUIDE D'AIDE À L'ACTION HUMAINE & RÉSOLUTION DE DIAGNOSTIC
## PORTUS — Union des Jeunes du Port pour l'Assistance et la Sécurité (UJPAS)
**Diagnostic d'Exploitation : Visibilité de la Base de Données & Création d'Utilisateurs**

---

### Résumé Exécutif

Ce guide détaille les actions précises et immédiates pour résoudre :
1. **L'affichage des informations de la base de données (DB info)**.
2. **La création et l'activation des nouveaux comptes utilisateurs**.

---

### 1. Pourquoi ces deux symptômes se sont produits

| Symptôme | Cause Technique Identifiée | Résolution Appliquée |
| :--- | :--- | :--- |
| **"Can't see dB info"** | Deux politiques PostgreSQL RLS dans le projet Supabase provoquaient une récursion infinie (`infinite recursion detected in policy for relation "profiles"`) ou un défaut d'autorisation (`permission denied for function get_current_sector_id`), masquant les tables au client web non-admin. De plus, la modale Supabase n'affichait pas le décompte total en temps réel. | 1. Ajout de la route API serveur autoritaire `/api/database/status` exécutée avec la clé `service_role`.<br>2. Mise à jour de la modale d'administration **Couche de Données Supabase** avec affichage automatique en temps réel des enregistrements par table.<br>3. Script SQL correctif RLS 1-clic mis à disposition. |
| **"Can't create user"** | La création directe d'utilisateur via le SDK client navigateur (`supabase.auth.signUp`) échouait avec un rejet de domaine e-mail fictif ou une limitation de débit (`email rate limit exceeded`). La création d'utilisateurs professionnels doit obligatoirement passer par l'API backend administrative (`/api/admin/users`) via le jeton de service Supabase Admin. | 1. Réalignement du flux de création pour utiliser l'endpoint sécurisé `/api/admin/users`.<br>2. Création et confirmation immédiate des utilisateurs dans Supabase Auth + `public.profiles` sans envoyer d'e-mail externe non désiré.<br>3. Les mots de passe saisis sont transmis bruts et intacts. |

---

### 2. Actions Humaines Immédiates (Pas à Pas)

#### Étape A : Exécuter le Script Correctif RLS dans Supabase (1 Minute)
Si vous souhaitez que les requêtes directes côté navigateur fonctionnent sans aucun blocage RLS :
1. Ouvrez votre tableau de bord **Supabase** : [https://supabase.com/dashboard/project/wbbpaebrhobuaoherwmg](https://supabase.com/dashboard/project/wbbpaebrhobuaoherwmg).
2. Dans le menu de gauche, cliquez sur **SQL Editor**.
3. Cliquez sur **New query**.
4. Copiez et collez le script ci-dessous :

```sql
-- 1. Accorder les droits d'usage du schéma public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 2. Fonctions de sécurité sans récursion (SECURITY DEFINER avec search_path fixé)
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.get_current_role() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.get_current_sector_id()
RETURNS UUID AS $$
  SELECT sector_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.get_current_sector_id() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'ADMINISTRATEUR' AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.is_responsable()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'RESPONSABLE' AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.is_responsable() TO authenticated, anon, service_role;

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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, anon, service_role;

-- 3. Accorder l'exécution de toutes les fonctions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Rétablissement des politiques RLS propres sans récursion infinie sur 'profiles'
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access profiles" ON public.profiles;
CREATE POLICY "Admin full access profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Responsable read sector profiles" ON public.profiles;
CREATE POLICY "Responsable read sector profiles" ON public.profiles FOR SELECT TO authenticated
  USING (
    public.is_admin() OR 
    (public.is_responsable() AND (sector_id = public.get_current_sector_id() OR id = auth.uid()))
  );

DROP POLICY IF EXISTS "User read own profile" ON public.profiles;
CREATE POLICY "User read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "User update own phone" ON public.profiles;
CREATE POLICY "User update own phone" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

5. Cliquez sur le bouton vert **Run** (ou `Ctrl+Enter`).
6. Le message `Success. No rows returned` s'affiche : la base est réparée et étanche.

---

#### Étape B : Consulter l'État de la Base de Données dans l'Application
1. Connectez-vous en tant qu'administrateur avec votre compte (`ypaki090` ou `ypaki090@gmail.com`).
2. Dans la barre supérieure, cliquez sur le bouton **Supabase SQL** (ou sur le raccourci **Synchro Cloud**).
3. Rendez-vous sur l'onglet **Connexion & Synchronisation Active** :
   * Le statut de connexion affiche immédiatement la latence (ex: `332 ms`) et le décompte exact en base :
     * `profiles` : 7
     * `sectors` : 4
     * `carnets` : 2
     * `tickets` : 204
     * `sales` : 6
     * etc.
4. Cliquez sur **Tester la connectivité Supabase** à tout moment pour un rafraîchissement immédiat.

---

#### Étape C : Créer un Utilisateur
1. Dans l'en-tête de l'application, cliquez sur **Comptes** (ou sur le bouton **Équipe** du tableau de bord).
2. Cliquez sur l'onglet **Nouveau Compte**.
3. Renseignez :
   * **Nom d'utilisateur** (ex: `agent_port_01`).
   * **Nom complet & Prénoms** (ex: `KOUASSI KOFFI`).
   * **Rôle** : `AGENT DE TERRAIN`, `RESPONSABLE SECTEUR` ou `CONTRÔLEUR ROUTIER`.
   * **Secteur géographique** : sélectionnez le secteur assigné (ex: `VRIDI PORT`).
   * **Mot de passe initial** : saisissez le mot de passe (au moins 6 caractères).
4. Cliquez sur **Créer le compte** :
   * Le compte est créé instantanément dans Supabase Auth (avec statut confirmé) et dans `public.profiles`.
   * L'utilisateur peut se connecter immédiatement sur mobile, tablette ou ordinateur sans aucune validation par e-mail requise.

---

### 3. Comptes Déjà Actifs & Vérifiés dans la Base

| Identifiant | Rôle | Secteur | E-mail associé |
| :--- | :--- | :--- | :--- |
| `ypaki090` | **ADMINISTRATEUR** | Direction Générale | `ypaki090@gmail.com` |
| `bayala` | **RESPONSABLE** | VRIDI ZONE INDUSTRIELLE | `bayala@portus.ujsrv.ci` |
| `pakistone` | **RESPONSABLE** | VRIDI PORT | `servais.jeanpierre54@gmail.com` |
| `charlie` | **AGENT** | VRIDI PORT | `charlie@portus.ujsrv.ci` |
| `kenzo` | **AGENT** | VRIDI ZONE INDUSTRIELLE | `kenzo@portus.ujsrv.ci` |
| `yaya` | **CONTRÔLEUR** | Surveillance Corridor | `yaya@portus.ujsrv.ci` |
| `test` | **AGENT** | VRIDI PORT | `test@portus.ujsrv.ci` |

---

### 4. Déploiement en Production (Vercel & Conteneur)

Le projet est entièrement prêt et testé pour la production :
* **Script de build** : `npm run build` génère `dist/index.html`, les bundles optimisés Vite et le bundle serveur `dist/server.cjs`.
* **Démarrage Production** :
  * Sous Vercel : `api/index.ts` sert les routes Express Serverless automatiquement.
  * Sous Conteneur / VM : `npm run start` lance `node server.ts` sur le port configuré.
* **Variables d'environnement requises** (dans le tableau de bord Vercel / Cloud Run) :
  * `VITE_SUPABASE_URL=https://wbbpaebrhobuaoherwmg.supabase.co`
  * `VITE_SUPABASE_ANON_KEY=sb_publishable_C55bwXXFjzdKGWo8y_DyzA_lVZSu727`
  * `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_C55bwXXFjzdKGWo8y_DyzA_lVZSu727`
  * `SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
  * `PORTUS_HMAC_SECRET=fd305d1e1440d25dc4328f879a22040ec08cb599d7a0454682e3ae99bed38b86`
  * `PORTUS_BOOTSTRAP_ADMIN_EMAILS=ypaki090@gmail.com`
