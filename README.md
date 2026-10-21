# PORTUS — U.J.P.A.S.
**Système officiel de gestion des tickets de stationnement poids lourds, ventes terrain, contrôles corridor et traçabilité financière.**

- **Organisation** : **U.J.P.A.S.** (*Union des Jeunes du Port pour l'Assistance et la Sécurité — Zone Portuaire & Industrielle d'Abidjan*)
- **Zone d'intervention** : Zone Portuaire & Industrielle d'Abidjan — Port Autonome d'Abidjan
- **Mission** : Fluidification du corridor logistique, assistance aux chauffeurs routiers CEDEAO, sécurisation du stationnement et perception transparente des droits de stationnement.
- **Validité Réglementaire** : **14 jours stricts** à compter de l'émission du ticket.
- **Contacts opérationnels** : +225 07 77 91 78 04 / +225 01 03 31 37 68
- **Email officiel** : contact@portus-ujpas.online
- **Projet Supabase** : `PORTUS-UJPAS`

---

## 🏗️ Architecture & Technologies de Niveau Bancaire

- **Frontend** : React 19, TypeScript strict (zéro `any`), Tailwind CSS v4, Lucide Icons, Vite 8.
- **Architecture d'État** : Store Zustand unifié avec indexation précalculée $O(1)$ (`availableAgentsList`, `vehicleProfileByPlateMap`) et façade `DataContext`.
- **Persistance & Mode Déconnecté (Offline-First)** : IndexedDB locale (`idb`) avec compression WebP/JPEG hors-ligne des photos d'agents (< 25 Ko) et file de synchronisation idempotente (`sync_queue`).
- **Backend & API** : Node.js / Express avec middlewares Vite, compatible déploiement Serverless (Vercel / Cloud Run).
- **Base de Données & Sécurité** : PostgreSQL Supabase avec politiques Row Level Security (RLS) durcies, suppression en cascade contrôlée par l'Administrateur, journal d'audit immuable et chiffrement `pgcrypto`.
- **Cryptographie QR Code & Contrôle** : Signatures autoritaires HMAC-SHA256, contrôle strict d'expiration à 14 jours et Trombinoscope de confrontation visuelle des agents.
- **Moteur d'Impression Chirurgical** : Grille officielle **3×2 sur A4 Paysage** (6 tickets par page de `100mm × 80mm` chacun) avec conservation intégrale des couleurs dynamiques (`print-color-adjust: exact`).

---

## 🔒 Gouvernance et Rôles Utilisateurs (U.J.P.A.S.)

L'application opère selon une hiérarchie opérationnelle claire (le rôle `TRESORIER` est masqué au profit d'un flux direct Agent → Superviseur → Administrateur) :

1. **ADMINISTRATEUR** : Maître de l'ensemble du système, génère et supprime définitivement les carnets (`ON DELETE CASCADE`), mobilise tout agent disponible, valide les clôtures et remises financières des superviseurs, gère les utilisateurs (avec photos officielles) et audite les opérations.
2. **RESPONSABLE (Superviseur)** : Mobilise n'importe quel agent libre du pool global U.J.P.A.S. pour lui attribuer un carnet, réceptionne les remises des agents (Espèces, Wave, Orange Money, Moov), traite les alertes SOS terrain et fait le point financier directement à l'Administrateur.
3. **AGENT (Percepteur Terrain)** : Émet les tickets de stationnement (validité 14 jours, auto-complétion plaque CEDEAO, mode convoi, choix du mode de paiement), déclenche des alertes SOS géolocalisées en cas d'incident et prépare ses remises.
4. **CONTROLEUR (Corridor Portuaire)** : Scanne les QR codes des camions stationnés, vérifie la validité stricte de 14 jours et la signature HMAC, utilise le Trombinoscope des agents pour confrontation visuelle avec le chauffeur et signale les fraudes ou urgences SOS.

---

## 🚀 Démarrage et Développement

```bash
# 1. Configurer les variables d'environnement (.env)
# Définir obligatoirement VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY

# 2. Installation des dépendances
npm install

# 3. Démarrage du serveur de développement (Port 3000)
npm run dev

# 4. Vérification du typage et compilation de production
npm run build

# 5. Exécution de la suite de tests
npm test
```
