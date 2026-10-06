import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const PUBLIC_DIR = path.resolve('public');

// Tracé géographique précis de la République de Côte d'Ivoire
const COTE_DIVOIRE_PATH = `
  M 140,50
  C 180,48 230,55 270,52
  C 310,50 350,62 380,72
  C 395,110 405,145 410,185
  C 412,225 395,265 392,305
  C 400,345 415,380 422,410
  C 410,425 390,432 370,438
  C 345,436 330,434 320,435
  C 290,438 270,442 250,445
  C 230,448 210,452 190,455
  C 170,458 150,462 130,465
  C 105,468 90,470 80,470
  C 75,445 85,415 95,395
  C 102,365 85,340 75,325
  C 62,295 58,270 60,248
  C 64,220 78,195 85,170
  C 95,140 102,110 110,88
  Z
`;

// Rosace guillochée mathématique
function generateGuilloche(cx: number, cy: number, R: number, r: number, p: number, steps: number, stroke: string, strokeWidth: number, opacity: number): string {
  let pathStr = '';
  for (let i = 0; i <= steps; i++) {
    const theta = (i * 2 * Math.PI) / steps;
    const x = cx + (R - r) * Math.cos(theta) + p * Math.cos(((R - r) / r) * theta);
    const y = cy + (R - r) * Math.sin(theta) - p * Math.sin(((R - r) / r) * theta);
    if (i === 0) pathStr += `M ${x.toFixed(2)},${y.toFixed(2)}`;
    else pathStr += ` L ${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return `<path d="${pathStr} Z" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linejoin="round"/>`;
}

// Ondes guillochées
function generateWaveRings(cx: number, cy: number, baseR: number, waves: number, amp: number, stroke: string, sw: number, op: number): string {
  const steps = waves * 16;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const angle = (i * 2 * Math.PI) / steps;
    const rad = baseR + amp * Math.sin(waves * angle);
    const x = cx + rad * Math.cos(angle);
    const y = cy + rad * Math.sin(angle);
    if (i === 0) d += `M ${x.toFixed(2)},${y.toFixed(2)}`;
    else d += ` L ${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return `<path d="${d} Z" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>`;
}

export function buildUjpasTicketTemplateSVG(options: { isSpecimen?: boolean } = { isSpecimen: true }): string {
  const width = 2376;
  const height = 1680;

  // Filigrane fond
  let watermarkLines = '';
  const wmText = 'UJPAS UCRAO CSCRAO UCRPPLAO-CI   ';
  for (let y = 60; y < height; y += 42) {
    watermarkLines += `<text x="10" y="${y}" font-family="'Arial Black', monospace" font-size="16" font-weight="900" fill="#0D4A36" opacity="0.04" letter-spacing="3">${wmText.repeat(8)}</text>\n`;
  }

  // Rosaces intaglio de fond de sécurité
  const bgRosette1 = generateGuilloche(width / 2, height / 2, 700, 140, 90, 720, '#F59E0B', 1.0, 0.08);
  const bgRosette2 = generateGuilloche(width / 2, height / 2, 650, 130, 85, 720, '#10B981', 1.0, 0.08);

  // Rosace inférieure VALIDATION UJPAS
  const rosetteCx = 1188;
  const rosetteCy = 1320;
  let rosettePatt = '';
  for (let r = 180; r >= 130; r -= 8) {
    rosettePatt += generateWaveRings(rosetteCx, rosetteCy, r, 32, 6, '#0D4A36', 1.8, 0.65);
  }
  for (let r = 175; r >= 135; r -= 10) {
    rosettePatt += generateWaveRings(rosetteCx, rosetteCy, r, 24, 5, '#D97706', 1.2, 0.55);
  }

  // 8 cases d'immatriculation
  const boxWidth = 92;
  const boxHeight = 115;
  const boxGap = 20;
  const totalBoxesW = 8 * boxWidth + 7 * boxGap;
  const boxesStartX = (width - totalBoxesW) / 2;
  const boxesY = 770;
  let immatBoxes = '';
  for (let i = 0; i < 8; i++) {
    const bx = boxesStartX + i * (boxWidth + boxGap);
    immatBoxes += `<rect x="${bx}" y="${boxesY}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="#FFFFFF" stroke="#0D4A36" stroke-width="4.5"/>\n`;
  }

  // Sceau rond UJPAS en haut à droite
  const sealCx = 1970;
  const sealCy = 590;
  const sealR = 230;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <!-- Filtres d'ombre pour relief officiel -->
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0F172A" flood-opacity="0.25"/>
    </filter>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#D97706" flood-opacity="0.4"/>
    </filter>

    <!-- Dégradé Ivoire Sécurité -->
    <linearGradient id="ivoryBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FCFBF7"/>
      <stop offset="50%" stop-color="#F7F4EB"/>
      <stop offset="100%" stop-color="#F2EFE5"/>
    </linearGradient>

    <!-- Dégradé ruban gauche (Orange -> Blanc -> Vert) -->
    <linearGradient id="flagLeft" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EA580C"/>
      <stop offset="48%" stop-color="#F97316"/>
      <stop offset="50%" stop-color="#FFFFFF"/>
      <stop offset="52%" stop-color="#16A34A"/>
      <stop offset="100%" stop-color="#0D4A36"/>
    </linearGradient>

    <!-- Tracé du texte circulaire du sceau -->
    <path id="sealArcTop" d="M ${sealCx - 185},${sealCy} A 185,185 0 1,1 ${sealCx + 185},${sealCy}" fill="none"/>
    <path id="sealArcBottom" d="M ${sealCx + 185},${sealCy} A 185,185 0 0,1 ${sealCx - 185},${sealCy}" fill="none"/>
  </defs>

  <!-- 1. FOND DE SÉCURITÉ PAPIER MONNAIE -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#ivoryBg)"/>

  <!-- Cadre extérieur avec ornement guilloché -->
  <rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="16" fill="none" stroke="#0D4A36" stroke-width="4"/>
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="12" fill="none" stroke="#D97706" stroke-width="1.8" opacity="0.6"/>

  <!-- 2. TAPISSAGE DU FILIGRANE DE SÉCURITÉ -->
  ${watermarkLines}
  ${bgRosette1}
  ${bgRosette2}

  <!-- 3. RUBANS COURBÉS DU DRAPEAU NATIONAL DE CÔTE D'IVOIRE DANS LES ANGLES SUPÉRIEURS -->
  <!-- Angle supérieur gauche : Orange / Blanc / Vert -->
  <g id="ribbonTopLeft">
    <path d="M 0,0 L 520,0 C 440,80 320,180 0,310 Z" fill="#EA580C"/>
    <path d="M 0,105 C 190,100 330,170 410,230 L 440,190 C 350,130 190,60 0,65 Z" fill="#FFFFFF"/>
    <path d="M 0,165 C 210,160 340,240 430,310 L 400,345 C 310,270 180,200 0,205 Z" fill="#0D4A36"/>
  </g>

  <!-- Angle supérieur droit : Vert / Blanc / Orange symétrique -->
  <g id="ribbonTopRight">
    <path d="M ${width},0 L ${width - 520},0 C ${width - 440},80 ${width - 320},180 ${width},310 Z" fill="#0D4A36"/>
    <path d="M ${width},105 C ${width - 190},100 ${width - 330},170 ${width - 410},230 L ${width - 440},190 C ${width - 350},130 ${width - 190},60 ${width},65 Z" fill="#FFFFFF"/>
    <path d="M ${width},165 C ${width - 210},160 ${width - 340},240 ${width - 430},310 L ${width - 400},345 C ${width - 310},270 ${width - 180},200 ${width},205 Z" fill="#EA580C"/>
  </g>

  <!-- 4. EN-TÊTE OFFICIEL UJPAS -->
  <g id="headerText" text-anchor="middle">
    <!-- Ligne 1 : Titre complet de l'organisation -->
    <text x="1188" y="150" font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="37" fill="#0D4A36" letter-spacing="1.5">
      UNION DES JEUNES DU PORT POUR L'ASSISTANCE ET LA SÉCURITÉ (UJPAS)
    </text>

    <!-- Filet supérieur fin avec losanges dorés -->
    <line x1="590" y1="180" x2="1140" y2="180" stroke="#0D4A36" stroke-width="2"/>
    <polygon points="1188,172 1196,180 1188,188 1180,180" fill="#EA580C"/>
    <line x1="1236" y1="180" x2="1786" y2="180" stroke="#0D4A36" stroke-width="2"/>

    <!-- Ligne 2 : Mission officielle -->
    <text x="1188" y="240" font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="31" fill="#0D4A36" letter-spacing="2">
      SURVEILLANCE &amp; LOGISTIQUE - PORT D'ABIDJAN
    </text>

    <!-- Double séparateur officiel avec losange orange central -->
    <line x1="600" y1="270" x2="1140" y2="270" stroke="#0D4A36" stroke-width="3"/>
    <line x1="600" y1="277" x2="1140" y2="277" stroke="#EA580C" stroke-width="2"/>
    <polygon points="1188,262 1200,274 1188,286 1176,274" fill="#EA580C" stroke="#0D4A36" stroke-width="2"/>
    <line x1="1236" y1="270" x2="1776" y2="270" stroke="#0D4A36" stroke-width="3"/>
    <line x1="1236" y1="277" x2="1776" y2="277" stroke="#EA580C" stroke-width="2"/>

    <!-- Ligne 3 : Zone portuaire et industrielle -->
    <text x="1188" y="345" font-family="'Segoe UI', 'Helvetica', Arial, sans-serif" font-weight="700" font-size="30" fill="#0D4A36" letter-spacing="0.5">
      Zone Portuaire &amp; Industrielle du Port Autonome d'Abidjan
    </text>
  </g>

  <!-- 5. SECTION GAUCHE : NUMÉRO VRDCH, MICRO-IMPRESSIONS ET SIGNATURE -->
  <g id="leftSection">
    <!-- Cartouche bleu : N° VRDCH-000001 -->
    <rect x="175" y="490" width="420" height="110" rx="22" fill="#E0F2FE" stroke="#0284C7" stroke-width="4.5"/>
    <text x="385" y="562" font-family="'Arial Black', 'Impact', monospace" font-weight="900" font-size="36" fill="#0369A1" text-anchor="middle" letter-spacing="2">
      N° VRDCH-000001
    </text>

    <!-- 5 Lignes de micro-impression UJPAS UCRAO CSCRAO UCRPPLAO-CI -->
    <g font-family="'Arial Black', monospace" font-weight="900" font-size="17" fill="#0D4A36" letter-spacing="1.5">
      <text x="205" y="670">UJPAS UCRAO CSCRAO UCRPPLAO-CI</text>
      <text x="205" y="760">UJPAS UCRAO CSCRAO UCRPPLAO-CI</text>
      <text x="205" y="850">UJPAS UCRAO CSCRAO UCRPPLAO-CI</text>
      <text x="205" y="940">UJPAS UCRAO CSCRAO UCRPPLAO-CI</text>
      <text x="205" y="1030">UJPAS UCRAO CSCRAO UCRPPLAO-CI</text>
    </g>

    <!-- Cadre en pointillés : SIGNATURE AGENT UJPAS -->
    <rect x="190" y="1120" width="510" height="270" rx="12" fill="#FFFFFF" fill-opacity="0.8" stroke="#0D4A36" stroke-width="3" stroke-dasharray="10,8"/>
    <text x="445" y="1165" font-family="'Arial Black', sans-serif" font-weight="900" font-size="22" fill="#0D4A36" text-anchor="middle" letter-spacing="1">
      SIGNATURE AGENT UJPAS
    </text>
  </g>

  <!-- 6. SECTION CENTRALE : DATE, N° IMMATRICULATION, NOM CHAUFFEUR & ROSETTE -->
  <g id="centerSection">
    <!-- DATE -->
    <text x="1160" y="535" font-family="'Arial Black', sans-serif" font-weight="900" font-size="29" fill="#0D4A36" text-anchor="middle" letter-spacing="2">
      DATE :  _ _ _ _ _ _  /  _ _ _ _ _ _  / 2026
    </text>

    <!-- N° IMMATRICULATION CAMION -->
    <text x="1160" y="700" font-family="'Arial Black', sans-serif" font-weight="900" font-size="28" fill="#0D4A36" text-anchor="middle" letter-spacing="1.5">
      N° IMMATRICULATION CAMION
    </text>

    <!-- 8 cases normalisées -->
    ${immatBoxes}

    <!-- NOM DU CHAUFFEUR -->
    <text x="1160" y="975" font-family="'Arial Black', sans-serif" font-weight="900" font-size="27" fill="#0D4A36" text-anchor="middle" letter-spacing="1.5">
      NOM DU CHAUFFEUR
    </text>

    <!-- Ligne de signature pointillée -->
    <line x1="675" y1="1040" x2="1645" y2="1040" stroke="#0D4A36" stroke-width="4.5" stroke-dasharray="8,8"/>

    <!-- Rosace guillochée de validation UJPAS -->
    <g id="validationRosette">
      ${rosettePatt}
      <circle cx="${rosetteCx}" cy="${rosetteCy}" r="130" fill="#FFFFFF" stroke="#0D4A36" stroke-width="4.5"/>
      <circle cx="${rosetteCx}" cy="${rosetteCy}" r="118" fill="none" stroke="#D97706" stroke-width="2" stroke-dasharray="6,4"/>

      <!-- Étoiles dorées -->
      <g fill="#D97706" transform="translate(${rosetteCx}, ${rosetteCy - 68})">
        <polygon points="0,-10 3,-2 11,-2 5,3 8,11 0,6 -8,11 -5,3 -11,-2 -3,-2"/>
        <polygon points="-28,-8 -25,-1 -17,-1 -23,4 -20,12 -28,7 -36,12 -33,4 -39,-1 -31,-1"/>
        <polygon points="28,-8 31,-1 39,-1 33,4 36,12 28,7 20,12 23,4 17,-1 25,-1"/>
      </g>

      <!-- Ancre de marine dorée -->
      <g transform="translate(${rosetteCx}, ${rosetteCy - 40}) scale(0.7)">
        <circle cx="0" cy="-24" r="10" fill="none" stroke="#D97706" stroke-width="4.5"/>
        <line x1="0" y1="-14" x2="0" y2="35" stroke="#D97706" stroke-width="7" stroke-linecap="round"/>
        <line x1="-22" y1="-4" x2="22" y2="-4" stroke="#D97706" stroke-width="5" stroke-linecap="round"/>
        <path d="M -26,18 C -18,45 18,45 26,18" fill="none" stroke="#D97706" stroke-width="5" stroke-linecap="round"/>
        <polygon points="-26,18 -32,10 -20,14" fill="#D97706"/>
        <polygon points="26,18 32,10 20,14" fill="#D97706"/>
      </g>

      <!-- Mention VALIDATION UJPAS -->
      <text x="${rosetteCx}" y="${rosetteCy + 25}" font-family="'Arial Black', sans-serif" font-weight="900" font-size="28" fill="#0D4A36" text-anchor="middle" letter-spacing="2">
        VALIDATION
      </text>
      <text x="${rosetteCx}" y="${rosetteCy + 60}" font-family="'Arial Black', sans-serif" font-weight="900" font-size="28" fill="#0D4A36" text-anchor="middle" letter-spacing="4">
        UJPAS
      </text>

      <!-- Ornements inférieurs -->
      <path d="M ${rosetteCx - 40},${rosetteCy + 85} Q ${rosetteCx},${rosetteCy + 95} ${rosetteCx + 40},${rosetteCy + 85}" fill="none" stroke="#D97706" stroke-width="3"/>
    </g>
  </g>

  <!-- 7. SECTION DROITE : GRAND SCEAU OFFICIEL UJPAS & QR CODE -->
  <g id="rightSection">
    <!-- ==================== GRAND SCEAU OFFICIEL ==================== -->
    <g id="officialSeal">
      <!-- Ombre et double cercle extérieur doré -->
      <circle cx="${sealCx}" cy="${sealCy}" r="${sealR}" fill="#FFFFFF" stroke="#D97706" stroke-width="8" filter="url(#softShadow)"/>
      <circle cx="${sealCx}" cy="${sealCy}" r="${sealR - 10}" fill="#0F2942" stroke="#FFFFFF" stroke-width="3"/>

      <!-- TEXTE CIRCULAIRE SUPÉRIEUR -->
      <text font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="19" fill="#FFFFFF" letter-spacing="2.8">
        <textPath href="#sealArcTop" startOffset="50%" text-anchor="middle">
          UNION DES JEUNES DU PORT POUR L'ASSISTANCE ET LA SÉCURITÉ
        </textPath>
      </text>

      <!-- TEXTE CIRCULAIRE INFÉRIEUR -->
      <text font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="20" fill="#FFFFFF" letter-spacing="3.5">
        <textPath href="#sealArcBottom" startOffset="50%" text-anchor="middle">
          ABIDJAN, CÔTE D'IVOIRE
        </textPath>
      </text>

      <!-- Disque central blanc & doré -->
      <circle cx="${sealCx}" cy="${sealCy}" r="${sealR - 60}" fill="#FFFFFF" stroke="#D97706" stroke-width="5"/>

      <!-- Symbole des deux mains qui se serrent (Fraternité / Union) -->
      <g transform="translate(${sealCx}, ${sealCy - 100}) scale(0.65)">
        <!-- Poignet gauche (orange) -->
        <rect x="-85" y="-18" width="35" height="36" rx="6" fill="#EA580C" stroke="#7C2D12" stroke-width="3"/>
        <line x1="-50" y1="-18" x2="-50" y2="18" stroke="#FFFFFF" stroke-width="3"/>
        <!-- Poignet droit (vert) -->
        <rect x="50" y="-18" width="35" height="36" rx="6" fill="#15803D" stroke="#0D4A36" stroke-width="3"/>
        <line x1="50" y1="-18" x2="50" y2="18" stroke="#FFFFFF" stroke-width="3"/>
        <!-- Mains entrelacées -->
        <path d="M -50,-10 C -30,-22 0,-15 15, -4 C 30,8 45,5 50,-10 L 50,15 C 30,25 5,20 -15,10 C -30,0 -45,15 -50,15 Z" fill="#FBBF24" stroke="#B45309" stroke-width="4"/>
        <path d="M -15,-5 Q 0,8 15,2" fill="none" stroke="#78350F" stroke-width="3"/>
        <path d="M -10,5 Q 5,16 20,8" fill="none" stroke="#78350F" stroke-width="3"/>
      </g>

      <!-- Silhouette tricolore de la Côte d'Ivoire au centre -->
      <g transform="translate(${sealCx - 95}, ${sealCy - 80}) scale(0.42)">
        <clipPath id="sealCiClip">
          <path d="${COTE_DIVOIRE_PATH}"/>
        </clipPath>
        <path d="${COTE_DIVOIRE_PATH}" fill="#FFFFFF" stroke="#0D4A36" stroke-width="8"/>
        <g clip-path="url(#sealCiClip)">
          <rect x="0" y="0" width="166" height="500" fill="#EA580C"/>
          <rect x="166" y="0" width="168" height="500" fill="#FFFFFF"/>
          <rect x="334" y="0" width="166" height="500" fill="#15803D"/>
        </g>
        <path d="${COTE_DIVOIRE_PATH}" fill="none" stroke="#D97706" stroke-width="6"/>
      </g>

      <!-- Camion moderne de transport portuaire (Cabine orange & conteneur) -->
      <g transform="translate(${sealCx}, ${sealCy + 15}) scale(0.72)">
        <!-- Remorque / Conteneur blanc avec lignes -->
        <rect x="-80" y="-45" width="65" height="60" rx="4" fill="#FFFFFF" stroke="#0F2942" stroke-width="4"/>
        <line x1="-70" y1="-45" x2="-70" y2="15" stroke="#0F2942" stroke-width="2"/>
        <line x1="-55" y1="-45" x2="-55" y2="15" stroke="#0F2942" stroke-width="2"/>
        <line x1="-40" y1="-45" x2="-40" y2="15" stroke="#0F2942" stroke-width="2"/>
        <line x1="-25" y1="-45" x2="-25" y2="15" stroke="#0F2942" stroke-width="2"/>
        
        <!-- Cabine de camion orange vif -->
        <path d="M -15,-40 L 40,-40 C 45,-40 55,-25 60,-10 L 65,15 L -15,15 Z" fill="#EA580C" stroke="#7C2D12" stroke-width="4"/>
        <!-- Pare-brise & vitre latérale -->
        <path d="M 0,-34 L 35,-34 C 42,-34 50,-22 52,-12 L 0,-12 Z" fill="#38BDF8" stroke="#0F2942" stroke-width="3"/>
        <!-- Calandre chromée / noire -->
        <rect x="35" y="-6" width="30" height="18" rx="3" fill="#1E293B" stroke="#0F2942" stroke-width="2"/>
        <line x1="40" y1="-2" x2="60" y2="-2" stroke="#FFFFFF" stroke-width="2"/>
        <line x1="40" y1="3" x2="60" y2="3" stroke="#FFFFFF" stroke-width="2"/>
        <line x1="40" y1="8" x2="60" y2="8" stroke="#FFFFFF" stroke-width="2"/>
        <!-- Phares avant -->
        <circle cx="58" cy="9" r="4" fill="#FDE047" stroke="#78350F" stroke-width="1.5"/>
        <circle cx="36" cy="9" r="4" fill="#FDE047" stroke="#78350F" stroke-width="1.5"/>
        <!-- Roues -->
        <circle cx="-60" cy="18" r="14" fill="#0F172A"/>
        <circle cx="-60" cy="18" r="7" fill="#94A3B8"/>
        <circle cx="-35" cy="18" r="14" fill="#0F172A"/>
        <circle cx="-35" cy="18" r="7" fill="#94A3B8"/>
        <circle cx="20" cy="18" r="14" fill="#0F172A"/>
        <circle cx="20" cy="18" r="7" fill="#94A3B8"/>
        <circle cx="48" cy="18" r="14" fill="#0F172A"/>
        <circle cx="48" cy="18" r="7" fill="#94A3B8"/>
      </g>

      <!-- Écusson maritime U.J.P.A.S. avec ancre -->
      <g transform="translate(${sealCx}, ${sealCy + 82})">
        <!-- Badge bleu marine -->
        <path d="M -38,-12 L 38,-12 C 38,15 20,32 0,40 C -20,32 -38,15 -38,-12 Z" fill="#0F2942" stroke="#D97706" stroke-width="3"/>
        <!-- Ancre maritime dorée au centre de l'écusson -->
        <g transform="translate(0, 14) scale(0.4)" stroke="#FDE047" stroke-width="4.5" fill="none">
          <circle cx="0" cy="-22" r="8"/>
          <line x1="0" y1="-14" x2="0" y2="28" stroke-width="6"/>
          <line x1="-16" y1="-6" x2="16" y2="-6"/>
          <path d="M -20,12 C -12,32 12,32 20,12"/>
        </g>
        <!-- Sigle U.J.P.A.S. -->
        <text x="0" y="2" font-family="'Arial Black', sans-serif" font-weight="900" font-size="10.5" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">
          U.J.P.A.S.
        </text>
      </g>
    </g>

    <!-- ==================== CADRE BLANC QR CODE OFFICIEL ==================== -->
    <g id="qrCodeFrame">
      <rect x="1820" y="990" width="320" height="320" rx="16" fill="#FFFFFF" stroke="#0D4A36" stroke-width="5" filter="url(#softShadow)"/>
      
      <!-- Motif de QR Code haute densité représentatif -->
      <!-- Position pattern Haut Gauche -->
      <rect x="1850" y="1020" width="60" height="60" fill="#0D4A36"/>
      <rect x="1860" y="1030" width="40" height="40" fill="#FFFFFF"/>
      <rect x="1870" y="1040" width="20" height="20" fill="#0D4A36"/>

      <!-- Position pattern Haut Droit -->
      <rect x="2050" y="1020" width="60" height="60" fill="#0D4A36"/>
      <rect x="2060" y="1030" width="40" height="40" fill="#FFFFFF"/>
      <rect x="2070" y="1040" width="20" height="20" fill="#0D4A36"/>

      <!-- Position pattern Bas Gauche -->
      <rect x="1850" y="1220" width="60" height="60" fill="#0D4A36"/>
      <rect x="1860" y="1230" width="40" height="40" fill="#FFFFFF"/>
      <rect x="1870" y="1240" width="20" height="20" fill="#0D4A36"/>

      <!-- Grille de modules représentative -->
      <rect x="1930" y="1030" width="16" height="16" fill="#0D4A36"/>
      <rect x="1960" y="1030" width="16" height="16" fill="#0D4A36"/>
      <rect x="2000" y="1030" width="16" height="16" fill="#0D4A36"/>
      <rect x="1930" y="1060" width="16" height="16" fill="#0D4A36"/>
      <rect x="1980" y="1060" width="16" height="16" fill="#0D4A36"/>
      <rect x="2000" y="1090" width="16" height="16" fill="#0D4A36"/>
      <rect x="1860" y="1120" width="16" height="16" fill="#0D4A36"/>
      <rect x="1890" y="1150" width="16" height="16" fill="#0D4A36"/>
      <rect x="2060" y="1120" width="16" height="16" fill="#0D4A36"/>
      <rect x="2090" y="1150" width="16" height="16" fill="#0D4A36"/>
      <rect x="1930" y="1230" width="16" height="16" fill="#0D4A36"/>
      <rect x="1970" y="1230" width="16" height="16" fill="#0D4A36"/>
      <rect x="2010" y="1230" width="16" height="16" fill="#0D4A36"/>
      <rect x="2050" y="1230" width="16" height="16" fill="#0D4A36"/>
      <rect x="1930" y="1260" width="16" height="16" fill="#0D4A36"/>
      <rect x="1970" y="1260" width="16" height="16" fill="#0D4A36"/>
      <rect x="2030" y="1260" width="16" height="16" fill="#0D4A36"/>

      <!-- BADGE CENTRAL UJPAS (ORANGE) -->
      <rect x="1930" y="1100" width="100" height="100" rx="16" fill="#EA580C" stroke="#FFFFFF" stroke-width="4"/>
      <text x="1980" y="1160" font-family="'Arial Black', sans-serif" font-weight="900" font-size="22" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">
        UJPAS
      </text>
    </g>
  </g>

  <!-- 8. MENTIONS VERTICALES DE SÉCURITÉ -->
  <text x="65" y="840" font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="24" fill="#0D4A36" opacity="0.3" text-anchor="middle" transform="rotate(-90 65 840)" letter-spacing="1.5">PROPRIÉTÉ DE L'UJPAS</text>
  <text x="2311" y="840" font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="24" fill="#0D4A36" opacity="0.3" text-anchor="middle" transform="rotate(90 2311 840)" letter-spacing="1.5">PROPRIÉTÉ DE L'UJPAS</text>

  <!-- 9. BANDEAU INFÉRIEUR OFFICIEL DE CONTACT -->
  <rect x="0" y="1560" width="${width}" height="120" fill="#0D4A36"/>
  <text x="1188" y="1634" font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="25" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">
    POUR TOUTE VÉRIFICATION, CONTACTEZ L'UJPAS : <tspan font-size="32" font-weight="900" fill="#FFFFFF">01 03 31 37 68 / 07 77 91 78 04</tspan> | EMAIL : CONTACT@PORTUS-UJPAS.ONLINE
  </text>
</svg>
`;
}

async function run() {
  console.log('🚀 Génération du modèle de ticket officiel HD UJPAS...');

  const svgContent = buildUjpasTicketTemplateSVG({ isSpecimen: true });
  const svgPath = path.join(PUBLIC_DIR, 'ticket_bg_ujpas_hd.svg');
  fs.writeFileSync(svgPath, svgContent, 'utf-8');
  console.log('✅ SVG généré :', svgPath);

  // Conversion en JPEG haute définition (fond de référence officiel 2376x1680)
  const jpgPath = path.join(PUBLIC_DIR, 'ticket_bg_ujpas_hd.jpg');
  await sharp(Buffer.from(svgContent))
    .jpeg({ quality: 96, mozjpeg: true })
    .toFile(jpgPath);
  console.log('✅ ticket_bg_ujpas_hd.jpg généré :', jpgPath);

  // Version PNG
  const pngPath = path.join(PUBLIC_DIR, 'ticket_bg_ujpas_hd.png');
  await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(pngPath);
  console.log('✅ ticket_bg_ujpas_hd.png généré :', pngPath);

  // Rétrocompatibilité ticket-ujpaa-specimen
  const oldSpecimenPng = path.join(PUBLIC_DIR, 'ticket-ujpaa-specimen.png');
  fs.copyFileSync(pngPath, oldSpecimenPng);
  console.log('✅ ticket-ujpaa-specimen.png synchronisé pour rétrocompatibilité.');
}

run().catch((err) => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
