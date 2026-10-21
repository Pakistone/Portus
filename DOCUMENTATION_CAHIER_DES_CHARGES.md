# CAHIER DES CHARGES FONCTIONNEL ET TECHNIQUE (CDCF)
## PORTUS — U.J.P.A.S. (Union des Jeunes du Port pour l'Assistance et la Sécurité)
### Système de Perception, Traçabilité, Contrôle Routier et Réconciliation Financière (Zone Portuaire & Industrielle d'Abidjan)

---

## 1. PRÉSENTATION GÉNÉRALE ET OBJECTIFS DU PROJET

### 1.1 Contexte et Enjeux
L’application **PORTUS — U.J.P.A.S.** a été conçue pour répondre aux exigences opérationnelles de terrain sur le corridor portuaire et industriel d'Abidjan. Elle gère la perception de la taxe de stationnement et d'assistance des poids lourds (camions citernes, conteneurs, plateaux, bennes), l’attribution et la traçabilité des carnets de tickets (valeur unitaire : **5 000 FCFA**, validité réglementaire stricte : **14 jours**), la vente hors-ligne par les agents percepteurs mobiles, le contrôle routier avec Trombinoscope anti-usurpation par QR Code sécurisé (HMAC-SHA256) et la réconciliation financière directe.

### 1.2 Objectifs Stratégiques
- **Mode Offline-First absolu** : Continuité totale des opérations sur le terrain même en cas de coupure réseau (synchronisation idempotente au retour de la connexion).
- **Sécurité et Anti-Fraude** : Immuabilité des journaux d'audit (append-only), protection par Row Level Security (RLS) sur PostgreSQL/Supabase, signature cryptographique des vignettes, Trombinoscope photo des agents et détection des réutilisations frauduleuses ou tickets expirés (> 14 jours).
- **Mobilité Opérationnelle & Circuit Financier Direct** : Pool global d'agents mobiles sur toute la zone portuaire et circuit financier sans intermédiaire superflu (`Agent → Superviseur → Administrateur`).

---

## 2. ARCHITECTURE TECHNIQUE & STACK LOGICIEL

- **Frontend** : React 19, TypeScript, Vite, Tailwind CSS v4, Zustand (indexation O(1)), Lucide React, IndexedDB (`idb`) pour le stockage persistant local hors-ligne.
- **Backend & API** : Node.js, Express (`server.ts`) et déploiement Serverless Vercel (`api/index.ts`).
- **Base de Données** : Supabase (PostgreSQL 15+, Supabase Auth, RLS, fonctions PL/pgSQL).
- **Sécurité & Cryptographie** : Signatures HMAC-SHA256, jetons de sécurité uniques (`SEC-*`), transactions atomiques et idempotence par mutations uniques (`client_mutation_id` / `sync_idempotency_key`).

---

## 3. RÔLES ET HIÉRARCHIE DES UTILISATEURS

L'application repose sur **4 rôles opérationnels officiels** dotés de privilèges stricts :

1. **ADMINISTRATEUR GÉNÉRAL (`ADMINISTRATEUR`)**
   - Maître de l'ensemble du système, paramétrage des tarifs (5 000 FCFA) et durée de validité (14 jours).
   - Génération, impression PDF (6 tickets/page A4 Paysage, grille 3×2) et suppression définitive (`CASCADE`) des carnets de tickets.
   - Attribution des carnets aux superviseurs (`RESPONSABLE`).
   - Accès complet aux journaux d'audit, gestion des comptes utilisateurs avec photo d'identité (`avatar_url`), édition des badges professionnels (85 × 120 mm) et réception du point financier des superviseurs.

2. **SUPERVISEUR / RESPONSABLE (`RESPONSABLE`)**
   - Réception des carnets attribués par l'Administrateur et distribution des tickets à tout agent actif du pool global U.J.P.A.S.
   - Encaissement des remises financières auprès des agents (avec calculateur de billetage BCEAO) et reddition directe des comptes à l'Administrateur.
   - Réattribution des tickets non vendus en cas d'indisponibilité d'un agent.

3. **AGENT PERCEPTEUR TERRAIN (`AGENT`)**
   - Membre du pool mobile d'agents déployables sur toute la zone portuaire et industrielle.
   - Vente exclusive des tickets qui lui sont attribués sur le terrain (Espèces, Wave, Orange Money, Moov Money).
   - Saisie obligatoire de l'immatriculation du poids lourd normalisée (8 cases) et délivrance du reçu officiel WhatsApp / imprimé avec date d'expiration à 14 jours.

4. **CONTRÔLEUR ROUTIER (`CONTROLEUR`)**
   - Contrôle de conformité sur le corridor portuaire via la caméra QR Code ou la saisie de la plaque.
   - Vérification de la signature HMAC, de la règle d'expiration stricte des **14 jours** et confrontation visuelle via le **Trombinoscope Photo** de l'agent vendeur.
   - Signalement immédiat des fraudes et alertes SOS en temps réel.
