/**
 * Générateur PDF pour PORTUS — U.J.S.R.V.
 * 
 * RÈGLES MÉTIER :
 * 1. Format physique : A4 Paysage (297 x 210 mm)
 * 2. Disposition : 9 tickets par page (grille 3 colonnes x 3 lignes)
 * 3. Zones obligatoires sur chaque ticket physique :
 *    - Image du logo / cachet officiel U.J.S.R.V. (/logoss.jpg ou /cachet-ujsrv.png)
 *    - Numéro de ticket (clairement visible)
 *    - QR Code unique haute définition (20 x 20 mm)
 *    - Immatriculation (zone vierge avec ligne pointillée)
 *    - Date manuscrite (____ / ____ / 2026)
 *    - Signature de l'agent & Cachet officiel avec image intégrée (16x16 mm)
 *    - Contacts officiels U.J.S.R.V.
 * 4. ⚠️ INTERDICTION STRICTE D'IMPRIMER DES PRIX OU MONTANTS
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { Carnet, Ticket, Remise } from '../types';
import { ORG_INFO } from '../config/constants';
import { formatFCFA, formatDate, formatDateTime } from './normalization';

/**
 * Génère un Data URL PNG de secours pour le cachet officiel U.J.S.R.V. si l'image externe n'est pas chargée
 */
function getFallbackStampDataUrl(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Fond blanc
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 400, 400);

    // Cercle extérieur vert émeraude
    ctx.strokeStyle = '#0F4C3A';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(200, 200, 180, 0, Math.PI * 2);
    ctx.stroke();

    // Cercle intérieur
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(200, 200, 162, 0, Math.PI * 2);
    ctx.stroke();

    // Texte supérieur
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 18px Helvetica';
    ctx.textAlign = 'center';
    ctx.fillText('U.J.S.R.V. — SÉCURITÉ ROUTIÈRE', 200, 75);

    // Camion stylisé au centre
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(130, 160, 90, 60);
    ctx.fillStyle = '#0F4C3A';
    ctx.fillRect(220, 175, 50, 45);
    ctx.beginPath();
    ctx.arc(160, 230, 16, 0, Math.PI * 2);
    ctx.arc(240, 230, 16, 0, Math.PI * 2);
    ctx.fill();

    // Texte central
    ctx.font = 'bold 22px Helvetica';
    ctx.fillStyle = '#0F4C3A';
    ctx.fillText('SURVEILLANCE CAMION', 200, 285);

    // Texte inférieur
    ctx.font = 'bold 14px Helvetica';
    ctx.fillStyle = '#64748B';
    ctx.fillText('ZONE PORTUAIRE VRIDI', 200, 335);

    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

/**
 * Charge l'image de manière fiable en Base64 via Canvas
 */
const loadImageDataUrl = (url: string): Promise<string> => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 400;
      canvas.height = img.naturalHeight || img.height || 400;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Canvas context failed'));
      }
    } catch (err) {
      reject(err);
    }
  };
  img.onerror = reject;
  img.src = url;
});

async function loadStampImage(): Promise<string> {
  try {
    return await loadImageDataUrl('/logoss.jpg');
  } catch {
    try {
      return await loadImageDataUrl('/cachet-ujsrv.png');
    } catch {
      return getFallbackStampDataUrl();
    }
  }
}

/**
 * Génère le PDF d'impression complet d'un carnet prêt à imprimer (9 tickets par feuille A4 Paysage)
 * Modèle officiel PORTUS — U.J.S.R.V. (Titre de circulation / Surveillance Camion)
 */
export async function generateCarnetPrintPDF(
  carnet: Carnet,
  tickets: Ticket[],
  onProgress?: (progress: number, total: number) => void
): Promise<void> {
  // Attendre la résolution de l'image avant de lancer la génération
  const stampDataUrl = await loadStampImage();

  // Format A4 paysage standard : 297mm x 210mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;

  // Grille 3 colonnes x 3 lignes = 9 tickets par page
  const cols = 3;
  const rows = 3;
  const ticketsPerPage = 9;

  const marginX = 7;
  const marginY = 7;
  const printableWidth = pageWidth - marginX * 2; // 283 mm
  const printableHeight = pageHeight - marginY * 2 - 5; // 191 mm
  const ticketWidth = printableWidth / cols; // ~94.3 mm
  const ticketHeight = printableHeight / rows; // ~63.6 mm

  const totalTickets = tickets.length;
  const totalPages = Math.ceil(totalTickets / ticketsPerPage);

  // Génération optimisée des QR Codes par lots
  const qrCodes: string[] = new Array(totalTickets);
  const batchSize = 18;

  for (let i = 0; i < totalTickets; i += batchSize) {
    const end = Math.min(i + batchSize, totalTickets);
    const batch = tickets.slice(i, end);
    const rendered = await Promise.all(
      batch.map(async (t) => {
        try {
          return await QRCode.toDataURL(t.qrPayload || t.ticketNumber, {
            width: 180,
            margin: 0,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#0F4C3A',
              light: '#ffffff',
            },
          });
        } catch {
          return '';
        }
      })
    );
    for (let j = 0; j < rendered.length; j++) {
      qrCodes[i + j] = rendered[j];
    }
    if (onProgress) {
      onProgress(Math.min(end, totalTickets), totalTickets);
    }
  }

  // Construction des pages A4 paysage
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage('a4', 'landscape');
    }

    const startIndex = pageIdx * ticketsPerPage;
    const pageTickets = tickets.slice(startIndex, startIndex + ticketsPerPage);

    pageTickets.forEach((ticket, idx) => {
      const globalIdx = startIndex + idx;
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const x0 = marginX + col * ticketWidth;
      const y0 = marginY + row * ticketHeight;

      // 1. Ligne de découpe extérieure (tirets fins et coins marqués)
      doc.setDrawColor(148, 163, 184);
      doc.setLineDashPattern([2, 2], 0);
      doc.setLineWidth(0.2);
      doc.rect(x0, y0, ticketWidth, ticketHeight);
      doc.setLineDashPattern([], 0);

      // 2. Fond blanc du ticket
      doc.setFillColor(255, 255, 255);
      doc.rect(x0 + 0.5, y0 + 0.5, ticketWidth - 1, ticketHeight - 1, 'F');

      // 3. Cadre externe fin et élégant (0.5 pt)
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.3);
      doc.rect(x0 + 1.2, y0 + 1.2, ticketWidth - 2.4, ticketHeight - 2.4);

      // =========================================================================
      // 1. EN-TÊTE DU TICKET (Fond clair épuré, double liseré vert / ardoise)
      // =========================================================================
      doc.setFillColor(248, 250, 252);
      doc.rect(x0 + 1.3, y0 + 1.3, ticketWidth - 2.6, 14.5, 'F');

      // Double liseré séparateur de l'en-tête (Vert foncé #0F4C3A et Ardoise #1E293B)
      doc.setDrawColor(15, 76, 58); // Vert foncé #0F4C3A
      doc.setLineWidth(0.6);
      doc.line(x0 + 1.2, y0 + 15.8, x0 + ticketWidth - 1.2, y0 + 15.8);
      doc.setDrawColor(30, 41, 59); // Ardoise #1E293B
      doc.setLineWidth(0.2);
      doc.line(x0 + 1.2, y0 + 16.1, x0 + ticketWidth - 1.2, y0 + 16.1);

      // LOGO EN HAUT À GAUCHE : x = x0 + 3 mm, y = y0 + 2 mm, taille 12 × 12 mm
      if (stampDataUrl) {
        doc.addImage(stampDataUrl, 'PNG', x0 + 3, y0 + 2.0, 12, 12);
      }

      // TEXTES D'EN-TÊTE STRICTEMENT UNIQUE (pas de double écriture, x = x0 + 17 mm)
      const textX = x0 + 17;

      // y = y0 + 4 mm : "UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI" (6pt, bold, #1E293B, maxWidth: 50mm)
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59); // #1E293B
      doc.text('UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI', textX, y0 + 4.0, { maxWidth: 50 });

      // y = y0 + 8.5 mm : "SURVEILLANCE CAMION" (10pt, bold, #0F4C3A)
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 76, 58); // #0F4C3A
      doc.text('SURVEILLANCE CAMION', textX, y0 + 8.5);

      // y = y0 + 12 mm : "Zone Portuaire & Industrielle de Vridi — Port-Bouët" (5.5pt, normal, #64748B)
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139); // #64748B
      doc.text('Zone Portuaire & Industrielle de Vridi — Port-Bouët', textX, y0 + 12.0);

      // y = y0 + 4 mm (à droite) : "CARNET : [REF]" aligné à droite
      doc.setFontSize(4.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 76, 58);
      doc.text(`CARNET : ${carnet.carnetNumber}`, x0 + ticketWidth - 2.5, y0 + 4.0, { align: 'right' });

      // =========================================================================
      // 2. CARTOUCHE NUMÉRO & QR CODE
      // =========================================================================
      const contentTopY = y0 + 17.5;

      // Cartouche Numéro : y = y0 + 17 mm
      doc.setFillColor(241, 245, 249); // #F1F5F9
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(x0 + 2.5, contentTopY, ticketWidth - 28, 8.0, 1, 1, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`TICKET N° : ${ticket.ticketNumber}`, x0 + 4, contentTopY + 5.2);

      // QR Code : x = x0 + ticketWidth - 23 mm, y = y0 + 17 mm (20 x 20 mm)
      const qrX = x0 + ticketWidth - 23;
      const qrY = y0 + 17.0;
      const qrSize = 20;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.3);
      doc.roundedRect(qrX, qrY, qrSize, qrSize, 1, 1, 'FD');

      const qrData = qrCodes[globalIdx];
      if (qrData) {
        doc.addImage(qrData, 'PNG', qrX + 1, qrY + 1, qrSize - 2, qrSize - 2);
      }

      // =========================================================================
      // 3. CORPS DU TICKET (IMMATRICULATION & DATE)
      // =========================================================================
      const leftWidth = ticketWidth - 28;
      const immY = contentTopY + 9.0;
      const immHeight = 8;

      // Boîte IMMATRICULATION : rectangle blanc vierge spacieux avec ligne pointillée
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.35);
      doc.roundedRect(x0 + 2.5, immY, leftWidth, immHeight, 1, 1, 'FD');

      doc.setFillColor(241, 245, 249);
      doc.rect(x0 + 2.5, immY, 26, immHeight, 'F');
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.2);
      doc.text('IMMATRICULATION :', x0 + 3.5, immY + 5.2);

      // Ligne pointillée
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(x0 + 29.5, immY + 5.2, x0 + ticketWidth - 28, immY + 5.2);
      doc.setLineDashPattern([], 0);

      // DATE : "DATE : ____ / ____ / 2026"
      const dateY = immY + 8.8;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(148, 163, 184);
      doc.roundedRect(x0 + 2.5, dateY, leftWidth, 6.5, 1, 1, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.5);
      doc.text('DATE :', x0 + 3.5, dateY + 4.2);

      doc.setFont('courier', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(100, 116, 139);
      doc.text('____ / ____ / 2026', x0 + 13, dateY + 4.2);

      // =========================================================================
      // 4. CADRES INFÉRIEURS (SIGNATURE AGENT & CACHET OFFICIEL)
      // =========================================================================
      const boxY = dateY + 7.5;
      const boxW = (leftWidth - 1) / 2; // ~31.5 mm chacun
      const boxH = 14;

      // Encadré 1 : SIGNATURE AGENT (vierge)
      doc.setDrawColor(148, 163, 184);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.roundedRect(x0 + 2.5, boxY, boxW, boxH, 1, 1, 'D');
      doc.setLineDashPattern([], 0);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x0 + 3, boxY + 0.5, 24, 3.2, 0.5, 0.5, 'F');
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4);
      doc.text('SIGNATURE AGENT', x0 + 3.8, boxY + 2.5);

      // Encadré 2 : CACHET OFFICIEL (tampon image 16 × 16 mm, bien centré dans son encadré)
      doc.setDrawColor(148, 163, 184);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.roundedRect(x0 + 3.5 + boxW, boxY, boxW, boxH, 1, 1, 'D');
      doc.setLineDashPattern([], 0);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x0 + 4 + boxW, boxY + 0.5, 25, 3.2, 0.5, 0.5, 'F');
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4);
      doc.text('CACHET OFFICIEL', x0 + 4.8 + boxW, boxY + 2.5);

      if (stampDataUrl) {
        const stampImgSize = 16; // 16 x 16 mm
        const stampImgX = x0 + 3.5 + boxW + (boxW - stampImgSize) / 2;
        const stampImgY = boxY + 2.0;
        doc.addImage(stampDataUrl, 'PNG', stampImgX, stampImgY, stampImgSize, stampImgSize);
      }

      // =========================================================================
      // 5. BAS DU TICKET (PIED DE PAGE NET)
      // =========================================================================
      const footerY = y0 + ticketHeight - 2.5; // y = y0 + ticketHeight - 2.5 mm

      doc.setTextColor(15, 76, 58); // Vert officiel #0F4C3A
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text(
        'CONTACTS OFFICIELS : 07 77 91 78 04 / 01 03 31 37 68',
        x0 + ticketWidth / 2,
        footerY,
        { align: 'center' }
      );
    });

    // Pied de page global du PDF (Pagination et référence)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `PORTUS — CARNET N° ${carnet.carnetNumber} — Page ${pageIdx + 1} / ${totalPages} (${totalTickets} tickets au total • 9 tickets/page A4 Paysage)`,
      pageWidth / 2,
      pageHeight - 2.5,
      { align: 'center' }
    );
  }

  // Téléchargement immédiat
  doc.save(`PORTUS_CARNET_${carnet.carnetNumber}_${totalTickets}TICKETS.pdf`);
}

/**
 * Génère le reçu officiel d'une Remise Financière (A5 Portrait)
 */
export function generateRemiseReceiptPDF(remise: Remise): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
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

  doc.save(`REMISE_${remise.reference}.pdf`);
}
