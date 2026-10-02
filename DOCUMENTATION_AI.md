# SPÉCIFICATION TECHNIQUE ET ARCHITECTURALE DU SYSTÈME PORTUS — U.J.S.R.V.
> **Document à destination d'un Agent IA / Ingénieur Logiciel**  
> **Dernière mise à jour :** 2026-10-02  
> **Identifiant d'application :** `portus-ujsrv-app` (Version 1.0.0 Production)  
> **Contexte géopolitique et métier :** Abidjan, Côte d'Ivoire (Zone Portuaire de Vridi / Canal de Vridi).

---

## 1. VUE D'ENSEMBLE DU DOMAINE MÉTIER (DOMAIN CONTEXT)

### 1.1 Qu'est-ce que PORTUS ?
**PORTUS** est un progiciel de gestion intégrée (ERP/PWA) conçu pour l'**U.J.S.R.V.** (*Union de la Jeunesse Scolaire et Régionale de Vridi*).  
L'application gère de bout en bout l'encaissement, l'émission, la régulation, le contrôle routier inopiné et la réconciliation financière des **tickets de passage des véhicules lourds / camions de marchandises** circulant dans la presqu'île portuaire de Vridi (Abidjan, Côte d'Ivoire).

### 1.2 Paramètres Métier Clés
- **Tarif unique réglementaire :** `5 000 FCFA` par passage/ticket.
- **Validité temporelle d'un ticket :** `7 jours calendaires` à compter de l'horodatage original de vente.
- **Règle anti-doublon camion :** Une immatriculation ne peut avoir qu'un seul ticket actif simultanément. Si un camion repasse dans les 7 jours, une alerte est levée et la validation d'un nouveau ticket rend caduc l'ancien (`isSuperseded = true`).
- **Supports physiques :** Carnets imprimés au format A4 Paysage (9 tickets prédécoupés par page avec souches détachables et QR Codes 2D scannables).

---

## 2. STACK TECHNIQUE & PIPELINE D'EXÉCUTION

| Couche | Technologies & Dépendances | Rôle & Justification |
| :--- | :--- | :--- |
| **Langage & Typage** | TypeScript (ES2022, Strict Mode) | Sécurité de typage complète de bout en bout. |
| **Frontend Framework** | React 19 + Vite 8.3 | SPA réactive, rendu ultra-rapide optimisé pour smartphones de terrain. |
| **Styles & UI** | Tailwind CSS v4 | Design system épuré, accessible, sans fioritures (Dark/Industrial theme). |
| **Stockage Local** | IndexedDB via `idb` (v8) | Architecture **Local-First** : Fonctionnement 100% hors-ligne garanti. |
| **Serveur & Proxy** | Node.js (v20+) + Express + TSX | Serveur Full-Stack servant la SPA Vite et les routes API REST (`/api/*`). |
| **Base Cloud** | Supabase (PostgreSQL 15+) | Base de données relationnelle persistante avec RLS et fonctions RPC atomiques. |
| **Scannage QR** | `html5-qrcode` | Scannage optique matériel via les caméras arrières des smartphones Android/iOS. |
| **Génération Documents**| `jspdf` + `html2canvas` + `xlsx` | Génération client des carnets de tickets A4, reçus financiers et exports Excel. |
| **Géolocalisation** | W3C Geolocation API | Capture des coordonnées GPS (lat, lng, précision) lors des ventes et contrôles. |

---

## 3. ARCHITECTURE SYSTÈME & MODÈLE LOCAL-FIRST

```
                           ┌───────────────────────────────────────────────┐
                           │               SUPABASE CLOUD                  │
                           │  - PostgreSQL 15 (Tables relationnelles)     │
                           │  - RPC Atomiques (sell_ticket_secure, etc.)   │
                           │  - Row Level Security (RLS)                   │
                           │  - Realtime Changefeed                        │
                           └───────────────────────┬───────────────────────┘
                                                   │
                                HTTPS REST / JSON API (WebSocket Realtime)
                                                   │
                           ┌───────────────────────▼───────────────────────┐
                           │          EXPRESS BACKEND (server.ts)          │
                           │  - Port 3000                                  │
                           │  - Middleware de cache & fallbacks            │
                           │  - Proxy sécurisé /api/carnets, /api/health   │
                           └───────────────────────┬───────────────────────┘
                                                   │
                                      Client Bundle SPA (Vite)
                                                   │
 ┌─────────────────────────────────────────────────▼─────────────────────────────────────────────────┐
 │                                   APPLICATION WEB PORTUS (PWA)                                    │
 │                                                                                                   │
 │  ┌───────────────────────────────┐               ┌─────────────────────────────────────────────┐  │
 │  │        AuthContext.tsx        │               │               DataContext.tsx               │  │
 │  │  - Session locale persistée   │               │  - Orchestrateur central de données         │  │
 │  │  - Rôles RBAC stricts         │               │  - Cache IndexedDB en lecture/écriture       │  │
 │  │  - Hashage / validation PIN   │               │  - Détection connectivité (Online / Offline)│  │
 │  └──────────────┬────────────────┘               │  - File d'attente d'idempotence (SyncQueue) │  │
 │                 │                                └──────────────────────┬──────────────────────┘  │
 │                 │                                                       │                         │
 │  ┌──────────────▼───────────────────────────────────────────────────────▼──────────────────────┐  │
 │  │                                    INDEXEDDB LOCAL ('portus-db')                             │  │
 │  │ Stores : 'carnets' | 'tickets' | 'sales' | 'remises' | 'controls' | 'frauds' | 'users'...    │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
 └───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. CONTRÔLE D'ACCÈS BASÉ SUR LES RÔLES (RBAC)

Le système comporte **4 rôles exclusifs** définis dans l'énumération TypeScript `UserRole` :

### 4.1 `ADMINISTRATEUR` (Supervision Générale & Direction)
- **Prérogatives :**
  - Génération de nouveaux carnets de tickets (choix préfixe, numérotation, taille).
  - Attribution des carnets aux responsables de secteur.
  - **Enregistrement de ventes directes** de tickets (accès à tous les carnets actifs).
  - **Enregistrement des remises de fonds** versées par les agents ou les responsables.
  - Gestion des comptes utilisateurs (création, désactivation, réinitialisation PIN).
  - Traitement et clôture des rapports d'infractions / fraudes.
  - Paramétrage de la tarification et configuration du cachet officiel.
  - Export consolidé (Excel / PDF) de l'ensemble de la base de données.

### 4.2 `RESPONSABLE` (Chef de Secteur, ex: Vridi Port, Vridi Canal)
- **Prérogatives :**
  - Réception des carnets attribués par l'administration.
  - Sous-attribution des tickets aux agents de terrain de son secteur.
  - Enregistrement des remises financières collectées auprès de ses agents.
  - Suivi des alertes de remises (seuil d'impayé dès 10 tickets non versés).
  - Analyse financière et bilans d'écarts de sa zone.

### 4.3 `AGENT` (Agent de Guichet / Encaissier de Terrain)
- **Prérogatives :**
  - Vente de tickets physiques aux chauffeurs de camions.
  - Saisie de la plaque d'immatriculation avec normalisation et vérification des doublons.
  - Capture GPS automatique et envoi de reçu chauffeur par WhatsApp.
  - Consultation de son solde financier personnel (tickets vendus vs montants remis).

### 4.4 `CONTROLEUR` (Brigade Mobile de Contrôle Routier)
- **Prérogatives :**
  - Contrôle inopiné des camions sur les axes routiers.
  - Scannage caméra direct des QR Codes sécurisés imprimés sur les tickets.
  - Recherche par plaque d'immatriculation ou numéro physique de ticket.
  - Constat de validité en temps réel (Valide, Expiré > 7j, Faux ticket, Véhicule non concordant, Déjà contrôlé).
  - Enregistrement d'un rapport de fraude immédiat avec preuve photo et coordonnées GPS.

---

## 5. MODÈLE DE DONNÉES & SCHÉMAS DÉTAILLÉS

### 5.1 Entité `Carnet` (Lot de tickets)
```typescript
interface Carnet {
  id: string;                      // UUID unique
  carnetNumber: string;            // Ex: "C-2026-003"
  seriesPrefix: string;            // Ex: "VRDBAY" ou "VRDCH"
  generationBatch: string;         // Ex: "GEN-1"
  size: number;                    // Quantité de tickets (ex: 102)
  startNumber: number;             // Premier numéro séquentiel (ex: 1)
  endNumber: number;               // Dernier numéro séquentiel (ex: 102)
  createdBy: string;               // UUID Admin créateur
  assignedToResponsable?: string;  // UUID Responsable affectataire
  assignedToResponsableName?: string;
  sectorId?: string;               // UUID Secteur
  sectorName?: string;
  status: 'GENERATED' | 'ASSIGNED_TO_RESPONSIBLE' | 'PARTIALLY_SOLD' | 'SOLD_OUT' | 'ARCHIVED';
  createdAt: string;               // ISO 8601 UTC
  updatedAt?: string;
}
```

### 5.2 Entité `Ticket`
```typescript
interface Ticket {
  id: string;                      // UUID unique
  ticketNumber: string;            // Format: "PREFIX-000000" (ex: "VRDBAY-000042")
  carnetId: string;                // UUID Carnet parent
  carnetNumber: string;            // Dénormalisé pour affichage rapide
  generationBatch?: string;
  qrPayload: string;               // Payload JSON v1 sérialisé (voir section 6)
  status: TicketStatus;            // 'GENERATED' | 'ASSIGNED_TO_RESPONSIBLE' | 'ASSIGNED_TO_AGENT' | 'SOLD' | 'CONTROLLED' | 'CANCELLED'
  price: number;                   // 5000 FCFA
  assignedResponsableId?: string;
  assignedResponsableName?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  sectorId?: string;
  sectorName?: string;
  saleId?: string;                 // UUID de la vente si vendu
  soldAt?: string;                 // Date/heure immuable de vente (ISO 8601)
  plateNumber?: string;            // Immatriculation normalisée (ex: "2548KL01")
  driverPhone?: string;            // Téléphone international (ex: "+2250700000000")
  coveredByRemiseId?: string;      // ID de la remise qui a couvert ce ticket
  controlCount: number;            // Nombre de contrôles routiers subis
  lastControlledAt?: string;
  isSuperseded?: boolean;          // Vrai si remplacé par un nouveau ticket < 7j
  supersededByTicketNumber?: string;
  createdAt: string;
}
```

### 5.3 Entité `Sale` (Vente / Encaissement)
```typescript
interface Sale {
  id: string;                      // UUID d'idempotence
  ticketId: string;                // UUID Ticket
  ticketNumber: string;
  agentId: string;                 // UUID Agent ou Admin vendeur
  agentName: string;
  sectorId?: string;
  sectorName?: string;
  plateNumber: string;             // Normalisée (A-Z, 0-9)
  driverPhone?: string;
  soldAt: string;                  // ISO 8601 (jamais écrasée)
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAccuracy?: number;
  gpsStatus?: 'AVAILABLE' | 'GPS_UNAVAILABLE' | 'PERMISSION_DENIED';
  syncStatus: 'SYNCED' | 'PENDING_SYNC';
  syncedAt?: string;
  price: number;                   // 5000
}
```

### 5.4 Entité `Remise` (Versement des fonds collectés)
```typescript
interface Remise {
  id: string;                      // Ex: "rem-1727878900000"
  reference: string;               // Ex: "REM-2026-0005"
  agentId: string;                 // UUID de l'agent ou responsable versant
  agentName: string;
  responsableId: string;           // UUID du destinataire (Responsable ou Admin)
  responsableName: string;
  sectorId: string;
  sectorName: string;
  amount: number;                  // Montant en FCFA (multiple de 5 000)
  date: string;                    // YYYY-MM-DD
  time: string;                    // HH:mm:ss
  createdAt: string;
  note?: string;
  ticketIdsCovered: string[];      // Liste des IDs des tickets apurés par ce versement
  ticketsCount: number;            // amount / 5000
  history: RemiseHistoryEntry[];
}
```

---

## 6. SÉCURITÉ CRYPTOGRAPHIQUE DES QR CODES

Chaque ticket physique comporte un QR Code sécurisé structuré au format JSON compact V1 :

```json
{
  "v": 1,
  "tid": "91c84575-f731-4073-a76a-70fd9321f096",
  "cid": "a2b3c4d5-e6f7-4890-abcd-123456789001",
  "ref": "C-2026-003",
  "num": "VRDBAY-000001",
  "tok": "SEC-4F8A9E3C12D5B760",
  "sig": null
}
```

### Règles de vérification du Scanner Contrôleur :
1. **Intégrité syntaxique :** Décodage JSON et présence de `tid`, `num`, `tok`.
2. **Recherche croisée :** Correspondance avec la table `tickets` (en cache local ou distante).
3. **Machine à états de validité :**
   - Si `status !== 'SOLD' && status !== 'CONTROLLED'` ➔ **NON VALIDE** (Ticket non encore vendu en caisse).
   - Si `soldAt` a plus de 7 jours (168 heures) ➔ **EXPIRÉ** (`VALIDITY_EXPIRED`).
   - Si `ticket.plateNumber !== scannedVehiclePlate` ➔ **FRAUDE / ANOMALIE VÉHICULE**.
   - Si `isSuperseded === true` ➔ **CADUC** (Remplacé par un ticket plus récent).
   - Si valide ➔ **VALIDE** (Incrémentation de `controlCount`, horodatage `controlledAt`).

---

## 7. PROTOCOLE DE SYNCHRONISATION HORS-LIGNE & IDEMPOTENCE

L'application est opérée sur les terminaux des agents dans des conditions réseau instables (bord de quai portuaire).  
Pour éliminer les risques de double-vente ou de perte de données :

1. **Idempotency Keys :** Tout enregistrement de vente génère un `saleId` (UUID v4) dès la saisie locale.
2. **Double Écriture Atomique :**
   - Écriture immédiate dans IndexedDB (`tickets`, `sales`, `audit_logs`).
   - Envoi immédiat vers Supabase via la fonction PostgreSQL sécurisée `sell_ticket_secure(p_ticket_id, p_plate_number, ...)` si connecté.
   - En cas d'échec réseau, `syncStatus` est marqué `PENDING_SYNC`.
3. **Réconciliation en arrière-plan :**
   - Dès le rétablissement de la connexion (`window.ononline` ou déclencheur périodique), la file `PENDING_SYNC` est dépilée par paquets de 50 enregistrements.
   - La base PostgreSQL Supabase vérifie la clé d'idempotence `sync_idempotency_key` pour ignorer tout doublon sans lever d'erreur.

---

## 8. ARBORESCENCE & PLAN DU CODE SOURCE

```
/
├── server.ts                       # Serveur Node.js Express (port 3000, proxy API, Vite middleware)
├── src/
│   ├── main.tsx                    # Point d'entrée React 19 SPA
│   ├── App.tsx                     # Router applicatif conditionné par le rôle RBAC
│   ├── types/
│   │   └── index.ts                # Contrats d'interfaces TypeScript exhaustifs
│   ├── config/
│   │   └── constants.ts            # Paramètres officiels (Tarif 5000 FCFA, 7 jours, Vridi)
│   ├── context/
│   │   ├── AuthContext.tsx         # Gestion de session, profils utilisateurs et rôles
│   │   └── DataContext.tsx         # Data Layer unifié (IndexedDB + Supabase DataLayer + FSM)
│   ├── db/
│   │   ├── indexedDb.ts            # Schéma et migrations IndexedDB ('portus-db', v8)
│   │   ├── supabaseClient.ts       # Client Supabase JS initialisé
│   │   ├── supabaseService.ts      # Requêtes, RPCs PostgreSQL et synchroniseurs batch
│   │   └── supabase-schema.sql     # DDL PostgreSQL complet (Tables, RLS, Fonctions, Triggers)
│   ├── components/
│   │   ├── admin/                  # Modales d'administration (Comptes, Fraudes, Tarifs, Supabase)
│   │   ├── dashboard/              # Tableaux de bord par rôle (Admin, Responsable, Agent, Contrôleur)
│   │   ├── sales/                  # Guichet de vente (SaleFormModal, SalesListModal)
│   │   ├── remises/                # Gestion des remises (RemiseFormModal, RemisesListModal)
│   │   ├── tickets/                # Impression PDF et administration des carnets
│   │   ├── controls/               # Scanner de contrôle et historique de brigade
│   │   └── common/                 # Header, indicateur hors-ligne, notifications, cachet officiel
│   └── utils/
│       ├── ticketSecurity.ts       # Génération jetons SEC, signature QR et machine à états
│       ├── normalization.ts        # Normalisation immatriculations et devises FCFA
│       ├── pdfGenerator.ts         # Planches PDF A4 (9 tickets/page) et récépissés financiers
│       ├── excelExport.ts          # Exports Excel consolidés (feuilles multiples)
│       └── cedeao.ts               # Indicatifs téléphoniques CEDEAO & Reçus WhatsApp
└── package.json                    # Configuration des dépendances et scripts de build
```

---

## 9. COMMANDES D'EXÉCUTION ET DE VALIDATION

- **Démarrage en Développement :**
  ```bash
  npm run dev   # Lance tsx server.ts (Express + Vite HMR sur port 3000)
  ```
- **Vérification Typage & Syntaxe :**
  ```bash
  npm run lint  # Exécute tsc --noEmit (zéro erreur tolérée)
  ```
- **Compilation Production :**
  ```bash
  npm run build # Génère le bundle client dans dist/ et dist/server.cjs
  ```
- **Lancement en Production :**
  ```bash
  npm run start # Exécute node dist/server.cjs
  ```

---
*Fin du document de spécification technique pour agent IA.*
