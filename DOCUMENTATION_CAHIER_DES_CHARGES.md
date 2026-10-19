# CAHIER DES CHARGES FONCTIONNEL ET TECHNIQUE (CDCF)
## PORTUS — UJPAS (Union des Jeunes du Port pour l'Assistance et la Sécurité)
### Système de Perception, Traçabilité, Contrôle Routier et Réconciliation Financière (Corridor de Vridi, Abidjan)

---

## 1. PRÉSENTATION GÉNÉRALE ET OBJECTIFS DU PROJET

### 1.1 Contexte et Enjeux
L’application **PORTUS** a été conçue pour répondre aux exigences opérationnelles de terrain sur le corridor portuaire de Vridi à Abidjan. Elle gère la perception de la taxe de stationnement des poids lourds (camions citernes, conteneurs, plateaux, bennes), l’attribution et la traçabilité des carnets de tickets (valeur unitaire : **5 000 FCFA**, validité réglementaire : **7 jours**), la vente hors-ligne par les agents percepteurs, le contrôle routier par QR Code sécurisé (HMAC-SHA256) et la réconciliation financière des remises.

### 1.2 Objectifs Stratégiques
- **Mode Offline-First absolu** : Continuité totale des opérations sur le terrain même en cas de coupure réseau (synchronisation idempotente au retour de la connexion).
- **Sécurité et Anti-Fraude** : Immuabilité des journaux d'audit (append-only), protection par Row Level Security (RLS) sur PostgreSQL/Supabase, signature cryptographique des vignettes et détection des réutilisations frauduleuses ou tickets expirés.
- **Traçabilité Hiérarchique** : Cloisonnement strict des rôles et des secteurs géographiques (Vridi Port, Canal, Zone Industrielle, Terminal Sud).

---

## 2. ARCHITECTURE TECHNIQUE & STACK LOGICIEL

- **Frontend** : React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, IndexedDB (`idb`) pour le stockage persistant local hors-ligne.
- **Backend & API** : Node.js, Express (`server.ts`) et déploiement Serverless Vercel (`api/index.ts`).
- **Base de Données** : Supabase (PostgreSQL 15+, Supabase Auth, RLS, fonctions PL/pgSQL).
- **Sécurité & Cryptographie** : Signatures HMAC-SHA256, jetons de sécurité uniques (`SEC-*`), transactions atomiques et idempotence par mutations uniques (`client_mutation_id` / `sync_idempotency_key`).

---

## 3. RÔLES ET HIÉRARCHIE DES UTILISATEURS

L'application repose sur **4 rôles officiels** dotés de privilèges stricts :

1. **ADMINISTRATEUR (ADMINISTRATEUR)**
   - Gestion globale du système, paramétrage des tarifs (5 000 FCFA) et durées de validité (7 jours).
   - Génération des carnets de tickets et attribution aux responsables de secteur.
   - Accès complet aux journaux d'audit, gestion des comptes utilisateurs, corrections exceptionnelles de remises et réinitialisation opérationnelle sécurisée.

2. **RESPONSABLE DE SECTEUR (RESPONSABLE)**
   - Supervision d'un secteur géographique (Vridi Port, Canal, ZI, Terminal).
   - Réception des carnets et distribution/affectation aux agents percepteurs de son équipe.
   - Enregistrement des remises financières quotidiennes et suivi des alertes de versement.
   - Réattribution automatique des tickets non vendus en cas de désactivation d'un agent.

3. **AGENT PERCEPTEUR TERRAIN (AGENT)**
   - Vente exclusive des tickets qui lui sont attribués sur le terrain.
   - Saisie obligatoire de l'immatriculation du poids lourd normalisée (sans espace ni tiret) et du numéro de téléphone du chauffeur.
   - Fonctionnement hors-ligne transparent avec stockage local IndexedDB et synchronisation en arrière-plan.

4. **CONTRÔLEUR ROUTIER (CONTROLEUR)**
   - Contrôle de conformité sur le corridor portuaire via la caméra QR Code ou la saisie de la plaque.
   - Vérification de la signature HMAC, du statut du ticket et de la règle d'expiration des 7 jours.
   - Signalement immédiat des fraudes (faux ticket, immatriculation non conforme, réutilisation, camion différent).

---

## 4. SPÉCIFICATIONS FONCTIONNELLES DÉTAILLÉES

### 4.1 Gestion des Carnets & Tickets
- **Carnets** : Génération par lots (`generation_batch`) avec des tailles multiples de 3 obligatoires. Numérotation séquentielle et traçabilité des transferts (Admin ➔ Responsable ➔ Agent).
- **Tickets** : Chaque ticket possède un identifiant UUID interne distinct de son numéro physique (ex: `VRD-000101`).
- **Règle des 7 Jours** : Tout ticket dont la date de vente (`sold_at`) dépasse 7 jours est automatiquement rejeté lors des contrôles routiers avec le code de statut `VALIDITY_EXPIRED`.

### 4.2 Ventes Terrain & Mode Hors-Ligne
- Enregistrement instantané en local (IndexedDB) pour garantir zéro latence sur le terrain.
- Idempotence garantie par clé de synchronisation unique (`sync_idempotency_key`), empêchant tout double encaissement en cas de synchronisations multiples.

### 4.3 Contrôle Routier & Anti-Fraude
- Scan de QR Code signé ou recherche par immatriculation.
- Retours de contrôle normés : `VALID` (Conforme), `VALIDITY_EXPIRED` (Période > 7 jours dépassée), `CANCELLED` (Annulé administrativement), `NOT_SOLD` (Ticket non perçu), `FORGED_SIGNATURE` ou `DUPLICATE` (Fraude).
- Signalement de fraude avec motif catégorisé (`FAUX_TICKET`, `IMMATRICULATION_NON_CONFORME`, `TICKET_EXPIRE`, `REUTILISATION_FRAUDULEUSE`, etc.).

### 4.4 Réconciliation Financière & Remises
- Enregistrement des versements des agents aux responsables de secteur.
- Immuabilité des remises (interdiction de suppression physique par trigger PostgreSQL).
- Traçabilité complète de toute correction administrative via la table `remittance_adjustments`.

---

## 5. SÉCURITÉ ET CONFORMITÉ TECHNIQUE

- **Row Level Security (RLS)** : Activée sur l'ensemble des tables de la base de données PostgreSQL, garantissant que chaque profil ne peut accéder qu'aux données de son périmètre ou de son secteur.
- **Protection de la clé HMAC** : La clé secrète de signature dans `app_settings` est strictement protégée contre toute lecture anonyme ou non autorisée.
- **Journal d'Audit Append-Only** : La table `audit_logs` est protégée par un trigger d'intégrité interdisant toute modification ou suppression, garantissant une piste d'audit inaltérable.
- **Sécurité anti brute-force** : Verrouillage automatique des comptes pendant 15 minutes après 5 échecs de connexion consécutifs.

---

## 6. PWA & EXPÉRIENCE UTILISATEUR MOBILE

- **Progressive Web App (PWA)** : Manifeste web, Service Worker robuste (`portus-v1.4.0`) avec stratégie Network-First pour les navigations et Stale-While-Revalidate pour les assets statiques.
- **Code Splitting (`React.lazy`)** : Chargement optimisé par chunks séparés pour chaque tableau de bord et modale lourde, garantissant un démarrage instantané sur smartphone, même en connexion 3G dégradée.
- **Accessibilité** : Vue responsive adaptée au terrain, prise en charge du zoom d'accessibilité mobile et indicateur de connectivité en temps réel.
