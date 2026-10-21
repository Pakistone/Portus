/**
 * Moteur de Calcul et de Vérification d'Expiration Réglementaire (14 Jours Stricts)
 * PORTUS — U.J.P.A.S. (Union des Jeunes du Port pour l'Assistance et la Sécurité)
 * Zone Portuaire & Industrielle d'Abidjan
 */

export const TICKET_VALIDITY_DAYS = 14;
export const TICKET_VALIDITY_MS = TICKET_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

export interface TicketValidityStatus {
  readonly isValid: boolean;
  readonly isExpired: boolean;
  readonly soldAtIso: string | null;
  readonly expiresAtIso: string | null;
  readonly expiresAtFormatted: string;
  readonly remainingDays: number;
  readonly daysRemaining: number;
  readonly remainingHours: number;
  readonly elapsedDays: number;
  readonly label: string;
  readonly badgeVariant: 'emerald' | 'amber' | 'rose' | 'slate';
}

/**
 * Calcule la date ISO exacte d'expiration à partir de la date de vente (+14 jours stricts).
 */
export function computeExpirationDate(soldAtIso: string): string {
  const parsed = soldAtIso ? new Date(soldAtIso) : new Date();
  const baseMs = Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
  return new Date(baseMs + TICKET_VALIDITY_MS).toISOString();
}

/**
 * Formate une date d'expiration en français lisible (ex: "03/11/2026 à 14:30").
 */
export function formatExpirationDateFR(isoString?: string | null): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';

  const datePart = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} à ${timePart}`;
}

/**
 * Évalue l'état de validité stricte d'un ticket sur la fenêtre réglementaire de 14 jours.
 */
export function getTicketValidityStatus(
  soldAtIso?: string | null,
  explicitExpiresAt?: string | null
): TicketValidityStatus {
  if (!soldAtIso && !explicitExpiresAt) {
    return {
      isValid: false,
      isExpired: false,
      soldAtIso: null,
      expiresAtIso: null,
      expiresAtFormatted: 'Non vendu',
      remainingDays: 0,
      daysRemaining: 0,
      remainingHours: 0,
      elapsedDays: 0,
      label: 'NON VENDU (AUCUNE DATE D’ÉMISSION)',
      badgeVariant: 'slate',
    };
  }

  const nowMs = Date.now();
  const soldDate = soldAtIso ? new Date(soldAtIso) : null;
  const soldMs = soldDate && !Number.isNaN(soldDate.getTime()) ? soldDate.getTime() : nowMs;

  const computedExpiresIso =
    explicitExpiresAt && !Number.isNaN(new Date(explicitExpiresAt).getTime())
      ? new Date(explicitExpiresAt).toISOString()
      : computeExpirationDate(new Date(soldMs).toISOString());

  const expiresMs = new Date(computedExpiresIso).getTime();
  const diffMs = expiresMs - nowMs;
  const elapsedMs = Math.max(0, nowMs - soldMs);
  const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  const expiresAtFormatted = formatExpirationDateFR(computedExpiresIso);

  if (diffMs <= 0) {
    const overdueDays = Math.max(1, Math.ceil(Math.abs(diffMs) / (24 * 60 * 60 * 1000)));
    return {
      isValid: false,
      isExpired: true,
      soldAtIso: soldAtIso || null,
      expiresAtIso: computedExpiresIso,
      expiresAtFormatted,
      remainingDays: 0,
      daysRemaining: -overdueDays,
      remainingHours: 0,
      elapsedDays,
      label: `EXPIRÉ DEPUIS ${overdueDays} JOUR${overdueDays > 1 ? 'S' : ''} (> 14 JOURS)`,
      badgeVariant: 'rose',
    };
  }

  const remainingDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const remainingHours = Math.ceil((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const isNearExpiry = remainingDays < 2;

  return {
    isValid: true,
    isExpired: false,
    soldAtIso: soldAtIso || null,
    expiresAtIso: computedExpiresIso,
    expiresAtFormatted,
    remainingDays,
    daysRemaining: remainingDays,
    remainingHours,
    elapsedDays,
    label:
      remainingDays > 0
        ? `VALIDE (${remainingDays}j ${remainingHours}h restants / 14j)`
        : `VALIDE (${remainingHours}h restantes / 14j)`,
    badgeVariant: isNearExpiry ? 'amber' : 'emerald',
  };
}
