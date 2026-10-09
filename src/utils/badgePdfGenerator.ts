import QRCode from 'qrcode';
import { formatDateTime } from './normalization';

export interface BadgeParams {
  name: string;
  firstName: string;
  matricule: string;
  role: string;
  brigade: string;
  sector: string;
  photoUrl?: string; // Captured photo (DataURL) or empty
  bloodGroup?: string;
  cniNumber?: string;
  emergencyPhone?: string;
}

// Robust converter from image URL/blob to DataURL
async function convertImgToDataUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return resolve('');
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;

    const timeout = setTimeout(() => {
      resolve('');
    }, 3000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 400;
        canvas.height = img.naturalHeight || 400;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
          return;
        }
      } catch (e) {
        console.warn('Canvas conversion failed for badge image:', e);
      }
      resolve('');
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve('');
    };
  });
}

/**
 * Generates an A4 PDF sheet containing side-by-side Recto and Verso badges for UJPAS.
 */
export async function generateAgentBadgePDF(agent: BadgeParams): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  
  // Create A4 Landscape or Portrait PDF. Side-by-side recto/verso fits perfectly in A4 portrait!
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Load Official Logo and Administrative Stamp
  const logoDataUrl = await convertImgToDataUrl('/public/logo-ujpas.png').catch(() => '');
  const stampDataUrl = await convertImgToDataUrl('/public/cachet-ujpas.png').catch(() => '');

  // Generate QR Code for Agent Authentication
  // Format: UJPAS|AGENT|matricule|nom|role|annee
  const qrPayload = `UJPAS|AGENT|${agent.matricule}|${agent.name}|${agent.role}|2026`;
  const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
    margin: 1,
    width: 200,
    errorCorrectionLevel: 'M',
  }).catch(() => '');

  // Dimensions of a vertical neck badge in mm
  const cardW = 85.0;
  const cardH = 120.0;

  // Placement coordinates for Recto and Verso side-by-side
  const rx = 15.0; // Recto X
  const ry = 40.0; // Y coordinate (margin for vertical center alignment)
  const vx = 110.0; // Verso X
  const vy = 40.0; // Y coordinate

  // --- 1. RECTO DESIGN (Left Badge) ---
  
  // Background Card Shape
  doc.setFillColor(255, 255, 255);
  doc.rect(rx, ry, cardW, cardH, 'F');
  
  // Draw Outer Security Border (Dark Blue)
  doc.setDrawColor(15, 41, 66);
  doc.setLineWidth(1.0);
  doc.rect(rx, ry, cardW, cardH, 'S');

  // Subtle inner gold frame
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.4);
  doc.rect(rx + 2, ry + 2, cardW - 4, cardH - 4, 'S');

  // Tricolor neck-slot band (Orange, White, Green) at the very top header (6mm height)
  const bandH = 6.0;
  const bandW = cardW - 4;
  doc.setFillColor(234, 88, 12); // Orange
  doc.rect(rx + 2, ry + 2, bandW / 3, bandH, 'F');
  doc.setFillColor(255, 255, 255); // White
  doc.rect(rx + 2 + bandW / 3, ry + 2, bandW / 3, bandH, 'F');
  doc.setFillColor(21, 128, 61); // Green
  doc.rect(rx + 2 + (2 * bandW) / 3, ry + 2, bandW / 3, bandH, 'F');

  // Neck-slot hole representation (14 x 3.6 mm) centered at the top
  const slotW = 14.0;
  const slotH = 3.6;
  const slotX = rx + (cardW - slotW) / 2;
  const slotY = ry + 1.2;
  doc.setFillColor(15, 41, 66);
  doc.rect(slotX, slotY, slotW, slotH, 'F');

  // Organisation Header (Below slot, centered)
  doc.setTextColor(15, 41, 66);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('UNION DES JEUNES DU PORT', rx + cardW / 2, ry + 13, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text("POUR L'ASSISTANCE ET LA SÉCURITÉ", rx + cardW / 2, ry + 16.5, { align: 'center' });
  
  // Big bold "U.J.P.A.S." acronym
  doc.setFontSize(11);
  doc.setTextColor(234, 88, 12); // Orange
  doc.text('U. J. P. A. S.', rx + cardW / 2, ry + 21, { align: 'center' });

  // Draw separator line
  doc.setDrawColor(15, 41, 66);
  doc.setLineWidth(0.3);
  doc.line(rx + 6, ry + 23, rx + cardW - 6, ry + 23);

  // Agent Photo Area
  const photoW = 26.0;
  const photoH = 32.0;
  const px = rx + (cardW - photoW) / 2;
  const py = ry + 26.0;

  // Render captured Photo or highly professional placeholder outline
  if (agent.photoUrl && agent.photoUrl.startsWith('data:image')) {
    try {
      doc.addImage(agent.photoUrl, 'JPEG', px, py, photoW, photoH);
    } catch {
      // Fallback
      doc.setFillColor(243, 244, 246);
      doc.rect(px, py, photoW, photoH, 'F');
    }
  } else {
    // Beautiful placeholder with silhouette
    doc.setFillColor(243, 244, 246);
    doc.rect(px, py, photoW, photoH, 'F');
    
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.rect(px, py, photoW, photoH, 'S');

    // Silhouette details
    doc.setFillColor(156, 163, 175);
    // head
    doc.circle(px + photoW / 2, py + 12, 5, 'F');
    // torso
    doc.ellipse(px + photoW / 2, py + 24, 9, 6, 'F');
  }

  // Draw Border around photo
  doc.setDrawColor(15, 41, 66);
  doc.setLineWidth(0.6);
  doc.rect(px, py, photoW, photoH, 'S');

  // Embedded Official Logo (Overlayed on upper corner of the photo beautifully or side)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', rx + 6, ry + 28, 12, 12);
    } catch (e) {
      console.warn('Logo integration on badge failed:', e);
    }
  }

  // Right-side dynamic QR Code
  if (qrCodeDataUrl) {
    try {
      doc.addImage(qrCodeDataUrl, 'PNG', rx + cardW - 18, ry + 28, 12, 12);
    } catch (e) {
      console.warn('QR Code integration on badge failed:', e);
    }
  }

  // Agent Identity Details
  doc.setTextColor(15, 41, 66);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('NOM :', rx + 10, ry + 64);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(agent.name.toUpperCase(), rx + 24, ry + 64);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PRÉNOMS :', rx + 10, ry + 69.5);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(agent.firstName.toUpperCase(), rx + 30, ry + 69.5);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('MATRICULE :', rx + 10, ry + 75);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(234, 88, 12); // Orange
  doc.text(agent.matricule, rx + 32, ry + 75);

  // Secondary details
  doc.setTextColor(15, 41, 66);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('BRIGADE :', rx + 10, ry + 81);
  doc.setFont('Helvetica', 'normal');
  doc.text(agent.brigade || 'MATIN', rx + 26, ry + 81);

  doc.setFont('Helvetica', 'bold');
  doc.text('SECTEUR :', rx + 10, ry + 86);
  doc.setFont('Helvetica', 'normal');
  doc.text(agent.sector || 'VRIDI PORT', rx + 26, ry + 86);

  // Large bottom colored banner representing Role
  const roleBannerH = 10.0;
  const roleY = ry + 93.0;
  
  // Decide role banner color (Agent: dark green, Supervisor/Admin: dark orange/blue)
  let bannerFill = [15, 41, 66]; // Navy Blue
  let bannerText = [255, 255, 255];
  if (agent.role.includes('AGENT')) {
    bannerFill = [21, 128, 61]; // Dark Green
  } else if (agent.role.includes('RESPONSABLE') || agent.role.includes('SUPERVISEUR')) {
    bannerFill = [234, 88, 12]; // Orange
  }

  doc.setFillColor(bannerFill[0], bannerFill[1], bannerFill[2]);
  doc.rect(rx + 4, roleY, cardW - 8, roleBannerH, 'F');
  
  doc.setTextColor(bannerText[0], bannerText[1], bannerText[2]);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(agent.role.toUpperCase(), rx + cardW / 2, roleY + 6.2, { align: 'center' });

  // Ivory Coast Maps geographic outline watermark (Subtle label text at bottom)
  doc.setTextColor(156, 163, 175);
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(5);
  doc.text('REPUBLIQUE DE COTE D\'IVOIRE • FLOTTE CORRIDOR VRIDI', rx + cardW / 2, ry + 112, { align: 'center' });


  // --- 2. VERSO DESIGN (Right Badge) ---

  // Background Card Shape
  doc.setFillColor(255, 255, 255);
  doc.rect(vx, vy, cardW, cardH, 'F');
  
  // Draw Outer Security Border
  doc.setDrawColor(15, 41, 66);
  doc.setLineWidth(1.0);
  doc.rect(vx, vy, cardW, cardH, 'S');

  // Subtle inner gold frame
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.4);
  doc.rect(vx + 2, vy + 2, cardW - 4, cardH - 4, 'S');

  // Tricolor neck-slot band mirrored
  doc.setFillColor(21, 128, 61); // Green
  doc.rect(vx + 2, vy + 2, bandW / 3, bandH, 'F');
  doc.setFillColor(255, 255, 255); // White
  doc.rect(vx + 2 + bandW / 3, vy + 2, bandW / 3, bandH, 'F');
  doc.setFillColor(234, 88, 12); // Orange
  doc.rect(vx + 2 + (2 * bandW) / 3, vy + 2, bandW / 3, bandH, 'F');

  // Slot Hole
  const vSlotX = vx + (cardW - slotW) / 2;
  doc.setFillColor(15, 41, 66);
  doc.rect(vSlotX, slotY, slotW, slotH, 'F');

  // Title: "DISPOSITIONS LÉGALES"
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 41, 66);
  doc.text('DISPOSITIONS LÉGALES', vx + cardW / 2, vy + 14, { align: 'center' });

  // Rule Line
  doc.setDrawColor(15, 41, 66);
  doc.setLineWidth(0.3);
  doc.line(vx + 10, vy + 16, vx + cardW - 10, vy + 16);

  // Legal Framework text (Article 5)
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(31, 41, 55);
  const legalText = 
    "Art. 5 du R.I. : Le titulaire du présent badge est membre actif assermenté de l'UJPAS. " +
    "Les autorités municipales, portuaires, policières, douanières et de la gendarmerie nationale " +
    "sont priées de lui accorder assistance et de lui faciliter le libre accès et passage dans " +
    "l'exercice légitime de ses fonctions d'assistance logistique, de surveillance et de fluidité " +
    "routière sur l'ensemble du corridor industriel et portuaire de Vridi (Abidjan).";
  
  const splitLegal = doc.splitTextToSize(legalText, cardW - 12);
  doc.text(splitLegal, vx + 6, vy + 20);

  // Urgent Medical Form Box
  const formY = vy + 41.0;
  doc.setFillColor(254, 243, 199); // Subtle gold bg
  doc.rect(vx + 6, formY, cardW - 12, 23, 'F');
  
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.3);
  doc.rect(vx + 6, formY, cardW - 12, 23, 'S');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 41, 66);
  doc.text('URGENCE & SANTÉ', vx + cardW / 2, formY + 4, { align: 'center' });
  doc.line(vx + 12, formY + 5.5, vx + cardW - 12, formY + 5.5);

  doc.setFontSize(6.5);
  doc.setFont('Helvetica', 'bold');
  doc.text('GROUPE SANGUIN :', vx + 9, formY + 9);
  doc.setFont('Helvetica', 'normal');
  doc.text(agent.bloodGroup || 'NON CONSEILLÉ', vx + 33, formY + 9);

  doc.setFont('Helvetica', 'bold');
  doc.text('N° CNI / ID CARD :', vx + 9, formY + 13);
  doc.setFont('Helvetica', 'normal');
  doc.text(agent.cniNumber || 'M-XXXXXXXX', vx + 32, formY + 13);

  doc.setFont('Helvetica', 'bold');
  doc.text('PARENT À CONTACTER :', vx + 9, formY + 17);
  doc.setFont('Helvetica', 'normal');
  doc.text(agent.emergencyPhone || '01 00 00 00 00', vx + 37, formY + 17);

  // Administrative stamp and Presidential signature area
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('SIGNATURE DU PRÉSIDENT', vx + 10, vy + 71);
  
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 41, 66);
  doc.text('M. BLÉ FLAVIEN', vx + 12, vy + 77);
  
  // Fake hand signature line representation
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(vx + 10, vy + 81, vx + 40, vy + 81);

  // Overlay Official Cachet if available
  if (stampDataUrl) {
    try {
      // Place the administrative stamp partially overlapping the signature
      doc.addImage(stampDataUrl, 'PNG', vx + cardW - 35, vy + 65, 28, 28);
    } catch (e) {
      console.warn('Stamp integration on badge failed:', e);
    }
  }

  // Address and contacts block at bottom
  const footerY = vy + 98;
  doc.setFillColor(15, 41, 66);
  doc.rect(vx + 4, footerY, cardW - 8, 17, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('SIÈGE SOCIAL : PORT-BOUËT GONZAGUEVILLE', vx + cardW / 2, footerY + 4.5, { align: 'center' });
  doc.text('UNION DES JEUNES DE LA SÉCURITÉ VRIDI', vx + cardW / 2, footerY + 8.5, { align: 'center' });
  
  doc.setTextColor(251, 191, 36); // Yellow text
  doc.setFontSize(7);
  doc.text('INFOLINE : 01 03 31 37 68 / 07 77 91 78 04', vx + cardW / 2, footerY + 13, { align: 'center' });


  // --- 3. CUTTING LINES AND HOLE PUNCH GUIDE ---
  
  // Outer cutting guidelines around the rectangular shapes to facilitate accurate cutter execution
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([2, 2], 0);

  // Recto lines
  doc.line(rx - 3, ry, rx + cardW + 3, ry); // horizontal top
  doc.line(rx - 3, ry + cardH, rx + cardW + 3, ry + cardH); // horizontal bottom
  doc.line(rx, ry - 3, rx, ry + cardH + 3); // vertical left
  doc.line(rx + cardW, ry - 3, rx + cardW, ry + cardH + 3); // vertical right

  // Verso lines
  doc.line(vx - 3, vy, vx + cardW + 3, vy); // horizontal top
  doc.line(vx - 3, vy + cardH, vx + cardW + 3, vy + cardH); // horizontal bottom
  doc.line(vx, vy - 3, vx, vy + cardH + 3); // vertical left
  doc.line(vx + cardW, vy - 3, vx + cardW, vy + cardH + 3); // vertical right

  // Document title on top margin
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 41, 66);
  doc.text('PLANCHE D\'IMPRESSION DES BADGES PROFESSIONNELS UJPAS', 105, 18, { align: 'center' });
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Format vertical réglementaire : 85,0 x 120,0 mm  |  Impression Recto / Verso à découper et plastifier', 105, 23, { align: 'center' });
  
  // Date of export
  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175);
  doc.text(`Edité le ${formatDateTime(new Date().toISOString())} par PORTUS UJPAS`, 105, 28, { align: 'center' });

  return doc.output('blob');
}
