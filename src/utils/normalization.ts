/**
 * Module de Normalisation des Données Métier de PORTUS — U.J.P.A.S.
 * Union des Jeunes du Port pour l'Assistance et la Sécurité — Zone Portuaire & Industrielle d'Abidjan
 *
 * RÈGLES STRICTES :
 * - Tous les textes métier sont automatiquement normalisés :
 *   - majuscules
 *   - suppression des caractères spéciaux (selon le contexte)
 *   - suppression des accents (É -> E, etc.)
 * - Exemple immatriculation : "Ab-1234 cd" -> "AB1234CD"
 * - Exemple nom : "Kouassi Éric" -> "KOUASSI ERIC"
 * - Téléphone : uniquement sous forme de chiffres
 *
 * ⚠️ RÈGLE CRITIQUE :
 * NE JAMAIS transformer ou modifier les mots de passe.
 */

/**
 * Supprime les accents diacritiques d'une chaîne Unicode.
 */
export function removeAccents(str: string): string {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalisation générale d'un texte métier (nom, prénom, lieu, secteur, etc.).
 */
export function normalizeText(str: string): string {
  if (!str) return '';
  const withoutAccents = removeAccents(str);
  return withoutAccents
    .toUpperCase()
    .replace(/[^A-Z0-9\s\-_.']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalisation stricte d'une plaque d'immatriculation CEDEAO ("Ab-1234 cd" => "AB1234CD").
 */
export function normalizePlate(plate: string): string {
  if (!plate) return '';
  const clean = removeAccents(plate);
  return clean.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Validation stricte d'une plaque d'immatriculation aux normes de Côte d'Ivoire & CEDEAO.
 * Exemples valides : "5829HZ01", "9021GF01", "CI-1234-AB", "IT-1234-A", "3048FK01", "7721HG01".
 */
export function isValidIvoirianPlate(plate: string): boolean {
  const clean = normalizePlate(plate);
  if (!clean || clean.length < 5 || clean.length > 10) return false;

  const patternStandardCI = /^\d{4}[A-Z]{2}\d{2}$/;      // ex: 5829HZ01 (Format principal CI)
  const patternClassique = /^[A-Z]{2}\d{4}[A-Z]{2}$/;  // ex: CI1234AB / AB1234CD
  const patternTransit   = /^[A-Z]{2}\d{3,4}[A-Z]{1,2}$/; // ex: IT1234A / TT1234AB
  const patternFlotte    = /^\d{3,5}[A-Z]{2}\d{1,2}$/;  // ex: 1234AB01
  const patternSpecial   = /^[A-Z]{1,3}\d{3,5}$/;       // ex: W12345 / CD123

  return (
    patternStandardCI.test(clean) ||
    patternClassique.test(clean) ||
    patternTransit.test(clean) ||
    patternFlotte.test(clean) ||
    patternSpecial.test(clean)
  );
}

/**
 * Formatage d'affichage d'une plaque pour la lisibilité humaine.
 */
export function formatPlateDisplay(plate: string): string {
  const norm = normalizePlate(plate);
  if (!norm) return '';
  if (/^[A-Z]{2}\d{4}[A-Z]{2}$/.test(norm)) {
    return `${norm.slice(0, 2)}-${norm.slice(2, 6)}-${norm.slice(6)}`;
  }
  if (/^\d{4}[A-Z]{2}\d{2}$/.test(norm)) {
    return `${norm.slice(0, 4)}-${norm.slice(4, 6)}-${norm.slice(6)}`;
  }
  return norm;
}

/**
 * Normalisation du nom complet d'une personne ("Kouassi Éric" => "KOUASSI ERIC").
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  const withoutAccents = removeAccents(name);
  return withoutAccents
    .toUpperCase()
    .replace(/[^A-Z\s\-']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalisation d'un numéro de téléphone (chiffres uniquement).
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Formatage d'un montant monétaire en FCFA avec séparateur de milliers.
 */
export function formatFCFA(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return (
    new Intl.NumberFormat('fr-FR', {
      style: 'decimal',
      maximumFractionDigits: 0,
    }).format(safeAmount) + ' FCFA'
  );
}

/**
 * Formatage date et heure locale (JJ/MM/AAAA HH:MM:SS).
 */
export function formatDateTime(isoString: string | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Formatage date locale courte (JJ/MM/AAAA).
 */
export function formatDate(isoString: string | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}
