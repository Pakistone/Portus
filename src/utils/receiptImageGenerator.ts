import QRCode from 'qrcode';
import { ORG_INFO } from '../config/constants';
import { computeExpirationDate } from './expiration';
import { formatDateTime } from './normalization';

export interface ReceiptData {
  ticketNumber: string;
  plateNumber: string;
  amount: number;
  agentName: string;
  dateStr: string;
  soldAtIso?: string;
  expiresAtStr?: string;
  paymentMethod?: string;
  driverName?: string;
  driverPhone?: string;
  carnetNumber?: string;
  qrPayload?: string;
}

/**
 * Charge un élément Image de manière asynchrone et sécurisée
 */
const loadImageSafe = (src: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`[PORTUS Image] Échec du chargement de l'image ${src}, utilisation du repli vectoriel.`);
      resolve(null);
    };
    img.src = src;
  });
};

/**
 * Dessine un cachet de validation vectoriel U.J.P.A.S.
 */
function drawValidationUjpasFallback(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.strokeStyle = '#0F4C3A';
  ctx.fillStyle = '#0F4C3A';

  const numPoints = 24;
  const rOuter = r;
  const rInner = r - 5;
  ctx.beginPath();
  for (let i = 0; i < numPoints; i++) {
    const angle1 = (i * 2 * Math.PI) / numPoints;
    const angleMid = ((i + 0.5) * 2 * Math.PI) / numPoints;
    const angle2 = ((i + 1) * 2 * Math.PI) / numPoints;

    const x1 = cx + rInner * Math.cos(angle1);
    const y1 = cy + rInner * Math.sin(angle1);
    const xMid = cx + rOuter * Math.cos(angleMid);
    const yMid = cy + rOuter * Math.sin(angleMid);
    const x2 = cx + rInner * Math.cos(angle2);
    const y2 = cy + rInner * Math.sin(angle2);

    if (i === 0) ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(xMid, yMid, x2, y2);
  }
  ctx.closePath();
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r - 12, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
  ctx.fillText('VALIDATION', cx, cy - 8);

  ctx.font = '900 17px Helvetica, Arial, sans-serif';
  ctx.fillText('U.J.P.A.S.', cx, cy + 10);
  ctx.restore();
}

/**
 * Dessine un logo vectoriel de secours U.J.P.A.S.
 */
function drawLogoFallback(ctx: CanvasRenderingContext2D, lx: number, ly: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(lx, ly, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#0D4A36';
  ctx.fill();

  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('UJPAS', lx, ly);
  ctx.restore();
}

/**
 * Génère une image PNG haute définition (Blob) du modèle de reçu officiel U.J.P.A.S.
 * Format paysage 1100x520px avec filigrane, 8 cases d'immatriculation, validité 14 jours, QR code, validation et talon.
 */
export async function generateReceiptImageBlob(data: ReceiptData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Impossible d’initialiser le contexte 2D pour le reçu');

  const computedExpiryStr =
    data.expiresAtStr ||
    (data.soldAtIso ? formatDateTime(computeExpirationDate(data.soldAtIso)) : '14 jours après émission');

  const [logoImg, stampImg] = await Promise.all([
    loadImageSafe(ORG_INFO.LOGO_PATH),
    loadImageSafe(ORG_INFO.STAMP_PATH),
  ]);

  // 1. Fond sécurisé ivoire clair
  ctx.fillStyle = '#FBF9F3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Filigrane de sécurité officiel : U.J.P.A.S., UCRAO, CSCRAO, UCRPPLAO-CI
  ctx.save();
  ctx.fillStyle = 'rgba(13, 74, 54, 0.12)';
  ctx.font = 'bold 9.5px Helvetica, Arial, sans-serif';
  const watermarkUnit = 'U.J.P.A.S.   UCRAO   CSCRAO   UCRPPLAO-CI   ';
  const unitWidth = ctx.measureText(watermarkUnit).width;
  const repeatCount = Math.ceil(canvas.width / unitWidth) + 3;
  const fullRowText = watermarkUnit.repeat(repeatCount);
  const stepY = 18;
  let rowIndex = 0;

  for (let wy = 10; wy <= canvas.height + 20; wy += stepY) {
    const shiftX = rowIndex % 2 === 1 ? unitWidth / 2 : 0;
    ctx.fillText(fullRowText, -shiftX - 20, wy);
    rowIndex++;
  }
  ctx.restore();

  // 3. Cadre externe du ticket aux couleurs U.J.P.A.S.
  ctx.strokeStyle = '#0D4A36';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

  // 4. Ruban supérieur courbé tricolore Côte d'Ivoire (Orange - Blanc - Vert)
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, '#EA580C');
  grad.addColorStop(0.35, '#F97316');
  grad.addColorStop(0.5, '#FFFFFF');
  grad.addColorStop(0.65, '#16A34A');
  grad.addColorStop(1, '#0D4A36');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(12, 12);
  ctx.lineTo(canvas.width - 12, 12);
  ctx.lineTo(canvas.width - 12, 32);
  ctx.quadraticCurveTo(canvas.width / 2, 45, 12, 32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 5. Logo officiel U.J.P.A.S. en haut à gauche
  if (logoImg) {
    ctx.drawImage(logoImg, 30, 42, 95, 95);
  } else {
    drawLogoFallback(ctx, 78, 90, 85);
  }

  // 6. Textes d'en-tête officiels U.J.P.A.S.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0D4A36';
  ctx.font = '900 20px Helvetica, Arial, sans-serif';
  ctx.fillText("UNION DES JEUNES DU PORT POUR L'ASSISTANCE ET LA SÉCURITÉ (U.J.P.A.S.)", 140, 66);

  ctx.fillStyle = '#EA580C';
  ctx.font = 'bold 15px Helvetica, Arial, sans-serif';
  ctx.fillText("ASSISTANCE, FLUIDITÉ & SÉCURITÉ ROUTIÈRE — PORT D'ABIDJAN", 140, 90);

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
  ctx.fillText('Zone Portuaire & Industrielle de Vridi — Validité Stricte : 14 Jours', 140, 112);

  // Référence Carnet en haut à droite
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0D4A36';
  ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
  ctx.fillText(`CARNET : ${data.carnetNumber || 'ACTIF'}`, 850, 112);

  // =========================================================================
  // CARTOUCHE N° TICKET & QR CODE DE VÉRIFICATION
  // =========================================================================
  const contentTopY = 142;

  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#0D4A36';
  ctx.lineWidth = 2.5;
  ctx.fillRect(30, contentTopY, 600, 54);
  ctx.strokeRect(30, contentTopY, 600, 54);

  ctx.fillStyle = '#0D4A36';
  ctx.textAlign = 'left';
  ctx.font = '900 22px "Arial Black", Impact, monospace';
  ctx.fillText(`N° TICKET : ${data.ticketNumber}`, 45, contentTopY + 35);

  if (data.paymentMethod) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#EA580C';
    ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
    ctx.fillText(`MODE : ${data.paymentMethod}`, 615, contentTopY + 33);
  }

  // QR Code sécurisé à droite
  const qrX = 665;
  const qrY = 142;
  const qrSize = 185;

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2.5;
  ctx.fillRect(qrX, qrY, qrSize, qrSize);
  ctx.strokeRect(qrX, qrY, qrSize, qrSize);

  try {
    const qrUrl = await QRCode.toDataURL(data.qrPayload || data.ticketNumber, {
      margin: 1,
      width: qrSize - 10,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
    const qrImgEl = await loadImageSafe(qrUrl);
    if (qrImgEl) {
      ctx.drawImage(qrImgEl, qrX + 5, qrY + 5, qrSize - 10, qrSize - 10);
    }
  } catch (err) {
    console.error('Erreur dessin QR Code ticket:', err);
  }

  // =========================================================================
  // ZONE IMMATRICULATION : 8 CASES NORMALISÉES
  // =========================================================================
  const immY = contentTopY + 64;

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2;
  ctx.fillRect(30, immY, 600, 56);
  ctx.strokeRect(30, immY, 600, 56);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
  ctx.fillText('N° IMMATRICULATION CAMION :', 42, immY + 33);

  const cleanPlate = (data.plateNumber || '').replace(/[\s-]/g, '').toUpperCase();
  const startBoxX = 265;
  const plateBoxW = 36;
  const plateBoxH = 40;
  const boxGap = 6;

  for (let i = 0; i < 8; i++) {
    const bx = startBoxX + i * (plateBoxW + boxGap);
    const by = immY + 8;
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.8;
    ctx.fillRect(bx, by, plateBoxW, plateBoxH);
    ctx.strokeRect(bx, by, plateBoxW, plateBoxH);

    const char = cleanPlate[i] || '';
    if (char) {
      ctx.fillStyle = '#0F172A';
      ctx.font = '900 22px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(char, bx + plateBoxW / 2, by + 28);
    }
  }

  // =========================================================================
  // ZONE DATE D'ÉMISSION, EXPIRATION 14 JOURS & CHAUFFEUR
  // =========================================================================
  const dateY = immY + 64;

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2;
  ctx.fillRect(30, dateY, 600, 54);
  ctx.strokeRect(30, dateY, 600, 54);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
  ctx.fillText('ÉMIS LE :', 42, dateY + 22);

  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.fillStyle = '#1E293B';
  ctx.fillText(data.dateStr, 105, dateY + 22);

  ctx.fillStyle = '#B45309';
  ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
  ctx.fillText('EXPIRE LE (14J) :', 42, dateY + 42);

  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.fillStyle = '#D97706';
  ctx.fillText(computedExpiryStr, 150, dateY + 42);

  ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText('CHAUFFEUR :', 355, dateY + 22);

  ctx.font = 'bold 13px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText((data.driverName || '---').slice(0, 22), 440, dateY + 22);

  ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#0F172A';
  ctx.fillText('TÉL :', 355, dateY + 42);

  ctx.font = 'bold 12px "Courier New", monospace';
  ctx.fillStyle = '#334155';
  ctx.fillText(data.driverPhone || '---', 395, dateY + 42);

  // =========================================================================
  // SIGNATURE AGENT & CACHET "VALIDATION U.J.P.A.S."
  // =========================================================================
  const boxY = dateY + 62;
  const boxW = 290;
  const boxH = 92;

  // 1. Signature Agent
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(30, boxY, boxW, boxH);
  ctx.setLineDash([]);

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(35, boxY + 2, boxW - 10, 22);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SIGNATURE AGENT U.J.P.A.S.', 30 + boxW / 2, boxY + 17);

  ctx.save();
  ctx.strokeStyle = '#1E3A8A';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(60, boxY + 53);
  ctx.bezierCurveTo(90, boxY + 35, 120, boxY + 78, 160, boxY + 45);
  ctx.bezierCurveTo(180, boxY + 30, 210, boxY + 63, 250, boxY + 53);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = 'italic bold 12px Helvetica, Arial, sans-serif';
  ctx.fillText(data.agentName, 30 + boxW / 2, boxY + 80);
  ctx.restore();

  // 2. Cachet "VALIDATION U.J.P.A.S."
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(340, boxY, boxW, boxH);
  ctx.setLineDash([]);

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(345, boxY + 2, boxW - 10, 22);
  ctx.fillStyle = '#0F4C3A';
  ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VALIDATION U.J.P.A.S.', 340 + boxW / 2, boxY + 17);

  const stampCx = 340 + boxW / 2;
  const stampCy = boxY + boxH / 2 + 8;

  if (stampImg) {
    ctx.drawImage(stampImg, stampCx - 35, stampCy - 35, 70, 70);
  } else {
    drawValidationUjpasFallback(ctx, stampCx, stampCy, 34);
  }

  // =========================================================================
  // TALON DE CONTRÔLE DÉTACHABLE (DROITE)
  // =========================================================================
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(880, 25);
  ctx.lineTo(880, 480);
  ctx.stroke();
  ctx.setLineDash([]);

  const stubX = 895;
  if (logoImg) {
    ctx.drawImage(logoImg, stubX + 45, 42, 58, 58);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0D4A36';
  ctx.font = '900 12px "Arial Black", monospace';
  ctx.fillText(`N° : ${data.ticketNumber}`, stubX + 8, 122);

  ctx.fillStyle = '#0D4A36';
  ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
  ctx.fillText('IMMATRICULATION :', stubX + 8, 146);

  ctx.font = '900 15px "Courier New", monospace';
  ctx.fillStyle = '#0F172A';
  ctx.fillText(cleanPlate, stubX + 8, 166);

  ctx.fillStyle = '#0D4A36';
  ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
  ctx.fillText('ÉMIS LE :', stubX + 8, 192);

  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.fillStyle = '#334155';
  ctx.fillText(data.dateStr, stubX + 8, 208);

  ctx.fillStyle = '#B45309';
  ctx.font = 'bold 10px Helvetica, Arial, sans-serif';
  ctx.fillText('EXPIRE LE (14J) :', stubX + 8, 232);

  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.fillStyle = '#D97706';
  ctx.fillText(computedExpiryStr, stubX + 8, 248);

  // Cadre email officiel sur le talon
  ctx.fillStyle = '#0D4A36';
  ctx.fillRect(stubX + 6, 268, 178, 48);
  ctx.fillStyle = '#FDE68A';
  ctx.font = '900 9px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CONTACT OFFICIEL U.J.P.A.S.', stubX + 95, 285);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 9px Helvetica, Arial, sans-serif';
  ctx.fillText(ORG_INFO.CONTACT_EMAIL, stubX + 95, 303);

  ctx.save();
  ctx.translate(1075, 430);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 8.5px Helvetica, Arial, sans-serif';
  ctx.fillText('PROPRIÉTÉ EXCLUSIVE U.J.P.A.S. - TOUTE COPIE INTERDITE', 0, 0);
  ctx.restore();

  // =========================================================================
  // PIED DE PAGE : CONTACTS OFFICIELS U.J.P.A.S.
  // =========================================================================
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0D4A36';
  ctx.font = '900 11px Helvetica, Arial, sans-serif';
  ctx.fillText(
    `POUR TOUTE VÉRIFICATION, CONTACTEZ L'U.J.P.A.S. : TEL: ${ORG_INFO.CONTACT_TEL}  |  EMAIL: ${ORG_INFO.CONTACT_EMAIL}`,
    550,
    502
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Erreur de conversion canvas en Blob'));
    }, 'image/png');
  });
}
