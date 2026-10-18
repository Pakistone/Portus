/**
 * Générateur PDF pour PORTUS — UJPAS
 * Union des Jeunes du Port pour l'Assistance et la Sécurité
 * 
 * RÈGLES MÉTIER & IMPRESSION :
 * 1. Format physique : A4 Paysage (297 x 210 mm)
 * 2. Disposition : 6 tickets par page (grille 3 colonnes x 2 lignes, soit 3 tickets par ligne)
 *    Format de chaque ticket : 93 x 66 mm (respectant le ratio d'aspect haute fidélité 1.414 de l'officiel 2376 x 1680 px)
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
import { renderTicketToDataUrl, preloadTicketAssets } from './ticketImageRenderer';
import { formatTicketQrForCameraScan } from './ticketSecurity';

/**
 * Charge directement le fond graphique officiel UJPAS
 */
async function loadTicketBgImage(): Promise<string> {
  return '/ticket_bg_ujpas_hd.jpg';
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
 * Génère le PDF d'impression officiel d'un carnet UJPAS (9 tickets par feuille A4 Paysage sans marge blanche)
 * Format : 297 x 210 mm (3 colonnes x 3 lignes = 99 x 70 mm bord à bord)
 * Utilise le moteur de rendu d'images raster haute définition (ticketImageRenderer)
 * avec filigrane mosaïque diagonal à -23° et réserve QR Code exclusive en bas à droite.
 * ⚠️ AUCUN PRIX N'EST AFFICHÉ SUR LE TICKET.
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
        qrPayload: formatTicketQrForCameraScan({
          ticketNumber: tNum,
          carnetNumber: carnet.carnetNumber,
          carnetCreatedAt: carnet.createdAt,
          price: 5000,
        }),
      };
    });
  }

  // Préchargement asynchrone des assets graphiques raster et de jsPDF
  const [{ jsPDF }] = await Promise.all([
    import('jspdf'),
    preloadTicketAssets(),
  ]);

  // Document A4 Paysage (297 x 210 mm) : 3 tickets par ligne, 2 lignes par page (grille 3x2 = 6 tickets par page)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const cols = 3;
  const rows = 2;
  const ticketsPerPage = 6;
  const totalTickets = effectiveTickets.length;
  const totalPages = Math.ceil(totalTickets / ticketsPerPage);

  // 1. Rendu haute définition par lot via ticketImageRenderer
  // Format officiel calibré : Largeur 93 mm (9.3 cm) x Hauteur 66 mm (6.6 cm)
  // Grille 3 colonnes x 2 lignes = 6 tickets par feuille A4 Paysage (297 x 210 mm)
  const renderedTickets: string[] = new Array(totalTickets);
  // Traitement optimisé par lots de 12 tickets avec rendu ultra-rapide
  const batchSize = 12;

  for (let i = 0; i < totalTickets; i += batchSize) {
    const end = Math.min(i + batchSize, totalTickets);
    const batch = effectiveTickets.slice(i, end);

    const renderedBatch = await Promise.all(
      batch.map((ticket) =>
        renderTicketToDataUrl(ticket, {
          width: 1075, // 300 DPI pour 9.1 cm (longueur augmentée pour combler l'espace blanc à droite)
          height: 945,  // 300 DPI pour 8.0 cm (hauteur officielle)
          format: 'image/jpeg',
          quality: 0.82, // Compression optimisée (netteté 300 DPI préservée, génération instantanée)
          watermarkOpacity: 0.58,
          enhanceContrast: true,
          carnetCreatedAt: carnet.createdAt,
          carnetNumber: carnet.carnetNumber,
        })
      )
    );

    for (let j = 0; j < renderedBatch.length; j++) {
      renderedTickets[i + j] = renderedBatch[j];
    }

    if (onProgress) {
      onProgress(Math.min(end, totalTickets), totalTickets);
    }

    // Céder brièvement la main à l'interface pour actualiser la jauge de progression
    if (end < totalTickets) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Dimensions physiques des 2 bandes de 3 tickets sur feuille A4 Paysage (297 x 210 mm)
  // Marge à gauche d'agrafage (15 mm) + 3 tickets allongés de 91 mm + 2 intervalles de perforation de 2.5 mm = 293 mm
  const ticketW = 91.0; // Longueur / largeur ticket en mm (9.1 cm - augmentée pour combler l'espace blanc à droite)
  const ticketH = 80.0; // Hauteur ticket en mm (exactement 8.0 cm)
  const stapleW = 15.0; // Talon / Marge d'agrafage à gauche (1.5 cm) pour relier le carnet
  const perfGapX = 2.5; // Espace de perforation entre tickets d'une même ligne
  const stripW = stapleW + cols * ticketW + (cols - 1) * perfGapX; // 15 + 3 * 91 + 2 * 2.5 = 293.0 mm
  const marginLeft = (297.0 - stripW) / 2; // (297.0 - 293.0) / 2 = 2.0 mm de marge équilibrée (comble l'espace blanc à droite)
  const stripGapY = 14.0; // Espace entre les deux bandes pour le coup de ciseaux
  const marginTop = (210.0 - (rows * ticketH + stripGapY)) / 2; // (210 - (160 + 14)) / 2 = 18.0 mm

  // 2. Assemblage des pages A4 Paysage (2 bandes de 3 tickets par page)
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage('a4', 'landscape');
    }

    const startIndex = pageIdx * ticketsPerPage;
    const pageTickets = effectiveTickets.slice(startIndex, startIndex + ticketsPerPage);

    // Dessin des 2 bandes
    for (let r = 0; r < rows; r++) {
      const rowY = marginTop + r * (ticketH + stripGapY);

      // Bordure de coupe nette en tirets entourant la bande complète (Talon d'agrafage + 3 tickets)
      doc.setDrawColor(31, 41, 55); // Gris foncé / noir
      doc.setLineWidth(0.35);
      doc.setLineDashPattern([3, 2], 0);
      doc.rect(marginLeft, rowY, stripW, ticketH);
      doc.setLineDashPattern([], 0);

      // Texte indicateur de coupe
      doc.setTextColor(75, 85, 99);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`BANDE ${r + 1} — DÉCOUPE CISEAUX (MARGE AGRAFAGE À GAUCHE + 3 TICKETS)`, marginLeft + 3, rowY - 1.5);

      // 1. Dessin du Talon / Marge d'agrafage sur le côté gauche de la bande
      // Fond légèrement teinté du talon
      doc.setFillColor(248, 250, 252);
      doc.rect(marginLeft, rowY, stapleW, ticketH, 'F');

      // Ligne verticale de séparation / perforation entre le talon d'agrafage et le 1er ticket
      doc.setDrawColor(31, 41, 55);
      doc.setLineWidth(0.30);
      doc.setLineDashPattern([1.0, 1.2], 0);
      doc.line(marginLeft + stapleW, rowY, marginLeft + stapleW, rowY + ticketH);
      doc.setLineDashPattern([], 0);

      // Repères visuels d'agrafes (Haut et Bas)
      doc.setDrawColor(107, 114, 128);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(marginLeft + stapleW / 2 - 2, rowY + 8, 4, 10);
      doc.rect(marginLeft + stapleW / 2 - 2, rowY + ticketH - 18, 4, 10);
      doc.setLineDashPattern([], 0);

      doc.setTextColor(75, 85, 99);
      doc.setFontSize(5.0);
      doc.setFont('helvetica', 'bold');
      doc.text('AGRAFE', marginLeft + stapleW / 2, rowY + 14.5, { align: 'center' });
      doc.text('AGRAFE', marginLeft + stapleW / 2, rowY + ticketH - 11.5, { align: 'center' });

      // Mention verticale de reliure
      doc.setFontSize(5.5);
      doc.setTextColor(55, 65, 81);
      doc.text('RELIURE CARNET', marginLeft + stapleW / 2, rowY + ticketH / 2, { align: 'center', angle: 90 });

      // 2. Rendu des 3 tickets de la bande (décalés après la marge d'agrafage)
      for (let c = 0; c < cols; c++) {
        const ticketIdx = r * cols + c;
        if (ticketIdx >= pageTickets.length) break;

        const globalIdx = startIndex + ticketIdx;
        const tx = marginLeft + stapleW + c * (ticketW + perfGapX);

        const ticketImg = renderedTickets[globalIdx];
        if (ticketImg) {
          doc.addImage(ticketImg, 'JPEG', tx, rowY, ticketW, ticketH, `TKT_${globalIdx}`, 'FAST');
          renderedTickets[globalIdx] = '';
        }

        // Ligne de perforation en pointillés fins au milieu de l'espace entre tickets
        if (c < cols - 1 && ticketIdx + 1 < pageTickets.length) {
          const perfLineX = tx + ticketW + perfGapX / 2;
          doc.setDrawColor(55, 65, 81);
          doc.setLineWidth(0.25);
          doc.setLineDashPattern([0.8, 1.2], 0);
          doc.line(perfLineX, rowY + 1, perfLineX, rowY + ticketH - 1);
          doc.setLineDashPattern([], 0);
        }
      }
    }

    // Mention de guidage de coupe médiane
    doc.setDrawColor(156, 163, 175);
    doc.setLineWidth(0.15);
    doc.setLineDashPattern([1.5, 2.5], 0);
    const midCutY = marginTop + ticketH + stripGapY / 2;
    doc.line(marginLeft, midCutY, marginLeft + stripW, midCutY);
    doc.setLineDashPattern([], 0);

    doc.setTextColor(107, 114, 128);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.text(
      `✂ Ligne de découpe médiane pour séparer les 2 bandes • Carnet ${carnet.carnetNumber} — Page ${pageIdx + 1}/${totalPages} ✂`,
      148.5,
      midCutY - 1,
      { align: 'center' }
    );
  }

  // Nom de fichier officiel demandé :
  // PORTUS_UJPAS_CARNET_${carnet.carnetNumber}_${totalTickets}TICKETS.pdf
  return downloadPdfDoc(doc, `PORTUS_UJPAS_CARNET_${carnet.carnetNumber}_${totalTickets}TICKETS.pdf`);
}

let watermarkDataUrlCache: string = '';
async function getWatermarkDataUrl(): Promise<string> {
  if (watermarkDataUrlCache) return watermarkDataUrlCache;
  if (typeof document === 'undefined') return '';
  try {
    const assets = await preloadTicketAssets();
    if (assets.watermark) {
      const c = document.createElement('canvas');
      c.width = assets.watermark.naturalWidth || 800;
      c.height = assets.watermark.naturalHeight || 600;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(assets.watermark, 0, 0);
        watermarkDataUrlCache = c.toDataURL('image/jpeg', 0.85);
        return watermarkDataUrlCache;
      }
    }
  } catch {}
  return '';
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

  // Filigrane de sécurité officiel UJPAS en fond de page
  try {
    const wmUrl = await getWatermarkDataUrl();
    if (wmUrl) {
      doc.saveGraphicsState();
      try {
        if ((doc as any).GState) {
          doc.setGState(new (doc as any).GState({ opacity: 0.20 }));
        }
      } catch {}
      doc.addImage(wmUrl, 'JPEG', 10, 32, pw - 20, 140, 'WM_REMISE', 'FAST');
      doc.restoreGraphicsState();
    }
  } catch {}

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
