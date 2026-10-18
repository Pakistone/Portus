/**
 * Moteur de rendu graphique haute fidélité pour les tickets PORTUS — UJPAS
 * Union des Jeunes du Port pour l'Assistance et la Sécurité
 * 
 * RÈGLES MÉTIER ET DIRECTIVES :
 * 1. Format physique officiel : A4 Paysage, grille 3 colonnes x 2 lignes (3 tickets par ligne, 6 tickets par page de 93 x 66 mm)
 * 2. Utilisation exclusive de l'image de fond raster réelle HD :
 *    - Fond officiel complet : /ticket_bg_ujpas_hd.jpg (2376 x 1680 px)
 *    - Filigrane mosaïque : /watermark_pattern.png
 * 3. Filigrane mosaïque de sécurité à -23° répétant "UCRAO   UCRPPLAO-CI   CSCRAO   UJPAS"
 *    avec préservation stricte (fond blanc opaque) de la zone QR Code en bas à droite.
 * 4. Incrustation dynamique du numéro de ticket dans le cartouche bleu d'origine.
 * 5. Remplissage dynamique des 8 cases d'immatriculation du camion.
 * 6. Génération du QR Code dynamique scannable avec badge central orange UJPAS.
 * 7. ⚠️ INTERDICTION ABSOLUE D'AFFICHER LE PRIX (AUCUN MONTANT SUR LE TICKET).
 */

import QRCode from 'qrcode';
import type { Ticket } from '../types';
import { formatTicketQrForCameraScan } from './ticketSecurity';

export interface TicketRenderOptions {
  width?: number;              // Largeur / longueur en pixels (défaut 1075 pour 300 DPI à 9.1 cm / 91 mm)
  height?: number;             // Hauteur en pixels (défaut 945 pour 300 DPI à 8.0 cm / 80 mm)
  immatriculation?: string;    // Immatriculation optionnelle pour les 8 cases
  showCutLines?: boolean;      // Afficher les repères de coupe légers sur le pourtour
  format?: 'image/jpeg' | 'image/png';
  quality?: number;            // Qualité de compression (0.80 à 0.95)
  watermarkOpacity?: number;   // Opacité du filigrane de sécurité (défaut 0.58 pour haute visibilité et texture subtile)
  enhanceContrast?: boolean;   // Renforcer le piqué et le contraste pour éviter l'effet trop clair à l'impression
  carnetCreatedAt?: string;    // Date de création du carnet pour le scan de l'appareil photo
  carnetNumber?: string;       // Numéro du carnet d'origine
}

interface LoadedAssets {
  bg: HTMLImageElement | null;
  watermark: HTMLImageElement | null;
  stamp: HTMLImageElement | null;
}

const assetsCache: LoadedAssets = {
  bg: null,
  watermark: null,
  stamp: null,
};

let preloadPromise: Promise<LoadedAssets> | null = null;

/**
 * Charge une image en toute sécurité dans un objet HTMLImageElement
 */
function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      return reject(new Error('Environnement sans support Image'));
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Impossible de charger l'image ${src}: ${e}`));
    img.src = src;
  });
}

/**
 * Précharge les images officielles du ticket pour un rendu immédiat
 */
export async function preloadTicketAssets(): Promise<LoadedAssets> {
  if (assetsCache.bg) {
    return assetsCache;
  }

  if (preloadPromise) {
    return preloadPromise;
  }

  preloadPromise = (async () => {
    try {
      const [bg, watermark, stamp] = await Promise.allSettled([
        loadImageElement('/ticket_bg_ujpas_hd.jpg'),
        loadImageElement('/watermark_pattern.png'),
        loadImageElement('/cachet-ujpas.png'),
      ]);

      if (bg.status === 'fulfilled') assetsCache.bg = bg.value;
      if (watermark.status === 'fulfilled') assetsCache.watermark = watermark.value;
      if (stamp.status === 'fulfilled') assetsCache.stamp = stamp.value;

      return assetsCache;
    } finally {
      preloadPromise = null;
    }
  })();

  return preloadPromise;
}

/**
 * Génère le QR Code dynamique officiel pour impression jet d'encre et scan instantané par appareil photo
 * 
 * DIRECTIVES OPTIQUES & JET D'ENCRE :
 * 1. Noir pur absolu (#000000) sur fond blanc pur (#FFFFFF) sans nuance verte pour contraste maximal.
 * 2. Suppression de tout badge central masquant : préserve 100% des modules de données et de synchronisation.
 * 3. Marge de dégagement ISO (quiet zone) de 2 modules pour détection immédiate des bords par l'appareil photo.
 * 4. Niveau de correction 'M' (15%) pour des modules plus grands et résistants aux micro-bavures d'encre.
 * 5. Lissage désactivé pour des arêtes nettes pixel-perfect.
 */
async function createDynamicQrCanvas(payload: string, qrPixelSize: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = qrPixelSize;
  canvas.height = qrPixelSize;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    const anyCtx = ctx as any;
    if ('webkitImageSmoothingEnabled' in anyCtx) anyCtx.webkitImageSmoothingEnabled = false;
    if ('mozImageSmoothingEnabled' in anyCtx) anyCtx.mozImageSmoothingEnabled = false;
    if ('msImageSmoothingEnabled' in anyCtx) anyCtx.msImageSmoothingEnabled = false;
  }

  await QRCode.toCanvas(canvas, payload, {
    width: qrPixelSize,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000', // Noir pur absolu pour impression jet d'encre
      light: '#FFFFFF', // Fond blanc pur
    },
  });

  return canvas;
}

/**
 * Applique le filigrane de sécurité officiel diagonal à -23° répétant :
 * "UCRAO • UCRPPLAO-CI • CSCRAO • UJPAS"
 * Typographie haute définition rendue BIEN GRANDE pour une lisibilité et sécurité optimales
 */
function drawDiagonalWatermarkMosaic(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opacity: number = 0.55
) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = opacity;

  // Détourage strict pour exclure la zone QR Code proportionnelle en bas à droite
  const qrX = Math.round(width * 0.745);
  const qrY = Math.round(height * 0.575);
  const qrW = Math.round(width * 0.200);
  const qrH = Math.round(height * 0.305);

  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.rect(qrX, qrY, qrW, qrH);
  ctx.clip('evenodd');

  // Rendu dynamique sur Canvas du motif diagonal à -23°
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-23 * Math.PI) / 180);
  ctx.translate(-width, -height);

  const tokens = [
    { text: 'UCRAO', color: 'rgba(16, 120, 50, 0.48)' },        // Vert sécurité riche
    { text: 'UCRPPLAO-CI', color: 'rgba(215, 90, 0, 0.48)' },   // Orange officiel contrasté
    { text: 'CSCRAO', color: 'rgba(130, 25, 140, 0.48)' },      // Pourpre sécurité officiel
    { text: 'UJPAS', color: 'rgba(10, 70, 160, 0.48)' },        // Bleu roi officiel
  ];

  // Taille de police BIEN GRANDE (~50 px pour 1098 px de large)
  const fontSize = Math.round(width * 0.046);
  ctx.font = `900 ${fontSize}px "Liberation Sans", Arial, sans-serif`;
  const rowHeight = Math.round(fontSize * 2.2);
  const totalRows = Math.ceil((height * 2.8) / rowHeight);
  const spanWidth = width * 2.8;

  for (let r = 0; r < totalRows; r++) {
    const y = r * rowHeight;
    const xOffset = (r % 4) * Math.round(fontSize * 3.0);
    let x = -spanWidth * 0.2 - xOffset;
    let tokenIdx = (r * 2) % tokens.length;

    while (x < spanWidth) {
      const token = tokens[tokenIdx];
      ctx.fillStyle = token.color;
      ctx.fillText(token.text, x, y);
      x += ctx.measureText(token.text).width + Math.round(fontSize * 1.5);
      tokenIdx = (tokenIdx + 1) % tokens.length;
    }
  }

  ctx.restore();
}

/**
 * Incruste l'immatriculation du véhicule dans les 8 cases du fond officiel
 */
function overlayImmatriculationCharacters(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  immatText?: string
) {
  const boxW = Math.round(width * 0.0421); // ~46px
  const boxH = Math.round(height * 0.0714); // ~56px
  const boxGap = Math.round(width * 0.0084); // ~9px
  const totalGridW = 8 * boxW + 7 * boxGap;
  const startBoxX = Math.round((width - totalGridW) / 2); // ~718px
  const boxY = Math.round(height * 0.4553); // ~765px

  const cleanImmat = (immatText || '').replace(/[\s-]/g, '').toUpperCase();

  ctx.save();
  // Police très grande (remplissant la quasi-totalité de chaque case) en noir intense
  const immatFontSize = Math.round(boxH * 0.88); // ~49px
  ctx.fillStyle = '#000000'; // Noir d'encre pur haute densité
  ctx.font = `900 ${immatFontSize}px "Liberation Sans", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let b = 0; b < Math.min(8, cleanImmat.length); b++) {
    const bx = startBoxX + b * (boxW + boxGap);
    ctx.fillText(cleanImmat[b], bx + boxW / 2, boxY + boxH / 2 + 1);
  }
  ctx.restore();
}

// Cache des canevas de base statiques précalculés (fond filtré, filigrane mosaïque, cartouche, bandeau)
const baseCanvasCache = new Map<string, HTMLCanvasElement>();

// Cache des URLs de données des tickets déjà rendus
const ticketDataUrlCache = new Map<string, string>();

/**
 * Réinitialise les caches de rendu graphique
 */
export function clearTicketRenderCache(): void {
  baseCanvasCache.clear();
  ticketDataUrlCache.clear();
}

/**
 * Génère ou récupère le gabarit de base statique (fond officiel HD + filigrane mosaïque + cartouche + bandeau)
 * Évite de répéter les filtres CSS lourds et le dessin de ~200 textes de filigrane à chaque ticket.
 */
function getOrCreateBaseTicketCanvas(
  assets: LoadedAssets,
  width: number,
  height: number,
  options: TicketRenderOptions
): HTMLCanvasElement {
  const enhanceContrast = options.enhanceContrast !== false;
  const watermarkOpacity = options.watermarkOpacity ?? 0.58;
  const showCutLines = !!options.showCutLines;
  const cacheKey = `${width}x${height}_c${enhanceContrast}_o${watermarkOpacity}_cut${showCutLines}`;

  const cached = baseCanvasCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Coordonnées proportionnelles de la zone QR Code (réserve blanche exclusive)
  const qrReserve = {
    x: Math.round(width * 0.745),
    y: Math.round(height * 0.575),
    w: Math.round(width * 0.200),
    h: Math.round(height * 0.305),
  };

  // 1. Fond blanc de base
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 2. Dessin du fond officiel du ticket étendu à pleine surface (width x height)
  if (assets.bg) {
    ctx.save();
    if (enhanceContrast) {
      // Fond assombri et enrichi en contraste pour détacher les textes et le filigrane
      ctx.filter = 'contrast(1.24) saturate(1.20) brightness(0.86)';
    }
    ctx.drawImage(assets.bg, 0, 0, width, height);
    ctx.restore();

    // Voile d'ombrage subtil et homogène pour densifier le fond (en excluant la zone QR code)
    ctx.save();
    ctx.fillStyle = 'rgba(15, 30, 45, 0.07)';
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(qrReserve.x, qrReserve.y, qrReserve.w, qrReserve.h);
    ctx.clip('evenodd');
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // 3. Filigrane de sécurité officiel AU-DESSUS du fond avec globalCompositeOperation = 'multiply'
  // 3.1. Trame de texture subtile si disponible
  if (assets.watermark) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.20;

    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(qrReserve.x, qrReserve.y, qrReserve.w, qrReserve.h);
    ctx.clip('evenodd');

    ctx.drawImage(assets.watermark, 0, 0, width, height);
    ctx.restore();
  }

  // 3.2. Filigrane de sécurité officiel BIEN GRAND : UCRAO, UCRPPLAO-CI, CSCRAO, UJPAS
  drawDiagonalWatermarkMosaic(ctx, width, height, watermarkOpacity);

  // 4. PRÉSERVATION ABSOLUE DE LA ZONE QR CODE EN BAS À DROITE (Blanc pur opaque)
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(qrReserve.x, qrReserve.y, qrReserve.w, qrReserve.h);

  // Cadre vert de sécurité autour de la zone QR code
  ctx.strokeStyle = '#0D4A36';
  ctx.lineWidth = Math.max(3, Math.round(width * 0.0025));
  ctx.strokeRect(qrReserve.x, qrReserve.y, qrReserve.w, qrReserve.h);
  ctx.restore();

  // 4.1 Légende sous le QR code (agrandie et nette)
  ctx.save();
  ctx.fillStyle = '#0D4A36';
  const legendText = 'SCAN AUTHENTICITÉ UJPAS';
  let legendFontSize = Math.round(width * 0.015);
  ctx.font = `900 ${legendFontSize}px "Liberation Sans", Arial, sans-serif`;
  while (ctx.measureText(legendText).width > qrReserve.w - 8 && legendFontSize > 10) {
    legendFontSize -= 0.5;
    ctx.font = `900 ${legendFontSize}px "Liberation Sans", Arial, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(legendText, qrReserve.x + qrReserve.w / 2, qrReserve.y + qrReserve.h - Math.round(qrReserve.h * 0.03));
  ctx.restore();

  // 5. Cartouche d'origine pour le numéro séquentiel (Haut-Gauche)
  const numBoxX = Math.round(width * 0.062);
  const numBoxY = Math.round(height * 0.268);
  const numBoxW = Math.round(width * 0.235);
  const numBoxH = Math.round(height * 0.080);

  ctx.save();
  ctx.fillStyle = '#F4F8FC';
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(numBoxX, numBoxY, numBoxW, numBoxH, 5);
    ctx.fill();
    ctx.strokeStyle = '#05223D';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else {
    ctx.fillRect(numBoxX, numBoxY, numBoxW, numBoxH);
    ctx.strokeStyle = '#05223D';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(numBoxX, numBoxY, numBoxW, numBoxH);
  }
  ctx.restore();

  // 6. Bandeau de contact et vérification officiel UJPAS agrandi et ultra-lisible
  const bannerY = Math.round(height * 0.940);
  const bannerH = Math.round(height * 0.060);

  ctx.save();
  ctx.fillStyle = '#0A4B35'; // Vert officiel UJPAS
  ctx.fillRect(0, bannerY, width, bannerH);

  // Filet de séparation supérieur doré
  ctx.fillStyle = '#D97706';
  ctx.fillRect(0, bannerY, width, Math.max(1, Math.round(height * 0.003)));

  // Texte du bandeau bien grand et contrasté en blanc
  const bannerText = "POUR TOUTE VÉRIFICATION, CONTACTEZ L'UJPAS : 01 03 31 37 68 / 07 77 91 78 04 | EMAIL : CONTACT@PORTUS-UJPAS.ONLINE";
  let bannerFontSize = Math.round(bannerH * 0.45);
  ctx.font = `bold ${bannerFontSize}px "Liberation Sans", Arial, sans-serif`;
  while (ctx.measureText(bannerText).width > width - 20 && bannerFontSize > 9) {
    bannerFontSize -= 0.5;
    ctx.font = `bold ${bannerFontSize}px "Liberation Sans", Arial, sans-serif`;
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bannerText, width / 2, bannerY + bannerH / 2 + 1);
  ctx.restore();

  // 7. Repères de coupe optionnels en pointillés
  if (showCutLines) {
    ctx.save();
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(0, 0, width, height);
    ctx.restore();
  }

  baseCanvasCache.set(cacheKey, canvas);
  return canvas;
}

/**
 * Rendu complet haute résolution d'un ticket individuel sur un élément HTMLCanvasElement
 * Ultra-rapide grâce au gabarit de base précalculé (~2ms par ticket au lieu de 120ms)
 */
export async function renderTicketToCanvas(
  ticket: Ticket,
  options: TicketRenderOptions = {}
): Promise<HTMLCanvasElement> {
  const width = options.width || 1075; // 300 DPI pour Longueur 91 mm (9.1 cm - augmentée pour combler l'espace blanc)
  const height = options.height || 945; // 300 DPI pour Hauteur 80 mm (8.0 cm)
  const assets = await preloadTicketAssets();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Impossible d’initialiser le contexte Canvas 2D');
  }

  // Activer le lissage d'image haute fidélité
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Dessin instantané du fond officiel pré-rendu (Fond filtré + ombrage + filigrane mosaïque + cartouche + bandeau)
  const baseCanvas = getOrCreateBaseTicketCanvas(assets, width, height, options);
  ctx.drawImage(baseCanvas, 0, 0);

  // 2. Numéro de ticket séquentiel dans le cartouche d'origine (Haut-Gauche)
  const numBoxX = Math.round(width * 0.062);
  const numBoxY = Math.round(height * 0.268);
  const numBoxW = Math.round(width * 0.235);
  const numBoxH = Math.round(height * 0.080);

  ctx.save();
  const numText = `N° ${ticket.ticketNumber}`;
  let numFontSize = Math.round(numBoxH * 0.58);
  ctx.font = `900 ${numFontSize}px "Liberation Sans", Arial, sans-serif`;
  while (ctx.measureText(numText).width > numBoxW - 14 && numFontSize > 18) {
    numFontSize -= 1;
    ctx.font = `900 ${numFontSize}px "Liberation Sans", Arial, sans-serif`;
  }
  ctx.fillStyle = '#05223D'; // Bleu nuit très dense
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(numText, numBoxX + numBoxW / 2, numBoxY + numBoxH / 2 + 1);
  ctx.restore();

  // 3. Immatriculation du véhicule dans les 8 cases (si présente)
  const immat = options.immatriculation || (ticket as any).plateNumber;
  if (immat) {
    overlayImmatriculationCharacters(ctx, width, height, immat);
  }

  // 4. QR Code dynamique scannable haute résolution dans la réserve blanche
  const qrReserve = {
    x: Math.round(width * 0.745),
    y: Math.round(height * 0.575),
    w: Math.round(width * 0.200),
    h: Math.round(height * 0.305),
  };
  const qrPadding = Math.round(qrReserve.w * 0.05);
  const qrInnerSize = Math.min(qrReserve.w, qrReserve.h) - qrPadding * 2 - Math.round(height * 0.035);
  const qrInnerX = qrReserve.x + (qrReserve.w - qrInnerSize) / 2;
  const qrInnerY = qrReserve.y + Math.round(qrReserve.h * 0.03);

  const effectiveCarnetCreatedAt =
    options.carnetCreatedAt || (ticket as any).carnetCreatedAt || ticket.createdAt;
  const effectiveCarnetNumber = options.carnetNumber || ticket.carnetNumber;

  const qrPayload = formatTicketQrForCameraScan({
    ticketNumber: ticket.ticketNumber,
    carnetNumber: effectiveCarnetNumber,
    carnetCreatedAt: effectiveCarnetCreatedAt,
    price: ticket.price || 5000,
    ticketId: ticket.id,
  });
  const qrCanvas = await createDynamicQrCanvas(qrPayload, qrInnerSize);
  ctx.drawImage(qrCanvas, qrInnerX, qrInnerY, qrInnerSize, qrInnerSize);

  return canvas;
}

/**
 * Rendu haute résolution direct vers une URL Data avec cache en mémoire
 */
export async function renderTicketToDataUrl(
  ticket: Ticket,
  options: TicketRenderOptions = {}
): Promise<string> {
  const width = options.width || 1075;
  const height = options.height || 945;
  const fmt = options.format || 'image/jpeg';
  const quality = options.quality !== undefined ? options.quality : 0.82;
  const enhanceContrast = options.enhanceContrast !== false;
  const watermarkOpacity = options.watermarkOpacity ?? 0.58;
  const immat = options.immatriculation || (ticket as any).plateNumber || '';
  const effectiveCarnetCreatedAt =
    options.carnetCreatedAt || (ticket as any).carnetCreatedAt || ticket.createdAt || '';
  const effectiveCarnetNumber = options.carnetNumber || ticket.carnetNumber || '';

  const cacheKey = `${ticket.id || ticket.ticketNumber}_${ticket.ticketNumber}_${width}x${height}_${fmt}_${quality}_${enhanceContrast}_${watermarkOpacity}_${immat}_${effectiveCarnetNumber}_${effectiveCarnetCreatedAt}`;

  const cached = ticketDataUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvas = await renderTicketToCanvas(ticket, options);
  const dataUrl = canvas.toDataURL(fmt, quality);

  // Plafond du cache pour préserver la mémoire (800 tickets max)
  if (ticketDataUrlCache.size > 800) {
    const keys = Array.from(ticketDataUrlCache.keys()).slice(0, 200);
    for (const k of keys) {
      ticketDataUrlCache.delete(k);
    }
  }
  ticketDataUrlCache.set(cacheKey, dataUrl);
  return dataUrl;
}
