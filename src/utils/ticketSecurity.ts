/**
 * Module de sécurité, de signature QR Code et de machine à états pour PORTUS — U.J.S.R.V.
 * 
 * RÈGLES MÉTIER :
 * 1. Chaque QR Code identifie de manière unique le ticket (pas seulement le numéro physique).
 * 2. Utilise un token cryptographique sécurisé pour limiter toute falsification.
 * 3. Prévoit l'emplacement pour une signature cryptographique ultérieure.
 * 4. Machine à états stricte pour les statuts de tickets afin d'empêcher les transitions incohérentes.
 */

import type { Ticket, TicketStatus } from '../types';

export interface TicketQRPayload {
  v: number; // Version du schéma (v1)
  tid: string; // UUID interne unique du ticket
  cid: string; // UUID du carnet
  ref: string; // Référence carnet (ex: C-2026-001)
  num: string; // Numéro physique visible
  tok: string; // Token de sécurité cryptographique
  sig: string | null; // Emplacement pour signature cryptographique ultérieure
}

/**
 * Génère un jeton cryptographique aléatoire sécurisé (128 bits / 32 caractères hex)
 */
export function generateTicketSecurityToken(ticketId: string, carnetId: string, ticketNumber: string): string {
  try {
    const array = new Uint8Array(16);
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(array);
      const hex = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
      return `SEC-${hex.toUpperCase()}`;
    }
  } catch {
    // Fallback si indisponible
  }
  const fallbackHex = Math.random().toString(36).substring(2) + Date.now().toString(36);
  return `SEC-${ticketId.slice(0, 4)}-${carnetId.slice(0, 4)}-${fallbackHex}`.toUpperCase();
}

/**
 * Construit le payload officiel du QR Code pour un ticket donné
 */
export function buildTicketQRPayload(params: {
  ticketId: string;
  carnetId: string;
  carnetNumber: string;
  ticketNumber: string;
}): string {
  const payload: TicketQRPayload = {
    v: 1,
    tid: params.ticketId,
    cid: params.carnetId,
    ref: params.carnetNumber,
    num: params.ticketNumber,
    tok: generateTicketSecurityToken(params.ticketId, params.carnetId, params.ticketNumber),
    sig: null, // Réservé pour signature asymétrique Ed25519 ultérieure
  };
  return JSON.stringify(payload);
}

/**
 * Décode et valide un payload de QR Code scanné
 */
export function parseTicketQRPayload(qrRaw: string): TicketQRPayload | null {
  if (!qrRaw) return null;
  try {
    const parsed = JSON.parse(qrRaw);
    if (parsed && typeof parsed === 'object' && (parsed.tid || parsed.t || parsed.num)) {
      return {
        v: parsed.v || 1,
        tid: parsed.tid || parsed.id || parsed.t || '',
        cid: parsed.cid || parsed.carnetId || parsed.c || '',
        ref: parsed.ref || parsed.carnetNumber || '',
        num: parsed.num || parsed.ticketNumber || parsed.t || '',
        tok: parsed.tok || parsed.s || '',
        sig: parsed.sig || null,
      };
    }
  } catch {
    // Si format simple texte brut
    return {
      v: 1,
      tid: qrRaw,
      cid: '',
      ref: '',
      num: qrRaw,
      tok: '',
      sig: null,
    };
  }
  return null;
}

/**
 * Résultat de l'audit d'authenticité cryptographique du QR Code
 */
export interface QRTokenVerificationResult {
  isAuthentic: boolean;
  forgeryDetected: boolean;
  reason?: string;
  expectedToken?: string;
  scannedToken?: string;
}

/**
 * Valide le jeton cryptographique interne d'un ticket scanné contre le jeton stocké en base.
 * RÈGLE CRITIQUE : Ne jamais faire confiance au seul numéro physique visible.
 * Si le QR contient un numéro physique valide mais un jeton absent ou non conforme,
 * il s'agit d'une tentative de falsification (FAUX_TICKET).
 */
export function verifyTicketSecurityToken(
  storedPayloadOrToken: string | null | undefined,
  scannedToken: string | null | undefined
): QRTokenVerificationResult {
  if (!storedPayloadOrToken) {
    // Ticket legacy sans token cryptographique stocké
    return { isAuthentic: true, forgeryDetected: false };
  }

  // Extraire le token attendu depuis le JSON stocké ou la chaîne brute
  let expectedToken = '';
  try {
    const parsed = JSON.parse(storedPayloadOrToken);
    expectedToken = (parsed.tok || parsed.s || '').trim();
  } catch {
    expectedToken = storedPayloadOrToken.trim();
  }

  // Si aucun token interne n'est configuré en base pour ce ticket
  if (!expectedToken) {
    return { isAuthentic: true, forgeryDetected: false };
  }

  const cleanScanned = (scannedToken || '').trim();

  // Si le QR Code ne présente aucun token alors que le ticket en requiert un
  if (!cleanScanned) {
    return {
      isAuthentic: false,
      forgeryDetected: true,
      reason: 'QR Code sans jeton cryptographique valide : suspicion de reproduction frauduleuse du seul numéro physique.',
      expectedToken,
      scannedToken: '',
    };
  }

  // Vérification de concordance exacte
  if (cleanScanned !== expectedToken) {
    return {
      isAuthentic: false,
      forgeryDetected: true,
      reason: 'Jeton cryptographique non concordant : la clé interne ne correspond pas au numéro de ticket enregistré.',
      expectedToken,
      scannedToken: cleanScanned,
    };
  }

  return { isAuthentic: true, forgeryDetected: false };
}

// --------------------------------------------------------------------------
// MACHINE À ÉTATS ET CONTRÔLE DES TRANSITIONS DE STATUTS
// --------------------------------------------------------------------------

/**
 * Matrice des transitions de statuts strictement autorisées :
 * GENERATED
 * ASSIGNED_TO_RESPONSIBLE
 * AVAILABLE
 * ASSIGNED_TO_AGENT
 * SOLD
 * CONTROLLED
 * CANCELLED
 */
export const ALLOWED_TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  GENERATED: [
    'ASSIGNED_TO_RESPONSIBLE', // Attribution au responsable de secteur
    'AVAILABLE',               // Mise en stock central admin
    'CANCELLED',               // Annulation directe
  ],
  ASSIGNED_TO_RESPONSIBLE: [
    'ASSIGNED_TO_AGENT',       // Distribution à un agent de terrain
    'AVAILABLE',               // Retour au stock central (ex: désactivation responsable)
    'CANCELLED',               // Annulation
  ],
  AVAILABLE: [
    'ASSIGNED_TO_RESPONSIBLE', // Attribution à un responsable
    'ASSIGNED_TO_AGENT',       // Attribution directe à un agent
    'CANCELLED',               // Annulation
  ],
  ASSIGNED_TO_AGENT: [
    'SOLD',                    // Vente physique sur le terrain (avec plaque)
    'ASSIGNED_TO_RESPONSIBLE', // Retour ticket non vendu au responsable
    'AVAILABLE',               // Retour au stock central
    'CANCELLED',               // Annulation exceptionnelle
  ],
  SOLD: [
    'CONTROLLED',              // Contrôle routier validé
    'CANCELLED',               // Annulation exceptionnelle justifiée par Admin
  ],
  CONTROLLED: [
    'CONTROLLED',              // Nouveaux contrôles successifs
    'CANCELLED',               // Annulation exceptionnelle justifiée par Admin
  ],
  CANCELLED: [
    // ÉTAT TERMINAL : Aucune transition n'est autorisée depuis un statut ANNULÉ
  ],
};

/**
 * Vérifie si une transition de statut est valide selon les règles métier
 */
export function canTransitionTicketStatus(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TICKET_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Valide une transition de statut et lève une exception détaillée si invalide
 */
export function assertTicketStatusTransition(
  ticketNumber: string,
  from: TicketStatus,
  to: TicketStatus
): void {
  if (!canTransitionTicketStatus(from, to)) {
    const allowedList = ALLOWED_TICKET_TRANSITIONS[from]?.join(', ') || 'aucune (état terminal)';
    throw new Error(
      `Transition de statut non autorisée pour le ticket "${ticketNumber}" : impossible de passer de [${from}] à [${to}]. Transitions permises : [${allowedList}].`
    );
  }
}
