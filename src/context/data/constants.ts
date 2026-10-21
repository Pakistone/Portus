import type { Role, PortusPaymentMethod } from '../../types';

/**
 * Constantes métier et gouvernance d'état pour PORTUS — U.J.P.A.S.
 * Union des Jeunes du Port pour l'Assistance et la Sécurité — Zone Portuaire & Industrielle d'Abidjan
 *
 * RÈGLE ARCHITECTURALE (Phase 3) :
 * - Aucun contournement par localStorage pour la suppression des carnets (gérée en Hard Delete via ON DELETE CASCADE).
 * - Masquage intégral du rôle TRESORIER dans les sélecteurs d'interface.
 * - Typage strict et zéro bloc catch vide.
 */

export const OPERATIONAL_UJPAS_ROLES: ReadonlyArray<{
  readonly role: Role;
  readonly label: string;
  readonly description: string;
}> = [
  {
    role: 'ADMINISTRATEUR',
    label: 'Administrateur Général',
    description:
      'Direction générale U.J.P.A.S., génération et purge de carnets, supervision financière et audit.',
  },
  {
    role: 'RESPONSABLE',
    label: 'Superviseur / Responsable',
    description:
      'Mobilisation du pool global d’agents, attribution de carnets, collecte des remises et point à l’Administrateur.',
  },
  {
    role: 'AGENT',
    label: 'Agent Percepteur Terrain',
    description:
      'Émission des tickets (validité 14 jours), encaissement multi-canal et signalement SOS.',
  },
  {
    role: 'CONTROLEUR',
    label: 'Contrôleur Corridor Portuaire',
    description:
      'Vérification QR HMAC-SHA256, contrôle d’expiration 14 jours et confrontation via Trombinoscope.',
  },
] as const;

export const OFFICIAL_PAYMENT_METHODS: ReadonlyArray<{
  readonly id: Extract<PortusPaymentMethod, 'ESPECES' | 'WAVE' | 'ORANGE_MONEY' | 'MOOV'>;
  readonly label: string;
  readonly shortLabel: string;
}> = [
  { id: 'ESPECES', label: 'Espèces (Cash FCFA)', shortLabel: 'Espèces' },
  { id: 'WAVE', label: 'Wave Côte d’Ivoire', shortLabel: 'Wave' },
  { id: 'ORANGE_MONEY', label: 'Orange Money', shortLabel: 'Orange Money' },
  { id: 'MOOV', label: 'Moov Money', shortLabel: 'Moov' },
] as const;

export function isVisibleOperationalRole(role?: string | null): role is Role {
  if (!role) return false;
  return (
    role === 'ADMINISTRATEUR' ||
    role === 'RESPONSABLE' ||
    role === 'AGENT' ||
    role === 'CONTROLEUR'
  );
}

/**
 * Registre en mémoire vive de la session courante pour éviter tout rechargement résiduel
 * pendant une transaction de suppression en cours (sans persistance localStorage).
 */
const inFlightDeletedCarnetIds = new Set<string>();

export function getStoredDeletedCarnetIds(): Set<string> {
  return new Set<string>(inFlightDeletedCarnetIds);
}

export function recordDeletedCarnet(id: string, carnetNumber?: string): void {
  if (id && id.trim().length > 0) {
    inFlightDeletedCarnetIds.add(id.trim());
  }
  if (carnetNumber && carnetNumber.trim().length > 0) {
    inFlightDeletedCarnetIds.add(carnetNumber.trim());
  }
}

export function clearDeletedCarnetRecord(id: string, carnetNumber?: string): void {
  if (id) {
    inFlightDeletedCarnetIds.delete(id.trim());
  }
  if (carnetNumber) {
    inFlightDeletedCarnetIds.delete(carnetNumber.trim());
  }
}
