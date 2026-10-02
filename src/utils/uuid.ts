/**
 * Générateur UUID v4 conforme RFC 4122 pour PORTUS — U.J.S.R.V.
 * Utilise EXCLUSIVEMENT des primitives cryptographiques sécurisées.
 * Aucun recours à Math.random().
 */

export function generateUUID(): string {
  // Préférer crypto.randomUUID() natif (navigateur moderne et Node.js)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback cryptographiquement sécurisé via crypto.getRandomValues
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // RFC 4122 version 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // RFC 4122 variant (10xxxxxx)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  // Environnement Node.js sans crypto global (rare)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto');
    if (nodeCrypto.randomUUID) {
      return nodeCrypto.randomUUID();
    }
  } catch {}

  throw new Error('Aucun générateur aléatoire cryptographique sécurisé disponible.');
}

/**
 * Génère un identifiant sécurisé hexadécimal à partir d'octets cryptographiques
 */
export function generateSecureToken(prefix = 'TOK', byteLength = 16): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `${prefix}-${hex}`;
  }
  return `${prefix}-${generateUUID().replace(/-/g, '').slice(0, byteLength * 2).toUpperCase()}`;
}
