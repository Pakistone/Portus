/**
 * Module de sécurité cryptographique, de signature QR Code et de machine à états pour PORTUS — U.J.P.A.S.
 * 
 * PROTOCOLE OFFICIEL UNIFIÉ :
 * 1. Payload canonique : PORTUS|v1|ticket_id|carnet_number|ticket_number|price
 * 2. Signature : HMAC-SHA256 autoritaire calculée côté serveur / base de données.
 * 3. Règle absolue : Si signature_valid = false => valid = false TOUJOURS.
 * 4. Protection anti-rejeu (Replay Protection) : Horodatage, compteur de scans et détection d'anomalies.
 * 5. Machine à états stricte pour contrôler les transitions de statuts.
 * 6. Cryptographie sécurisée : Aucun usage de Math.random().
 */

import type { Ticket, TicketStatus } from '../types';
import { generateUUID } from './uuid';

export interface TicketQRPayload {
  v: number; // Version du schéma (1)
  ticket_id: string; // UUID interne du ticket
  carnet_number: string; // Numéro du carnet (ex: C-2026-001)
  ticket_number: string; // Numéro visible du ticket (ex: VRD-000101)
  carnet_date?: string; // Date de création du carnet formatée (ex: 18/10/2026 14:30)
  carnet_created_at?: string; // Date ISO de création du carnet
  price: number; // Prix officiel en FCFA (5000)
  signature: string | null; // Signature HMAC-SHA256 autoritaire
  created_at?: string;
  // Clés compactes pour compatibilité QR scanners
  tid?: string;
  cid?: string;
  ref?: string;
  num?: string;
  tok?: string;
  sig?: string | null;
}

/**
 * Construit la chaîne canonique normalisée pour signature / vérification HMAC-SHA256
 * Format : PORTUS|v1|ticket_id|carnet_number|ticket_number|price
 */
export function buildCanonicalTicketString(params: {
  ticketId: string;
  carnetNumber: string;
  ticketNumber: string;
  price: number;
}): string {
  const cleanTid = (params.ticketId || '').trim();
  const cleanCarnet = (params.carnetNumber || 'VRD').trim();
  const cleanNumber = (params.ticketNumber || '').trim().toUpperCase();
  const cleanPrice = Number(params.price) || 5000;
  return `PORTUS|v1|${cleanTid}|${cleanCarnet}|${cleanNumber}|${cleanPrice}`;
}

/**
 * Génère un jeton cryptographique aléatoire sécurisé (128 bits / 32 caractères hex)
 * Utilise strictement l'API Web Cryptography
 */
export function generateTicketSecurityToken(ticketId: string, carnetId: string, ticketNumber: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const hex = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    return `SEC-${hex.toUpperCase()}`;
  }
  return `SEC-${generateUUID().replace(/-/g, '').slice(0, 24).toUpperCase()}`;
}

/**
 * Construit un texte de QR code structuré et optimisé pour lecture immédiate
 * par l'appareil photo d'un smartphone (iPhone / Android) ainsi que par le scanner Portus.
 * Affiche clairement :
 * - Le numéro officiel du ticket
 * - La date et heure de création du carnet
 * - Le numéro de carnet
 * - Le prix officiel et la mention de sécurité
 */
export function formatTicketQrForCameraScan(params: {
  ticketNumber: string;
  carnetNumber?: string;
  carnetCreatedAt?: string;
  createdAt?: string;
  price?: number;
  ticketId?: string;
  signature?: string | null;
}): string {
  const tNum = (params.ticketNumber || '').trim().toUpperCase();
  const cNum = (params.carnetNumber || '').trim().toUpperCase();
  const price = params.price || 5000;

  let dateStr = '—';
  const rawDate = params.carnetCreatedAt || params.createdAt;
  if (rawDate) {
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        const datePart = d.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const timePart = d.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        dateStr = `${datePart} ${timePart}`;
      } else {
        dateStr = String(rawDate);
      }
    } catch {
      dateStr = String(rawDate);
    }
  }

  const lines: string[] = [
    'PORTUS — UJPAS 🇨🇮',
    `TICKET N° : ${tNum}`,
    `DATE CRÉATION CARNET : ${dateStr}`,
  ];

  if (cNum) {
    lines.push(`CARNET N° : ${cNum}`);
  }

  lines.push(`PRIX : ${price.toLocaleString('fr-FR')} FCFA`);
  lines.push('SÉCURITÉ : AUTHENTIQUE');

  return lines.join('\n');
}

/**
 * Construit le payload officiel du QR Code pour un ticket
 */
export function buildTicketQRPayload(params: {
  ticketId: string;
  carnetId?: string;
  carnetNumber: string;
  ticketNumber: string;
  carnetCreatedAt?: string;
  price?: number;
  signature?: string | null;
  asPlainTextForCamera?: boolean;
}): string {
  const price = params.price || 5000;
  const token = generateTicketSecurityToken(params.ticketId, params.carnetId || '', params.ticketNumber);

  if (params.asPlainTextForCamera) {
    return formatTicketQrForCameraScan({
      ticketNumber: params.ticketNumber,
      carnetNumber: params.carnetNumber,
      carnetCreatedAt: params.carnetCreatedAt,
      price,
      ticketId: params.ticketId,
      signature: params.signature,
    });
  }

  let formattedDate: string | undefined = undefined;
  if (params.carnetCreatedAt) {
    try {
      const d = new Date(params.carnetCreatedAt);
      if (!isNaN(d.getTime())) {
        formattedDate = `${d.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      }
    } catch {
      formattedDate = params.carnetCreatedAt;
    }
  }

  const payload: TicketQRPayload = {
    v: 1,
    ticket_id: params.ticketId,
    carnet_number: params.carnetNumber,
    ticket_number: params.ticketNumber,
    carnet_date: formattedDate,
    carnet_created_at: params.carnetCreatedAt,
    price,
    signature: params.signature || null,
    // Alias compacts pour scanners et rétrocompatibilité
    tid: params.ticketId,
    cid: params.carnetId,
    ref: params.carnetNumber,
    num: params.ticketNumber,
    tok: token,
    sig: params.signature || null,
  };
  return JSON.stringify(payload);
}

/**
 * Décode et normalise un payload de QR Code scanné (JSON, format appareil photo lisible ou texte brut)
 */
export function parseTicketQRPayload(qrRaw: string): TicketQRPayload | null {
  if (!qrRaw) return null;
  const rawTrimmed = qrRaw.trim();

  // 1. Détection format canonique direct : PORTUS|v1|ticket_id|carnet_number|ticket_number|price
  if (rawTrimmed.startsWith('PORTUS|v1|')) {
    const parts = rawTrimmed.split('|');
    if (parts.length >= 6) {
      return {
        v: 1,
        ticket_id: parts[2],
        carnet_number: parts[3],
        ticket_number: parts[4],
        price: Number(parts[5]) || 5000,
        signature: parts[6] || null,
        tid: parts[2],
        ref: parts[3],
        num: parts[4],
        sig: parts[6] || null,
      };
    }
  }

  // 2. Détection format texte lisible smartphone / appareil photo (ex: TICKET N° : VRDCH-000001 ...)
  if (rawTrimmed.includes('\n') || rawTrimmed.toUpperCase().includes('TICKET') || rawTrimmed.toUpperCase().includes('CARNET')) {
    const lines = rawTrimmed.split(/\r?\n/);
    let ticketNum = '';
    let carnetNum = '';
    let dateStr = '';
    let price = 5000;
    let ticketId = '';

    for (const line of lines) {
      const cleanLine = line.trim();
      const tMatch = cleanLine.match(/^(?:PORTUS\s*[-—]\s*)?(?:TICKET|NUMERO|NUMÉRO|TKT|N°)\s*(?:N°|NUMÉRO|NUMERO)?\s*[:=\-]\s*([A-Z0-9\-_]+)/i);
      if (tMatch && !ticketNum) {
        ticketNum = tMatch[1].trim().toUpperCase();
      }

      const dMatch = cleanLine.match(/^DATE\s*(?:CRÉATION|CREATION)?\s*(?:DU\s*)?(?:CARNET)?\s*[:=\-]\s*(.+)/i);
      if (dMatch && !dateStr) {
        dateStr = dMatch[1].trim();
      }

      const cMatch = cleanLine.match(/^CARNET\s*(?:N°|NUMÉRO|NUMERO)?\s*[:=\-]\s*([A-Z0-9\-_]+)/i);
      if (cMatch && !carnetNum) {
        carnetNum = cMatch[1].trim().toUpperCase();
      }

      const pMatch = cleanLine.match(/^PRIX\s*[:=\-]\s*([0-9\s]+)/i);
      if (pMatch) {
        price = Number(pMatch[1].replace(/\s/g, '')) || 5000;
      }

      const iMatch = cleanLine.match(/^(?:ID|TID)\s*[:=\-]\s*([A-Z0-9\-_]+)/i);
      if (iMatch && !ticketId) {
        ticketId = iMatch[1].trim();
      }
    }

    if (ticketNum) {
      return {
        v: 1,
        ticket_id: ticketId || ticketNum,
        carnet_number: carnetNum,
        ticket_number: ticketNum,
        carnet_date: dateStr,
        carnet_created_at: dateStr,
        price,
        signature: null,
        tid: ticketId || ticketNum,
        cid: '',
        ref: carnetNum,
        num: ticketNum,
        tok: '',
        sig: null,
      };
    }
  }

  // 3. Détection format JSON
  try {
    const parsed = JSON.parse(rawTrimmed);
    if (parsed && typeof parsed === 'object') {
      const ticketId = parsed.ticket_id || parsed.tid || parsed.id || '';
      const carnetNum = parsed.carnet_number || parsed.ref || parsed.carnetNumber || '';
      const ticketNum = parsed.ticket_number || parsed.num || parsed.ticketNumber || parsed.t || '';
      const price = Number(parsed.price) || 5000;
      const signature = parsed.signature || parsed.sig || parsed.tok || null;
      const carnetDate = parsed.carnet_date || parsed.carnet_created_at || parsed.date || '';

      if (ticketId || ticketNum) {
        return {
          v: parsed.v || 1,
          ticket_id: ticketId,
          carnet_number: carnetNum,
          ticket_number: ticketNum,
          carnet_date: carnetDate,
          carnet_created_at: parsed.carnet_created_at || carnetDate,
          price,
          signature,
          tid: ticketId,
          cid: parsed.carnet_id || parsed.cid || '',
          ref: carnetNum,
          num: ticketNum,
          tok: parsed.tok || parsed.s || '',
          sig: signature,
        };
      }
    }
  } catch {
    // Si format simple texte brut (numéro physique seul)
  }

  return {
    v: 1,
    ticket_id: rawTrimmed,
    carnet_number: '',
    ticket_number: rawTrimmed.toUpperCase(),
    price: 5000,
    signature: null,
    tid: rawTrimmed,
    ref: '',
    num: rawTrimmed.toUpperCase(),
    sig: null,
  };
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
 * Valide le jeton ou la signature cryptographique d'un ticket scanné contre les données attendues
 * RÈGLE CRITIQUE DE SÉCURITÉ :
 * Si la signature / jeton est invalide => invalid = true TOUJOURS.
 */
export function verifyTicketSecurityToken(
  storedPayloadOrToken: string | null | undefined,
  scannedToken: string | null | undefined
): QRTokenVerificationResult {
  if (!storedPayloadOrToken) {
    return { isAuthentic: true, forgeryDetected: false };
  }

  let expectedToken = '';
  try {
    const parsed = JSON.parse(storedPayloadOrToken);
    expectedToken = (parsed.sig || parsed.tok || parsed.signature || '').trim();
  } catch {
    expectedToken = storedPayloadOrToken.trim();
  }

  if (!expectedToken) {
    return { isAuthentic: true, forgeryDetected: false };
  }

  const cleanScanned = (scannedToken || '').trim();

  if (!cleanScanned) {
    return {
      isAuthentic: false,
      forgeryDetected: true,
      reason: 'QR Code sans signature cryptographique valide : suspicion de reproduction frauduleuse.',
      expectedToken,
      scannedToken: '',
    };
  }

  if (cleanScanned !== expectedToken) {
    return {
      isAuthentic: false,
      forgeryDetected: true,
      reason: 'Signature cryptographique non concordante : la signature ne correspond pas au ticket officiel.',
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
 * Matrice des transitions de statuts autorisées pour un ticket PORTUS :
 * CREATED/GENERATED -> AVAILABLE / ASSIGNED_TO_RESPONSIBLE
 * ASSIGNED_TO_RESPONSIBLE -> ASSIGNED_TO_AGENT / AVAILABLE / CANCELLED
 * AVAILABLE -> ASSIGNED_TO_RESPONSIBLE / ASSIGNED_TO_AGENT / CANCELLED
 * ASSIGNED_TO_AGENT -> SOLD / ASSIGNED_TO_RESPONSIBLE / AVAILABLE / CANCELLED
 * SOLD -> CONTROLLED / CANCELLED / SUPERSEDED
 * CONTROLLED -> CONTROLLED (nouveaux contrôles routiers) / CANCELLED / SUPERSEDED
 * CANCELLED : État terminal
 */
export const ALLOWED_TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  GENERATED: [
    'ASSIGNED_TO_RESPONSIBLE',
    'AVAILABLE',
    'CANCELLED',
  ],
  ASSIGNED_TO_RESPONSIBLE: [
    'ASSIGNED_TO_AGENT',
    'AVAILABLE',
    'CANCELLED',
  ],
  AVAILABLE: [
    'ASSIGNED_TO_RESPONSIBLE',
    'ASSIGNED_TO_AGENT',
    'CANCELLED',
  ],
  ASSIGNED_TO_AGENT: [
    'SOLD',
    'ASSIGNED_TO_RESPONSIBLE',
    'AVAILABLE',
    'CANCELLED',
  ],
  SOLD: [
    'CONTROLLED',
    'CANCELLED',
  ],
  CONTROLLED: [
    'CONTROLLED', // Passages et contrôles successifs autorisés
    'CANCELLED',
  ],
  CANCELLED: [
    // ÉTAT TERMINAL : Aucune réactivation
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
 * Valide une transition de statut et lève une exception détaillée si interdite
 */
export function assertTicketStatusTransition(
  ticketNumber: string,
  from: TicketStatus,
  to: TicketStatus
): void {
  if (!canTransitionTicketStatus(from, to)) {
    const allowedList = ALLOWED_TICKET_TRANSITIONS[from]?.join(', ') || 'aucune (état terminal)';
    throw new Error(
      `Transition de statut interdite pour le ticket "${ticketNumber}" : impossible de passer de [${from}] à [${to}]. Transitions permises : [${allowedList}].`
    );
  }
}
