/**
 * Générateur UUID v4 conforme RFC 4122 pour PORTUS — U.J.P.A.S.
 * Union des Jeunes du Port pour l'Assistance et la Sécurité — Zone Portuaire & Industrielle d'Abidjan
 * Pureté ESNext stricte : utilise EXCLUSIVEMENT globalThis.crypto.randomUUID() et globalThis.crypto.getRandomValues().
 * Aucun bloc CommonJS require('crypto').
 */

export function generateUUID(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    // RFC 4122 version 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // RFC 4122 variant (10xxxxxx)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  throw new Error(
    '[PORTUS — U.J.P.A.S. Security] Aucun générateur cryptographique Web Crypto disponible dans cet environnement.'
  );
}

/**
 * Génère un jeton sécurisé hexadécimal à partir d'octets cryptographiques.
 */
export function generateSecureToken(prefix = 'TOK', byteLength = 16): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(byteLength);
    globalThis.crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `${prefix}-${hex}`;
  }
  return `${prefix}-${generateUUID().replace(/-/g, '').slice(0, byteLength * 2).toUpperCase()}`;
}
