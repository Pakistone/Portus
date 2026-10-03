import QRCode from 'qrcode';

export interface ReceiptData {
  ticketNumber: string;
  plateNumber: string;
  amount: number;
  agentName: string;
  dateStr: string;
  driverName?: string;
  driverPhone?: string;
  carnetNumber?: string;
  qrPayload?: string;
}

/**
 * Charge un élément Image de manière asynchrone et sécurisée (ne lève jamais d'exception pour éviter de bloquer le canvas)
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
 * Dessine un cachet officiel vectoriel identique à celui du PDF
 */
function drawOfficialStampFallback(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.strokeStyle = '#0F4C3A'; // Vert forêt
  ctx.fillStyle = '#0F4C3A';

  const rOuter = r;
  const rInner = r - 5;

  // Double cercle
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.stroke();

  // Texte circulaire 'U.J.S.R.V.'
  ctx.save();
  ctx.fillStyle = '#0F4C3A';
  ctx.font = '900 13px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const topText = 'U . J . S . R . V .';
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 2 - 0.35);
  const radiusTop = rInner - 12;
  for (let i = 0; i < topText.length; i++) {
    ctx.save();
    const angle = (i - topText.length / 2 + 0.5) * 0.15;
    ctx.rotate(angle);
    ctx.translate(0, -radiusTop);
    ctx.fillText(topText[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // Texte circulaire inférieur 'CACHET OFFICIEL'
  ctx.save();
  ctx.fillStyle = '#0F4C3A';
  ctx.font = '700 8px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const bottomText = '• CACHET OFFICIEL •';
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 2 + 0.55);
  const radiusBottom = rInner - 11;
  for (let i = 0; i < bottomText.length; i++) {
    ctx.save();
    const angle = (i - bottomText.length / 2 + 0.5) * 0.11;
    ctx.rotate(-angle);
    ctx.translate(0, radiusBottom);
    ctx.fillText(bottomText[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // Laurier gauche et droit (Gris ardoise #1E293B)
  ctx.fillStyle = '#1E293B';
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1;

  // Lauriers
  for (let i = -2; i <= 2; i++) {
    const ly = cy + i * 6;
    const lxLeft = cx - 26 - Math.abs(i) * 1.5;
    const lxRight = cx + 26 + Math.abs(i) * 1.5;

    ctx.beginPath();
    ctx.ellipse(lxLeft, ly, 3, 1.5, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(lxRight, ly, 3, 1.5, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Camion central
  ctx.fillStyle = '#0F4C3A';
  ctx.fillRect(cx - 13, cy - 9, 26, 20);

  // Pare-brise
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 10, cy - 6, 20, 8);

  // Séparateur pare-brise
  ctx.fillStyle = '#0F4C3A';
  ctx.fillRect(cx - 1, cy - 6, 2, 8);

  // Phares
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(cx - 11, cy + 3, 22, 4);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - 8, cy + 5, 1.5, 0, Math.PI * 2);
  ctx.arc(cx + 8, cy + 5, 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Dessine un logo vectoriel de secours si /logoss.jpg n'est pas chargé
 */
function drawLogoFallback(ctx: CanvasRenderingContext2D, lx: number, ly: number, size: number) {
  ctx.save();
  ctx.fillStyle = '#0F4C3A';
  ctx.beginPath();
  ctx.moveTo(lx, ly - size / 2);
  ctx.lineTo(lx + size / 2, ly - size / 4);
  ctx.lineTo(lx + size * 0.38, ly + size * 0.3);
  ctx.lineTo(lx, ly + size / 2);
  ctx.lineTo(lx - size * 0.38, ly + size * 0.3);
  ctx.lineTo(lx - size / 2, ly - size / 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('UJSRV', lx, ly);
  ctx.restore();
}

/**
 * Génère une image PNG haute définition (Blob) STRICTEMENT IDENTIQUE au reçu physique de l'U.J.S.R.V.
 * Produit un rendu au format paysage 1000x700px correspondant exactement à la grille PDF d'impression.
 */
export async function generateReceiptImageBlob(data: ReceiptData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  // Chargement asynchrone des assets images officiels
  const [logoImg, stampImg] = await Promise.all([
    loadImageSafe('/logoss.jpg'),
    loadImageSafe('/cachet-ujsrv.png'),
  ]);

  // 1. Fond blanc pur du ticket
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Filigrane de sécurité continu en mosaïque identique au PDF
  ctx.save();
  ctx.fillStyle = 'rgba(190, 214, 204, 0.45)'; // Même couleur RGB (190, 214, 204)
  ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
  const watermarkUnit = "UCRPPLAO-CI / UCRAO-CI  CSCRAO   ";
  
  const unitWidth = ctx.measureText(watermarkUnit).width;
  const repeatCount = Math.ceil(canvas.width / unitWidth) + 3;
  const fullRowText = watermarkUnit.repeat(repeatCount);
  const stepY = 22; // Même rapport d'échelle de grille
  let rowIndex = 0;
  
  for (let wy = -10; wy <= canvas.height + 20; wy += stepY) {
    const shiftX = (rowIndex % 2 === 1) ? (unitWidth / 2) : 0;
    ctx.fillText(fullRowText, -shiftX - 20, wy);
    rowIndex++;
  }
  ctx.restore();

  // 3. Cadre externe noir fin du ticket (identique à doc.rect dans pdfGenerator)
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 976, 676);

  // =========================================================================
  // EN-TÊTE DU TICKET (Fond clair, double liseré vert / ardoise)
  // =========================================================================
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(13, 13, 974, 145);

  // Double liseré séparateur de l'en-tête (Vert foncé et Ardoise)
  ctx.strokeStyle = '#0F4C3A';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(12, 158);
  ctx.lineTo(988, 158);
  ctx.stroke();

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, 161);
  ctx.lineTo(988, 161);
  ctx.stroke();

  // Logo officiel à gauche de l'en-tête (drawImage si chargé, sinon fallback identique)
  if (logoImg) {
    ctx.drawImage(logoImg, 25, 20, 120, 120);
  } else {
    drawLogoFallback(ctx, 85, 80, 110);
  }

  // Textes d'en-tête
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 20px Helvetica, Arial, sans-serif';
  ctx.fillText('UNION DES JEUNES DE LA SÉCURITÉ', 170, 40);
  ctx.fillText('ROUTIÈRE DE VRIDI', 170, 65);

  ctx.font = 'bold 36px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#0F4C3A';
  ctx.fillText('SURVEILLANCE CAMION', 170, 110);

  ctx.font = 'normal 17px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Zone Portuaire & Industrielle de Vridi — Port-Bouët', 170, 140);

  // Numéro de carnet en haut à droite
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0F4C3A';
  ctx.font = 'bold 15px Helvetica, Arial, sans-serif';
  ctx.fillText(`CARNET : ${data.carnetNumber || 'C-2026-ACTIF'}`, 975, 40);

  // =========================================================================
  // CARTOUCHE NUMÉRO & QR CODE
  // =========================================================================
  const contentTopY = 175;

  // Cartouche Numéro
  ctx.fillStyle = '#f1f5f9';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.fillRect(25, contentTopY, 710, 80);
  ctx.strokeRect(25, contentTopY, 710, 80);

  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.font = 'bold 30px Helvetica, Arial, sans-serif';
  ctx.fillText(`TICKET N° : ${data.ticketNumber}`, 40, contentTopY + 52);

  // QR Code du ticket (En haut à droite)
  const qrX = 770;
  const qrY = 170;
  const qrSize = 200;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.fillRect(qrX, qrY, qrSize, qrSize);
  ctx.strokeRect(qrX, qrY, qrSize, qrSize);

  try {
    const qrUrl = await QRCode.toDataURL(data.qrPayload || data.ticketNumber, {
      margin: 1,
      width: qrSize - 10,
      color: {
        dark: '#0F4C3A',
        light: '#ffffff'
      }
    });
    const qrImgEl = await loadImageSafe(qrUrl);
    if (qrImgEl) {
      ctx.drawImage(qrImgEl, qrX + 5, qrY + 5, qrSize - 10, qrSize - 10);
    }
  } catch (err) {
    console.error('Erreur dessin QR Code ticket:', err);
  }

  // =========================================================================
  // ZONE IMMATRICULATION
  // =========================================================================
  const immY = contentTopY + 90;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3.5;
  ctx.fillRect(25, immY, 710, 80);
  ctx.strokeRect(25, immY, 710, 80);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px Helvetica, Arial, sans-serif';
  ctx.fillText('IMMATRICULATION :', 35, immY + 52);

  // Valeur de l'immatriculation écrite proprement sur la ligne pointillée
  ctx.font = 'bold 38px "Courier New", Courier, monospace';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(data.plateNumber.toUpperCase(), 295, immY + 50);

  // Dessin de la ligne pointillée sous l'immat
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(295, immY + 52);
  ctx.lineTo(715, immY + 52);
  ctx.stroke();
  ctx.setLineDash([]); // Reset line dash

  // =========================================================================
  // ZONE DATE
  // =========================================================================
  const dateY = immY + 88;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3.5;
  ctx.fillRect(25, dateY, 710, 65);
  ctx.strokeRect(25, dateY, 710, 65);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px Helvetica, Arial, sans-serif';
  ctx.fillText('DATE :', 35, dateY + 42);

  // Valeur numérique de la date écrite sur sa ligne
  ctx.font = 'bold 24px "Courier New", Courier, monospace';
  ctx.fillStyle = '#1e293b';
  ctx.fillText(data.dateStr, 130, dateY + 42);

  // Ligne de la date
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(125, dateY + 44);
  ctx.lineTo(715, dateY + 44);
  ctx.stroke();

  // =========================================================================
  // BOÎTES DE VERIFICATION : SIGNATURE & CACHET PHYSIQUE
  // =========================================================================
  const boxY = dateY + 75;
  const boxW = 350;
  const boxH = 140;

  // 1. Signature de l'Agent
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(25, boxY, boxW, boxH);
  ctx.setLineDash([]);

  // Titre signature
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(30, boxY + 2, boxW - 10, 32);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 13px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SIGNATURE AGENT', 25 + boxW / 2, boxY + 23);

  // Signature cursive bleue élégante
  ctx.save();
  ctx.strokeStyle = '#1e3a8a'; // Crayon bleu
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, boxY + 75);
  ctx.bezierCurveTo(110, boxY + 45, 150, boxY + 115, 190, boxY + 65);
  ctx.bezierCurveTo(210, boxY + 45, 230, boxY + 85, 270, boxY + 75);
  ctx.stroke();

  // Nom écrit sous la signature
  ctx.fillStyle = '#334155';
  ctx.font = 'italic bold 15px Helvetica, Arial, sans-serif';
  ctx.fillText(data.agentName, 25 + boxW / 2, boxY + 115);
  ctx.restore();

  // 2. Cachet Officiel
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(385, boxY, boxW, boxH);
  ctx.setLineDash([]);

  // Titre cachet
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(390, boxY + 2, boxW - 10, 32);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 13px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CACHET OFFICIEL', 385 + boxW / 2, boxY + 23);

  // Dessin du cachet officiel (soit image chargée, soit fallback vectoriel)
  const stampCx = 385 + boxW / 2;
  const stampCy = boxY + boxH / 2 + 10;

  if (stampImg) {
    ctx.drawImage(stampImg, stampCx - 50, stampCy - 50, 100, 100);
  } else {
    drawOfficialStampFallback(ctx, stampCx, stampCy, 50);
  }

  // =========================================================================
  // PIED DE PAGE DU TICKET (Contacts officiels)
  // =========================================================================
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0F4C3A'; // Vert officiel
  ctx.font = 'bold 18px Helvetica, Arial, sans-serif';
  ctx.fillText('CONTACTS OFFICIELS : 07 77 91 78 04 / 01 03 31 37 68', 500, 665);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Erreur de conversion canvas en Blob'));
    }, 'image/png');
  });
}
