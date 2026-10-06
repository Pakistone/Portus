/**
 * Générateur PDF pour PORTUS — UJPAS
 * Union des Jeunes du Port pour l'Assistance et la Sécurité
 * 
 * RÈGLES MÉTIER & IMPRESSION :
 * 1. Format physique : A4 Paysage (297 x 210 mm)
 * 2. Disposition : 9 tickets par page (grille 3 colonnes x 3 lignes de 99 x 70 mm)
 * 3. Fond graphique officiel : /ticket_bg_ujpas_hd.jpg
 * 4. Surimpressions dynamiques :
 *    - Numéro de ticket séquentiel dans le cartouche bleu en haut à gauche (ex. : N° VRDCH-000001)
 *    - QR code dynamique scannable haute densité dans le cadre blanc sous la rosace à droite, avec le badge central "UJPAS"
 * 5. Mentions administratives conservées :
 *    - "SIGNATURE AGENT UJPAS"
 *    - "VALIDATION UJPAS"
 *    - Bandeau de contact inférieur UJPAS
 * 6. ⚠️ INTERDICTION STRICTE D'IMPRIMER DES PRIX OU MONTANTS SUR LES TICKETS (5 000 FCFA non imprimé)
 */

import QRCode from 'qrcode';
import type { Carnet, Ticket, TicketStatus, Remise } from '../types';
import { ORG_INFO } from '../config/constants';
import { formatFCFA, formatDate, formatDateTime } from './normalization';

let cachedBgDataUrl: string | null = null;

/**
 * Convertit de façon robuste toute source (URL ou Blob) en DataURL PNG pure via Canvas
 */
async function convertToPngDataUrl(source: string | Blob): Promise<string> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return resolve('');
    }

    const img = new Image();

    let objectUrl: string | null = null;
    if (typeof source !== 'string') {
      try {
        objectUrl = URL.createObjectURL(source);
        img.src = objectUrl;
      } catch {
        return resolve('');
      }
    } else {
      img.src = source;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve('');
    }, 3000);

    const cleanup = () => {
      clearTimeout(timer);
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
    };

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 2376;
        canvas.height = img.naturalHeight || 1680;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL('image/png');
          cleanup();
          return resolve(pngUrl);
        }
      } catch (err) {
        console.warn('Erreur rasterisation canvas vers PNG:', err);
      }
      cleanup();
      resolve('');
    };

    img.onerror = () => {
      cleanup();
      resolve('');
    };
  });
}

/**
 * Charge le fond graphique officiel UJPAS et garantit une DataURL PNG/JPEG pure et valide
 */
async function loadTicketBgImage(): Promise<string> {
  if (cachedBgDataUrl) {
    return cachedBgDataUrl;
  }

  const candidateUrls = [
    '/ticket_bg_ujpas_hd.jpg',
    '/ticket-ujpas-specimen.png',
    '/ticket_bg_ujpas_hd.png',
  ];

  for (const url of candidateUrls) {
    try {
      // 1. Essai Fetch direct avec timeout
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => controller?.abort(), 3000);
      const res = await fetch(url, { signal: controller ? controller.signal : undefined }).catch(() => null);
      clearTimeout(timer);

      if (res && res.ok) {
        const blob = await res.blob().catch(() => null);
        if (blob && blob.size > 0) {
          // Lecture directe ultra-rapide et fiable via FileReader
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const resUrl = typeof reader.result === 'string' ? reader.result : '';
              resolve(resUrl);
            };
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
          });

          if (dataUrl && (dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/jpeg'))) {
            cachedBgDataUrl = dataUrl;
            return dataUrl;
          }

          // Pour tout format vectoriel SVG, conversion Canvas vers PNG pur
          const rasterPng = await convertToPngDataUrl(blob);
          if (rasterPng && rasterPng.startsWith('data:image/png')) {
            cachedBgDataUrl = rasterPng;
            return rasterPng;
          }
        }
      }

      // 2. Repli HTML Image si fetch a échoué
      const imagePng = await convertToPngDataUrl(url);
      if (imagePng && imagePng.startsWith('data:image/png')) {
        cachedBgDataUrl = imagePng;
        return imagePng;
      }
    } catch (e) {
      console.warn(`Échec du chargement du fond candidat ${url}:`, e);
    }
  }

  return '';
}

/**
 * Génère un QR Code scannable dynamique haute résolution avec le badge central orange "UJPAS"
 * Dessiné directement et de façon synchrone sur Canvas pour une vitesse instantanée
 */
async function generateQrWithBadge(payload: string): Promise<string> {
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 180;
      canvas.height = 180;

      await QRCode.toCanvas(canvas, payload, {
        width: 180,
        margin: 1,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#0D4A36',
          light: '#FFFFFF',
        },
      });

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const s = canvas.width;
        const badgeSize = s * 0.28;
        const bx = (s - badgeSize) / 2;
        const by = (s - badgeSize) / 2;

        // Contour de dégagement blanc
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(bx - 2, by - 2, badgeSize + 4, badgeSize + 4);

        // Badge officiel orange UJPAS (#EA580C)
        ctx.fillStyle = '#EA580C';
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(bx, by, badgeSize, badgeSize, 4);
          ctx.fill();
        } else {
          ctx.fillRect(bx, by, badgeSize, badgeSize);
        }

        // Mention textuelle "UJPAS"
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('UJPAS', s / 2, s / 2 + 1);
      }

      return canvas.toDataURL('image/png');
    }

    return await QRCode.toDataURL(payload, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0D4A36',
        light: '#FFFFFF',
      },
    });
  } catch (err) {
    console.warn('Erreur génération QR directe canvas, repli toDataURL:', err);
    try {
      return await QRCode.toDataURL(payload);
    } catch {
      return '';
    }
  }
}

/**
 * Lance l'impression d'un document PDF dans le navigateur via une iframe isolée
 */
export function printPdfDocument(blobUrl: string): boolean {
  if (typeof document === 'undefined' || !blobUrl) return false;

  try {
    const iframeId = 'portus-pdf-print-frame';
    let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }

    iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0.01';
    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    const triggerPrint = () => {
      try {
        iframe?.contentWindow?.focus();
        iframe?.contentWindow?.print();
      } catch (err) {
        console.warn('[PORTUS Print] Échec impression iframe:', err);
      }
    };

    iframe.onload = () => {
      setTimeout(triggerPrint, 300);
    };

    setTimeout(() => {
      if (iframe && document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 60000);

    return true;
  } catch (err) {
    console.warn('[PORTUS Print] Erreur iframe print:', err);
    return false;
  }
}

/**
 * Déclenche le téléchargement du PDF de manière garantie et retourne l'URL Blob du document
 * 1. Extraction directe du Blob PDF de jsPDF
 * 2. Création dynamique de balise <a> dans le DOM pour téléchargement
 * 3. Déclenchement manuel du clic
 */
export function downloadPdfDoc(doc: any, filename: string): string {
  let finalBlobUrl = '';

  // 1. Extraction directe du Blob
  try {
    const blob = doc.output('blob');
    if (blob && blob.size > 0) {
      finalBlobUrl = URL.createObjectURL(blob);
    }
  } catch (blobErr) {
    console.warn('doc.output("blob") a échoué:', blobErr);
  }

  // Repli doc.output('bloburl')
  if (!finalBlobUrl) {
    try {
      const rawBlobUrl = doc.output('bloburl');
      if (typeof rawBlobUrl === 'string' && rawBlobUrl.startsWith('blob:')) {
        finalBlobUrl = rawBlobUrl;
      }
    } catch (blobUrlErr) {
      console.warn('doc.output("bloburl") a échoué:', blobUrlErr);
    }
  }

  if (typeof document === 'undefined' || !finalBlobUrl) {
    return finalBlobUrl;
  }

  // 2. Déclenchement propre du téléchargement sans déclencheur en double
  try {
    const link = document.createElement('a');
    link.href = finalBlobUrl;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    link.style.position = 'fixed';
    link.style.top = '-9999px';
    link.style.left = '-9999px';
    link.style.width = '1px';
    link.style.height = '1px';
    link.style.opacity = '0.01';
    document.body.appendChild(link);

    try {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    } catch {
      link.click();
    }

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 2000);
  } catch (clickErr) {
    console.warn('Erreur lors du clic automatique sur le lien:', clickErr);
  }

  return finalBlobUrl;
}

/**
 * Génère le PDF d'impression officiel d'un carnet UJPAS (9 tickets par feuille A4 Paysage)
 * Format : 297 x 210 mm (3 colonnes x 3 lignes = 99 x 70 mm par cellule)
 * Optimisé : ticket 98 x 55.18 mm (largeur maximale, ratio 16:9 préservé, 100% rendu image)
 */
export async function generateCarnetPrintPDF(
  carnet: Carnet,
  tickets: Ticket[],
  onProgress?: (progress: number, total: number) => void
): Promise<string> {
  // 0. Assurer la présence des tickets (auto-reconstruction si la liste reçue est vide)
  let effectiveTickets = tickets && tickets.length > 0 ? tickets : [];
  if (effectiveTickets.length === 0) {
    const size = carnet.size || (carnet.endNumber && carnet.startNumber ? carnet.endNumber - carnet.startNumber + 1 : 9);
    const start = carnet.startNumber || 1;
    const prefix = carnet.seriesPrefix || 'VRDCH';
    effectiveTickets = Array.from({ length: size }, (_, i) => {
      const num = start + i;
      const tNum = `${prefix}-${String(num).padStart(6, '0')}`;
      return {
        id: `gen-${carnet.id}-${num}`,
        carnetId: carnet.id,
        carnetNumber: carnet.carnetNumber,
        ticketNumber: tNum,
        physicalNumber: num,
        price: 5000,
        controlCount: 0,
        status: 'AVAILABLE' as TicketStatus,
        createdAt: carnet.createdAt || new Date().toISOString(),
        qrPayload: tNum,
      };
    });
  }

  // Chargement asynchrone de jsPDF et du fond officiel PNG
  const [{ jsPDF }, bgDataUrl] = await Promise.all([
    import('jspdf'),
    loadTicketBgImage(),
  ]);

  // Document A4 Paysage
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const cols = 3;
  const ticketsPerPage = 9;
  const totalTickets = effectiveTickets.length;
  const totalPages = Math.ceil(totalTickets / ticketsPerPage);

  // 1. Pré-génération optimisée par lots des QR codes haute densité avec badge orange UJPAS
  const qrCodes: string[] = new Array(totalTickets);
  const batchSize = 18;

  for (let i = 0; i < totalTickets; i += batchSize) {
    const end = Math.min(i + batchSize, totalTickets);
    const batch = effectiveTickets.slice(i, end);

    const rendered = await Promise.all(
      batch.map((t) => generateQrWithBadge(t.qrPayload || t.ticketNumber))
    );

    for (let j = 0; j < rendered.length; j++) {
      qrCodes[i + j] = rendered[j];
    }

    if (onProgress) {
      onProgress(Math.min(end, totalTickets), totalTickets);
    }
  }

  // 2. Assemblage des pages A4 Paysage
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage('a4', 'landscape');
    }

    const startIndex = pageIdx * ticketsPerPage;
    const pageTickets = effectiveTickets.slice(startIndex, startIndex + ticketsPerPage);

    const cellW = 99.0;
    const cellH = 70.0;
    const ticketW = 97.0; // Marge de coupe de 1.0 mm de chaque côté
    const ticketH = 67.0; // Marge de coupe de 1.5 mm en haut/bas
    const padX = (cellW - ticketW) / 2; // 1.0 mm
    const padY = (cellH - ticketH) / 2; // 1.5 mm

    pageTickets.forEach((ticket, idx) => {
      const globalIdx = startIndex + idx;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = col * cellW;
      const cy = row * cellH;
      const tx = cx + padX;
      const ty = cy + padY;

      // 1. Image officielle 100% brute (aucune altération vectorielle)
      if (bgDataUrl) {
        const imgFmt = bgDataUrl.includes('image/jpeg') || bgDataUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
        doc.addImage(bgDataUrl, imgFmt, tx, ty, ticketW, ticketH, 'TICKET_UJPAS', 'FAST');
      }

      // 2. Ligne de coupe en pointillés autour de la cellule 99x70 mm
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([2, 2], 0);
      doc.rect(cx, cy, cellW, cellH);
      doc.setLineDashPattern([], 0);

      // 3. Numéro de ticket dynamique dans la boîte bleue (ratios précis de l'image de fond officielle 1000 x 563)
      const patchX = tx + ticketW * 0.075;
      const patchY = ty + ticketH * 0.2948;
      const patchW = ticketW * 0.175;
      const patchH = ticketH * 0.0639;
      
      // Couleur de fond et de texte harmonisées avec la charte graphique officielle UJPAS
      doc.setFillColor(224, 242, 254);
      doc.roundedRect(patchX, patchY, patchW, patchH, 0.6, 0.6, 'F');
      doc.setTextColor(3, 105, 161);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.0);
      
      // Alignement centré parfait pour s'adapter dynamiquement à toutes les longueurs de préfixe
      doc.text(`N° ${ticket.ticketNumber}`, patchX + patchW / 2, patchY + patchH * 0.68, { align: 'center' });

      // 4. QR Code dynamique scannable dans la case (ratios précis de l'image de fond officielle 1000 x 563)
      const qrX = tx + ticketW * 0.770;
      const qrY = ty + ticketH * 0.595;
      const qrW = ticketW * 0.135;
      const qrH = ticketH * 0.231;

      // Masquage blanc de propreté étiré pour correspondre exactement à l'espace de la case
      doc.setFillColor(255, 255, 255);
      doc.rect(qrX, qrY, qrW, qrH, 'F');

      const qrData = qrCodes[globalIdx];
      if (qrData) {
        doc.addImage(qrData, 'PNG', qrX, qrY, qrW, qrH, undefined, 'FAST');
      }
    });
  }

  // Nom de fichier officiel demandé :
  // PORTUS_UJPAS_CARNET_${carnet.carnetNumber}_${totalTickets}TICKETS.pdf
  return downloadPdfDoc(doc, `PORTUS_UJPAS_CARNET_${carnet.carnetNumber}_${totalTickets}TICKETS.pdf`);
}

/**
 * Génère le reçu officiel d'une Remise Financière (A5 Portrait)
 */
export async function generateRemiseReceiptPDF(remise: Remise): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
    compress: true,
  });

  const pw = 148;

  // En-tête
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(ORG_INFO.FULL_ORG_NAME, pw / 2, 10, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(16, 185, 129);
  doc.text(`PORTUS — REÇU OFFICIEL DE REMISE FINANCIÈRE`, pw / 2, 16, { align: 'center' });

  doc.setTextColor(203, 213, 225);
  doc.setFontSize(7);
  doc.text(`${ORG_INFO.COMMUNE} — ${ORG_INFO.COUNTRY}`, pw / 2, 22, { align: 'center' });

  // Référence
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`RÉFÉRENCE : ${remise.reference}`, 14, 40);

  // Cadre montant
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.8);
  doc.roundedRect(14, 46, pw - 28, 22, 3, 3, 'FD');

  doc.setTextColor(22, 101, 52);
  doc.setFontSize(9);
  doc.text('MONTANT VERSÉ', pw / 2, 53, { align: 'center' });

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(formatFCFA(remise.amount), pw / 2, 63, { align: 'center' });

  // Détails
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  let curY = 78;
  const lineGap = 7;

  const addRow = (label: string, val: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 14, curY);
    doc.setFont('helvetica', 'normal');
    doc.text(val, 70, curY);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, curY + 2, pw - 14, curY + 2);
    curY += lineGap;
  };

  addRow('Date et heure :', `${formatDate(remise.date)} à ${remise.time}`);
  addRow('Agent concerné :', remise.agentName);
  addRow('Responsable receveur :', remise.responsableName);
  addRow('Secteur de versement :', remise.sectorName);
  addRow('Tickets couverts :', `${remise.ticketsCount} tickets (à 5 000 FCFA/unité)`);

  if (remise.note) {
    addRow('Observation :', remise.note);
  }

  // Signatures
  curY += 15;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Signature de l’Agent :', 20, curY);
  doc.text('Signature du Responsable :', pw - 70, curY);

  doc.setDrawColor(148, 163, 184);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(18, curY + 4, 45, 20);
  doc.rect(pw - 72, curY + 4, 45, 20);

  // Bas de page
  doc.setLineDashPattern([], 0);
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Reçu généré par le système PORTUS le ${formatDateTime(new Date().toISOString())} — Traçabilité garantie`,
    pw / 2,
    200,
    { align: 'center' }
  );

  downloadPdfDoc(doc, `REMISE_${remise.reference}.pdf`);
}
