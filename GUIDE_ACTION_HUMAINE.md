# PORTUS UJPAS — Guide Détaillé des Actions Humaines

Ce guide pas-à-pas est destiné à **l'administrateur système** et au **responsable technique** de l'UJPAS. Il décrit avec précision l'ensemble des actions à réaliser dans vos consoles de gestion (**Supabase** et **Vercel / Serveur**) suite à l'audit de sécurité du 12 octobre 2026.

---

## Sommaire des Actions

1. [Étape 1 : Générer et configurer la nouvelle clé secrète HMAC](#étape-1--générer-et-configurer-la-nouvelle-clé-secrète-hmac)
2. [Étape 2 : Appliquer la Migration SQL et synchroniser la clé dans Supabase](#étape-2--appliquer-la-migration-sql-et-synchroniser-la-clé-dans-supabase)
3. [Étape 3 : Re-signer l'ensemble des tickets existants](#étape-3--re-signer-lensemble-des-tickets-existants)
4. [Étape 4 : Vérifier les comptes et la désactivation des utilisateurs](#étape-4--vérifier-les-comptes-et-la-désactivation-des-utilisateurs)
5. [Étape 5 : Déployer et relancer l'application](#étape-5--déployer-et-relancer-lapplication)
6. [Étape 6 : Tests de recette immédiats sur le corridor](#étape-6--tests-de-recette-immédiats-sur-le-corridor)
7. [Foire Aux Questions & Dépannage](#foire-aux-questions--dépannage)

---

## Étape 1 : Générer et configurer la nouvelle clé secrète HMAC

### Pourquoi cette action est obligatoire ?
L'ancienne clé par défaut était publiée dans les fichiers d'exemple du dépôt. Pour garantir qu'aucun faussaire ne puisse reproduire de faux QR codes scannables, vous devez définir votre propre clé secrète privée de 64 caractères hexadécimaux.

### 1.1. Génération de votre clé secrète
Ouvrez un terminal (Linux, macOS ou WSL) et tapez :
```bash
openssl rand -hex 32
```
*Si vous êtes sous Windows sans OpenSSL*, lancez cette commande PowerShell :
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Vous obtiendrez une chaîne de 64 caractères aléatoires (exemple fictif : `e7b8a31945d8f63901b...`). **Copiez cette valeur dans un endroit sécurisé.**

### 1.2. Configuration dans Vercel (Hébergement Cloud)
1. Rendez-vous sur votre tableau de bord Vercel :  
   👉 **[https://vercel.com/dashboard](https://vercel.com/dashboard)**
2. Cliquez sur votre projet **`portus-ujsrv-app`** (ou équivalent).
3. Allez dans l'onglet **Settings** > **Environment Variables**.
4. Ajoutez la variable suivante :
   - **Key :** `PORTUS_HMAC_SECRET`
   - **Value :** *(Collez votre clé de 64 caractères générée à l'étape 1.1)*
   - **Environments :** Cochez **Production**, **Preview**, et **Development**.
5. Cliquez sur **Save**.

### 1.3. Configuration en local / VPS (si applicable)
Dans votre fichier `.env` sur votre serveur :
```env
PORTUS_HMAC_SECRET=votre_cle_de_64_caracteres_ici
PORTUS_BOOTSTRAP_ADMIN_EMAILS=ypaki090@gmail.com,admin@portus-ujpas.online
ALLOW_DATABASE_RESET=false
```

---

## Étape 2 : Appliquer la Migration SQL et synchroniser la clé dans Supabase

### 2.1. Ouvrir l'éditeur SQL Supabase
1. Connectez-vous à la console Supabase de votre projet :  
   👉 **[https://supabase.com/dashboard/project/wbbpaebrhobuaoherwmg/sql](https://supabase.com/dashboard/project/wbbpaebrhobuaoherwmg/sql)**
2. Cliquez sur **+ New query** (Nouvelle requête SQL).

### 2.2. Enregistrer la clé HMAC dans Supabase
Collez ce script SQL dans l'éditeur en remplaçant `'VOTRE_CLE_DE_64_CARACTERES_GENEREE'` par la clé exacte créée à l'étape 1 :

```sql
-- 1. Synchronisation de la clé secrète autoritaire dans PostgreSQL
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'server_hmac_signing_key',
  jsonb_build_object(
    'secret', 'VOTRE_CLE_DE_64_CARACTERES_GENEREE',
    'algorithm', 'HMAC-SHA256',
    'updated_at', NOW()
  ),
  'Clé secrète autoritaire serveur HMAC-SHA256 pour signature inviolable des QR codes UJPAS'
)
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = NOW();
```
Cliquez sur **Run** (ou `Ctrl+Enter`). Vous devez voir `Success. No rows returned`.

### 2.3. Exécuter la Migration 06 (Sécurité renforcée)
Ouvrez un nouvel onglet de requête SQL dans Supabase, copiez l'intégralité du script suivant et cliquez sur **Run** :

```sql
-- ====================================================================
-- MIGRATION 06 : SÉCURITÉ CRYPTOGRAPHIQUE SANS BYPASS & RESET OPÉRATIONNEL
-- ====================================================================

-- 1. Mise à jour de la RPC de vérification autoritaire
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

  -- 1. Recherche par numéro visible ou UUID
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

  -- 2. Extraction du token stocké
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

  -- Recalcul autoritaire de la signature attendue
  v_canonical := 'PORTUS|v1|' || v_ticket.id::TEXT || '|' || COALESCE(v_ticket.carnet_number, 'VRD') || '|' || v_ticket.ticket_number || '|' || COALESCE(v_ticket.price, 5000)::TEXT;
  v_expected_sig := public.sign_ticket_canonical(v_canonical);

  -- CONTRÔLE CRITIQUE : Seul le recalcul autoritaire fait foi
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
    v_sig_valid := (v_stored_sig IS NOT NULL AND v_stored_sig = v_expected_sig);
  END IF;

  -- 3. Historique des contrôles préalables
  SELECT COUNT(*), MAX(controlled_at)
  INTO v_controls_count, v_last_control
  FROM public.controls
  WHERE ticket_id = v_ticket.id;

  -- 4. Concordance de plaque
  IF p_plate_number IS NOT NULL AND TRIM(p_plate_number) != '' AND v_ticket.plate_number IS NOT NULL THEN
    v_clean_scanned_plate := UPPER(REGEXP_REPLACE(p_plate_number, '[^A-Z0-9]', '', 'g'));
    v_clean_ticket_plate := UPPER(REGEXP_REPLACE(v_ticket.plate_number, '[^A-Z0-9]', '', 'g'));

    IF v_clean_scanned_plate != '' AND v_clean_ticket_plate != '' AND v_clean_scanned_plate != v_clean_ticket_plate THEN
      v_plate_match := FALSE;
      v_status_code := 'PLATE_MISMATCH';
      v_message := 'ALERTE IMMATRICULATION : Ticket émis pour le camion ' || v_ticket.plate_number || ' mais présenté sur ' || UPPER(TRIM(p_plate_number)) || ' (Fraude suspectée).';
    END IF;
  END IF;

  -- 5. Statut métier
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

-- 2. Fonction de re-signature de tous les tickets
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

-- 3. Procédure transactionnelle de Reset qui préserve audit_logs
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
  -- LA TABLE audit_logs N'EST JAMAIS PURGÉE

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
    'Purge opérationnelle effectuée par l’administrateur. Table audit_logs préservée.',
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Base de données opérationnelle réinitialisée avec succès. Piste d’audit conservée.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

GRANT EXECUTE ON FUNCTION public.verify_ticket_secure(TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resign_all_existing_tickets() TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_operational_database(UUID, TEXT, TEXT) TO service_role;
```

---

## Étape 3 : Re-signer l'ensemble des tickets existants

Pour que les tickets déjà créés ou imprimés soient immédiatement reconnus par le nouveau protocole sécurisé, exécutez simplement cette commande dans l'éditeur SQL de Supabase :

```sql
SELECT public.resign_all_existing_tickets();
```

Le résultat affichera le nombre total de tickets mis à jour (par exemple `45` ou `150`).  
Tous les tickets possèdent désormais leur signature HMAC recalculée avec votre nouvelle clé autoritaire.

---

## Étape 4 : Vérifier les comptes et la désactivation des utilisateurs

### 4.1. Vérifier l'administrateur officiel
Toujours dans l'éditeur SQL de Supabase, vérifiez que le compte officiel `ypaki090@gmail.com` est actif et administrateur :

```sql
SELECT id, email, username, full_name, role, is_active 
FROM public.profiles 
WHERE email = 'ypaki090@gmail.com' OR username = 'ypaki090';
```
- Si le profil n'existe pas encore ou que `role` n'est pas `ADMINISTRATEUR`, exécutez :
```sql
UPDATE public.profiles 
SET role = 'ADMINISTRATEUR', is_active = TRUE 
WHERE email = 'ypaki090@gmail.com';
```

### 4.2. Contrôler les utilisateurs créés
Vérifiez qu'aucun compte non autorisé n'a été créé avec des métadonnées `admin` :
```sql
SELECT id, email, raw_user_meta_data 
FROM auth.users 
WHERE raw_user_meta_data->>'username' = 'admin';
```
*(Seul votre propre compte d'administration doit apparaître).*

---

## Étape 5 : Déployer et relancer l'application

### 5.1. Si vous utilisez Vercel
1. Allez dans l'onglet **Deployments** de votre projet Vercel.
2. Cliquez sur les **trois petits points (···)** à droite du dernier déploiement, puis cliquez sur **Redeploy**.
3. *Cochez* l'option **Include build cache** ou décochez pour forcer un build neuf.
4. Cliquez sur **Redeploy**. Le build se termine en environ 1 minute.

### 5.2. Si vous utilisez un conteneur / VPS
Exécutez dans le dossier racine :
```bash
npm run build
npm run start:prod
```

---

## Étape 6 : Tests de recette immédiats sur le corridor

Faites ces 4 tests rapides pour vous assurer que tout est opérationnel :

| # | Test à effectuer | Résultat attendu |
|---|---|---|
| **1** | **Connexion Administrateur** : Connectez-vous avec `ypaki090` sur l'application. | Accès immédiat au tableau de bord sans message d'erreur. |
| **2** | **Test Sécurité API** : Ouvrez un onglet de navigation privée et allez sur `https://votre-domaine.com/api/users`. | Message JSON d'erreur `HTTP 401 UNAUTHORIZED` (vos données utilisateurs sont bien protégées). |
| **3** | **Scan de Ticket QR** : Depuis le tableau de bord Contrôleur, scannez le QR code d'un ticket vendu. | Le bandeau vert s'affiche : **« TICKET VALIDE »** avec la mention de signature authentique. |
| **4** | **Test Anti-Fraude** : Scannez un QR code dont le texte ou la signature a été altéré. | Alerte rouge immédiate : **« 🚨 FALSIFICATION DÉTECTÉE — SIGNATURE NON CONFORME »**. |

---

## Foire Aux Questions & Dépannage

### Que faire si un contrôleur signale une alerte « Faux ticket détecté » sur un ancien ticket ?
Exécutez à nouveau dans Supabase :
```sql
SELECT public.resign_all_existing_tickets();
```
Cela recalcule instantanément la signature du ticket dans la base.

### Pourquoi le serveur affiche-t-il une erreur au démarrage ?
Si le serveur affiche :
> `[PORTUS Server Security] Démarrage REFUSÉ en production : La variable PORTUS_HMAC_SECRET est obligatoire...`

Cela signifie que `PORTUS_HMAC_SECRET` n'a pas été renseigné dans les variables d'environnement de Vercel ou du VPS, ou qu'il contient encore l'ancienne valeur compromise. Renseignez votre nouvelle clé générée à l'Étape 1.

### Les logos ont-ils été modifiés ?
**Non.** Le logo officiel `public/logo-ujpas.png`, `public/logoss.jpg` et le cachet officiel `public/cachet-ujpas.png` sont restés 100% intacts, protégés et non altérés.
