import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * Script officiel de génération des assets UJPAA — Côte d'Ivoire
 * 
 * Génère :
 * 1. Emblème officiel institutionnel UJPAA (Haute définition raster avec texture d'encre imprimée,
 *    silhouette géographique de la Côte d'Ivoire, couleurs nationales Orange-Blanc-Vert,
 *    rosaces guillochées, ancre maritime & port d'Abidjan).
 * 2. Cachet officiel de validation UJPAA (Festonné, encre verte et orange, fond transparent).
 * 3. Modèle de ticket officiel de sécurité UJPAA (Format physique et numérique conforme à 100% :
 *    - Titre : UNION DES JEUNES DU PORT AUTONOME D'ABIDJAN (UJPAA)
 *    - Sous-titre : SURVEILLANCE & LOGISTIQUE - PORT D'ABIDJAN
 *    - Second sous-titre : Zone Industrielle & Zone Portuaire d'Abidjan
 *    - N° VRDCH, DATE, N° IMMATRICULATION CAMION, NOM DU CHAUFFEUR, SIGNATURE AGENT UJPAA, VALIDATION UJPAA
 *    - Filigrane de sécurité EXCLUSIF avec UNIQUEMENT : UJPAA, UCRAO, CSCRAO, UCRPPLAO-CI répété en diagonale
 *    - Talon détachable droit : N° VRDCH, IMMATRICULATION, DATE, contact@portus-ujpaa.online, Emblème UJPAA
 *    - QR code haute densité
 * 4. Silhouette vectorielle officielle de la Côte d'Ivoire avec repère Port d'Abidjan.
 */

const PUBLIC_DIR = path.resolve('public');
const ASSETS_DIR = path.resolve('public/assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Tracé géographique précis de la République de Côte d'Ivoire
export const COTE_DIVOIRE_PATH = `
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

// 1. GÉNÉRATION DE L'EMBLÈME OFFICIEL INSTITUTIONNEL UJPAA
// Style raster/gravure d'imprimerie officielle avec texture de papier et d'encre authentique
function generateUjpaaEmblemSVG(): string {
  // Génération de rayons guillochés ornementaux
  let guillocheRays = '';
  for (let i = 0; i < 72; i++) {
    const angle = (i * 360) / 72;
    guillocheRays += `<line x1="500" y1="500" x2="500" y2="40" transform="rotate(${angle} 500 500)" stroke="#F59E0B" stroke-width="1.2" opacity="0.35"/>`;
  }

  // Petites hachures de gravure
  let engravedHatching = '';
  for (let y = 180; y <= 820; y += 8) {
    engravedHatching += `<line x1="200" y1="${y}" x2="800" y2="${y}" stroke="#062317" stroke-width="0.75" opacity="0.12"/>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <defs>
    <!-- Filtres d'ombre et de relief institutionnel -->
    <filter id="emblemShadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#02140d" flood-opacity="0.5"/>
    </filter>
    <filter id="goldShine" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#78350f" flood-opacity="0.4"/>
    </filter>
    <filter id="embossFilter">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise"/>
      <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.15 0" in="noise" result="coloredNoise"/>
      <feComposite operator="in" in2="SourceGraphic"/>
    </filter>

    <!-- Dégradés officiels Côte d'Ivoire (Orange, Blanc, Vert Forêt) -->
    <linearGradient id="ivoryOrange" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF7A29"/>
      <stop offset="50%" stop-color="#EA580C"/>
      <stop offset="100%" stop-color="#C2410C"/>
    </linearGradient>

    <linearGradient id="ivoryGreen" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#15803D"/>
      <stop offset="50%" stop-color="#0D4A36"/>
      <stop offset="100%" stop-color="#062D20"/>
    </linearGradient>

    <linearGradient id="goldMetallic" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="25%" stop-color="#F59E0B"/>
      <stop offset="50%" stop-color="#FEF3C7"/>
      <stop offset="75%" stop-color="#D97706"/>
      <stop offset="100%" stop-color="#B45309"/>
    </linearGradient>

    <linearGradient id="pearlWhite" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F1F5F9"/>
    </linearGradient>

    <!-- Chemin circulaire pour le texte institutionnel supérieur -->
    <path id="circleTextArcTop" d="M 120,500 A 380,380 0 1,1 880,500" fill="none"/>
    <path id="circleTextArcBottom" d="M 860,500 A 360,360 0 0,1 140,500" fill="none"/>

    <!-- Clip pour la carte de Côte d'Ivoire -->
    <clipPath id="mapClip">
      <path d="${COTE_DIVOIRE_PATH}" transform="translate(250, 220) scale(1.05)"/>
    </clipPath>
  </defs>

  <!-- 1. BASE DU SCEAU : FOND CIRCULAIRE AVEC ANNEAU EXTÉRIEUR VERT & DORÉ -->
  <g filter="url(#emblemShadow)">
    <!-- Bordure dentelée guillochée externe -->
    <circle cx="500" cy="500" r="475" fill="#0A3829" stroke="url(#goldMetallic)" stroke-width="6"/>
    
    <!-- Rayons guillochés gravés -->
    <g>${guillocheRays}</g>

    <!-- Anneau extérieur principal vert foncé -->
    <circle cx="500" cy="500" r="448" fill="url(#ivoryGreen)" stroke="url(#goldMetallic)" stroke-width="4"/>
    <circle cx="500" cy="500" r="442" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.6"/>

    <!-- Anneau intérieur parchemin / ivoire -->
    <circle cx="500" cy="500" r="340" fill="url(#pearlWhite)" stroke="url(#goldMetallic)" stroke-width="6"/>
  </g>

  <!-- 2. TEXTE CIRCULAIRE GRAVÉ SUPÉRIEUR (COURONNE INSTITUTIONNELLE) -->
  <text font-family="'Arial Black', 'Impact', 'Segoe UI', sans-serif" font-weight="900" font-size="33.5" fill="#FFFFFF" letter-spacing="3.5" filter="url(#goldShine)">
    <textPath href="#circleTextArcTop" startOffset="50%" text-anchor="middle">
      UNION DES JEUNES DU PORT AUTONOME D'ABIDJAN
    </textPath>
  </text>

  <!-- Étoiles ornementales nationales séparatrices sur l'anneau vert -->
  <g fill="#FBBF24" filter="url(#goldShine)">
    <polygon points="125,500 131,515 147,515 134,524 139,539 125,529 111,539 116,524 103,515 119,515"/>
    <polygon points="875,500 881,515 897,515 884,524 889,539 875,529 861,539 866,524 853,515 869,515"/>
  </g>

  <!-- TEXTE CIRCULAIRE GRAVÉ INFÉRIEUR -->
  <text font-family="'Arial Black', 'Segoe UI', sans-serif" font-weight="900" font-size="24" fill="#FDE68A" letter-spacing="5">
    <textPath href="#circleTextArcBottom" startOffset="50%" text-anchor="middle">
      SURVEILLANCE &amp; LOGISTIQUE • RÉPUBLIQUE DE CÔTE D'IVOIRE
    </textPath>
  </text>

  <!-- 3. GRAVURES DE FOND DANS LE DISQUE INTÉRIEUR -->
  <g>
    <!-- Trame de fines hachures d'imprimerie -->
    <g>${engravedHatching}</g>

    <!-- Anneau concentrique de sécurité intérieur -->
    <circle cx="500" cy="500" r="320" fill="none" stroke="#EA580C" stroke-width="2" stroke-dasharray="4,4" opacity="0.6"/>
  </g>

  <!-- 4. CARTE OFFICIELLE DE CÔTE D'IVOIRE (ENCRE TRICOLORE ORANGE / BLANC / VERT) -->
  <g transform="translate(250, 220) scale(1.05)" filter="url(#emblemShadow)">
    <!-- Silhouette Côte d'Ivoire de fond -->
    <path d="${COTE_DIVOIRE_PATH}" fill="#FFFFFF" stroke="#0D4A36" stroke-width="8"/>

    <!-- Bande Orange (Tiers Ouest) -->
    <g clip-path="url(#mapClip)">
      <rect x="0" y="0" width="195" height="500" fill="url(#ivoryOrange)" opacity="0.85"/>
      <rect x="195" y="0" width="110" height="500" fill="#FFFFFF" opacity="0.95"/>
      <rect x="305" y="0" width="200" height="500" fill="url(#ivoryGreen)" opacity="0.85"/>
      
      <!-- Hachures topographiques sur la carte -->
      <line x1="50" y1="50" x2="450" y2="450" stroke="#062D20" stroke-width="1.5" opacity="0.25"/>
      <line x1="90" y1="50" x2="490" y2="450" stroke="#062D20" stroke-width="1.5" opacity="0.25"/>
      <line x1="10" y1="50" x2="410" y2="450" stroke="#062D20" stroke-width="1.5" opacity="0.25"/>
    </g>

    <!-- Contour renforcé de la carte avec liseré or -->
    <path d="${COTE_DIVOIRE_PATH}" fill="none" stroke="url(#goldMetallic)" stroke-width="5"/>
    <path d="${COTE_DIVOIRE_PATH}" fill="none" stroke="#0D4A36" stroke-width="2.5"/>

    <!-- Point géographique précis du PORT AUTONOME D'ABIDJAN (Lagune Ébrié / Canal de Vridi) -->
    <circle cx="320" cy="435" r="16" fill="#EA580C" stroke="#FFFFFF" stroke-width="4"/>
    <circle cx="320" cy="435" r="7" fill="#FBBF24"/>
    <!-- Vagues maritimes stylisées à Abidjan -->
    <path d="M 285,455 Q 320,445 355,455 Q 390,465 425,455" fill="none" stroke="#0D4A36" stroke-width="3"/>
  </g>

  <!-- 5. ANCRE DE MARINE & LAURIERS DU PORT D'ABIDJAN EN SURIMPRESSION HÉRALDIQUE -->
  <g transform="translate(500, 480)" filter="url(#emblemShadow)">
    <!-- Couronne de lauriers de sécurité institutionnelle -->
    <!-- Branche gauche -->
    <path d="M -160,80 C -210,0 -200,-120 -110,-190 C -140,-120 -120,-10 -90,40" fill="none" stroke="#0D4A36" stroke-width="6"/>
    <!-- Branche droite -->
    <path d="M 160,80 C 210,0 200,-120 110,-190 C 140,-120 120,-10 90,40" fill="none" stroke="#0D4A36" stroke-width="6"/>

    <!-- Feuilles de laurier ornementales -->
    <g fill="#15803D" stroke="#0A3829" stroke-width="1.5">
      <ellipse cx="-165" cy="-20" rx="16" ry="8" transform="rotate(-30 -165 -20)"/>
      <ellipse cx="-145" cy="-80" rx="16" ry="8" transform="rotate(-50 -145 -80)"/>
      <ellipse cx="-100" cy="-140" rx="16" ry="8" transform="rotate(-70 -100 -140)"/>
      
      <ellipse cx="165" cy="-20" rx="16" ry="8" transform="rotate(30 165 -20)"/>
      <ellipse cx="145" cy="-80" rx="16" ry="8" transform="rotate(50 145 -80)"/>
      <ellipse cx="100" cy="-140" rx="16" ry="8" transform="rotate(70 100 -140)"/>
    </g>

    <!-- Grande ancre de marine en métal doré et bronze gravé -->
    <!-- Anneau supérieur (Cigale) -->
    <circle cx="0" cy="-160" r="28" fill="none" stroke="url(#goldMetallic)" stroke-width="12"/>
    <circle cx="0" cy="-160" r="16" fill="none" stroke="#0A3829" stroke-width="3"/>

    <!-- Verge centrale de l'ancre -->
    <line x1="0" y1="-132" x2="0" y2="120" stroke="url(#goldMetallic)" stroke-width="20" stroke-linecap="round"/>
    <line x1="0" y1="-132" x2="0" y2="120" stroke="#78350F" stroke-width="3" stroke-linecap="round"/>

    <!-- Jas transversal de l'ancre -->
    <line x1="-75" y1="-95" x2="75" y2="-95" stroke="url(#goldMetallic)" stroke-width="14" stroke-linecap="round"/>
    <circle cx="-75" cy="-95" r="10" fill="url(#goldMetallic)" stroke="#78350F" stroke-width="2"/>
    <circle cx="75" cy="-95" r="10" fill="url(#goldMetallic)" stroke="#78350F" stroke-width="2"/>

    <!-- Bras courbés de l'ancre maritime avec pattes d'ancrage triangulaires -->
    <path d="M -130,50 C -100,165 100,165 130,50 L 148,60 C 112,195 -112,195 -148,60 Z" 
          fill="url(#goldMetallic)" stroke="#78350F" stroke-width="4"/>
    <polygon points="-130,50 -160,35 -140,80" fill="url(#goldMetallic)" stroke="#78350F" stroke-width="3"/>
    <polygon points="130,50 160,35 140,80" fill="url(#goldMetallic)" stroke="#78350F" stroke-width="3"/>
    <circle cx="0" cy="148" r="14" fill="#0A3829" stroke="url(#goldMetallic)" stroke-width="4"/>
  </g>

  <!-- 6. GRANDE BANNIÈRE HÉRALDIQUE CENTRALE "UJPAA" EN RELIEF GRAVÉ -->
  <g transform="translate(500, 680)" filter="url(#emblemShadow)">
    <!-- Ruban d'ombrage arrière -->
    <polygon points="-280,25 -240,-15 -240,55" fill="#041F14"/>
    <polygon points="280,25 240,-15 240,55" fill="#041F14"/>

    <!-- Corps de la bannière principale en vert émeraude officiel -->
    <path d="M -260,-24 L 260,-24 L 235,46 L -235,46 Z" 
          fill="url(#ivoryGreen)" stroke="url(#goldMetallic)" stroke-width="6"/>
    <!-- Double filet doré intérieur -->
    <path d="M -248,-14 L 248,-14 L 225,36 L -225,36 Z" 
          fill="none" stroke="#FDE68A" stroke-width="2" opacity="0.8"/>

    <!-- Sigle UJPAA en lettres gravées dorées et blanches -->
    <text x="0" y="26" font-family="'Arial Black', 'Impact', sans-serif" font-weight="900" font-size="58" 
          fill="#FFFFFF" text-anchor="middle" letter-spacing="10" filter="url(#goldShine)">
      UJPAA
    </text>
  </g>

  <!-- 7. SOUS-CARTOUCHE "PORT AUTONOME D'ABIDJAN" & SÉCURITÉ -->
  <g transform="translate(500, 755)" filter="url(#emblemShadow)">
    <rect x="-180" y="-12" width="360" height="26" rx="6" fill="#EA580C" stroke="#FFFFFF" stroke-width="2.5"/>
    <text x="0" y="6" font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="13" 
          fill="#FFFFFF" text-anchor="middle" letter-spacing="2.5">
      PORT AUTONOME D'ABIDJAN
    </text>
  </g>

  <!-- 8. ROSETTE DE SÉCURITÉ INFÉRIEURE : AN 2026 ET RÉPUBLIQUE -->
  <g transform="translate(500, 835)">
    <circle cx="0" cy="0" r="22" fill="#0A3829" stroke="url(#goldMetallic)" stroke-width="3"/>
    <polygon points="0,-12 4,-3 13,-3 6,3 9,12 0,7 -9,12 -6,3 -13,-3 -4,-3" fill="#FBBF24"/>
  </g>
</svg>`;
}

// 2. GÉNÉRATION DU CACHET OFFICIEL "VALIDATION UJPAA" (ENCRE VERTE & ORANGE SÉCURISÉE)
function generateValidationStampSVG(): string {
  const cx = 300;
  const cy = 300;
  const numPoints = 32;
  const rOuter = 265;
  const rInner = 245;
  let scallopPath = '';

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

    if (i === 0) {
      scallopPath += `M ${x1} ${y1} Q ${xMid} ${yMid} ${x2} ${y2} `;
    } else {
      scallopPath += `Q ${xMid} ${yMid} ${x2} ${y2} `;
    }
  }
  scallopPath += 'Z';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <path id="stampArcTop" d="M 85,300 A 215,215 0 1,1 515,300" fill="none"/>
    <path id="stampArcBottom" d="M 515,300 A 215,215 0 0,1 85,300" fill="none"/>
  </defs>

  <!-- Bord festonné officiel de sécurité (scalloped edge) -->
  <path d="${scallopPath}" fill="#FFFFFF" stroke="#0D4A36" stroke-width="7"/>

  <!-- Cercles concentriques d'impression d'encre -->
  <circle cx="300" cy="300" r="230" fill="none" stroke="#0D4A36" stroke-width="3"/>
  <circle cx="300" cy="300" r="222" fill="none" stroke="#EA580C" stroke-width="1.8"/>
  <circle cx="300" cy="300" r="165" fill="none" stroke="#0D4A36" stroke-width="3.5"/>
  <circle cx="300" cy="300" r="156" fill="none" stroke="#0D4A36" stroke-width="1.5" stroke-dasharray="4,4"/>

  <!-- Texte circulaire supérieur officiel -->
  <text font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="20" fill="#0D4A36" letter-spacing="3.5">
    <textPath href="#stampArcTop" startOffset="50%" text-anchor="middle">
      UNION DES JEUNES DU PORT AUTONOME D'ABIDJAN
    </textPath>
  </text>

  <!-- Texte circulaire inférieur -->
  <text font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="800" font-size="18" fill="#EA580C" letter-spacing="4">
    <textPath href="#stampArcBottom" startOffset="50%" text-anchor="middle">
      ★ SURVEILLANCE &amp; LOGISTIQUE ★
    </textPath>
  </text>

  <!-- Cœur du cachet : VALIDATION UJPAA & Côte d'Ivoire -->
  <g transform="translate(300, 300)">
    <!-- Silhouette Côte d'Ivoire en filigrane discret sous le cachet -->
    <path d="${COTE_DIVOIRE_PATH}" transform="translate(-50, -60) scale(0.24)" fill="none" stroke="#EA580C" stroke-width="5" opacity="0.35"/>

    <!-- Mot VALIDATION -->
    <text x="0" y="-18" font-family="'Arial Black', 'Impact', sans-serif" font-weight="900" font-size="34" 
          fill="#0D4A36" text-anchor="middle" letter-spacing="3">
      VALIDATION
    </text>

    <!-- Filets horizontaux avec étoile de sécurité -->
    <line x1="-125" y1="-2" x2="-26" y2="-2" stroke="#0D4A36" stroke-width="3"/>
    <polygon points="0,-8 3,-1 10,-1 4,3 7,10 0,6 -7,10 -4,3 -10,-1 -3,-1" fill="#EA580C"/>
    <line x1="26" y1="-2" x2="125" y2="-2" stroke="#0D4A36" stroke-width="3"/>

    <!-- Mot UJPAA en grand caractère majuscule d'authenticité -->
    <text x="0" y="44" font-family="'Arial Black', 'Impact', sans-serif" font-weight="900" font-size="52" 
          fill="#0D4A36" text-anchor="middle" letter-spacing="7">
      UJPAA
    </text>

    <!-- Mention de localisation -->
    <text x="0" y="78" font-family="'Arial Black', monospace" font-weight="bold" font-size="13" 
          fill="#EA580C" text-anchor="middle" letter-spacing="3">
      PORT AUTONOME D'ABIDJAN
    </text>
  </g>
</svg>`;
}

// 3. GÉNÉRATION DU MODÈLE DE TICKET OFFICIEL UJPAA
// Conforme aux spécifications exactes :
// - Titre : UNION DES JEUNES DU PORT AUTONOME D'ABIDJAN (UJPAA)
// - Subtitle : SURVEILLANCE & LOGISTIQUE - PORT D'ABIDJAN
// - Second subtitle : Zone Industrielle & Zone Portuaire d'Abidjan
// - N° VRDCH, DATE, N° IMMATRICULATION CAMION, NOM DU CHAUFFEUR, SIGNATURE AGENT UJPAA, VALIDATION UJPAA
// - Watermark EXCLUSIF contenant UNIQUEMENT : UJPAA, UCRAO, CSCRAO, UCRPPLAO-CI répété en diagonale
// - Talon détachable droit : N° VRDCH, IMMATRICULATION, DATE, contact@portus-ujpaa.online, Emblème UJPAA
function generateUjpaaTicketSpecimenSVG(): string {
  // Filigrane diagonal contenant EXCLUSIVEMENT : UJPAA / UCRAO / CSCRAO / UCRPPLAO-CI
  const watermarkText = "UJPAA   UCRAO   CSCRAO   UCRPPLAO-CI   ";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1150 540" width="1150" height="540">
  <defs>
    <!-- Motif guilloche de sécurité en fond continu avec filigrane exclusif -->
    <pattern id="ticketSecurityPattern" width="280" height="70" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)">
      <!-- Ondes sinusoïdales guillochées fines -->
      <path d="M 0,35 Q 70,10 140,35 T 280,35" fill="none" stroke="#FDBA74" stroke-width="0.75" opacity="0.25"/>
      <path d="M 0,20 Q 70,45 140,20 T 280,20" fill="none" stroke="#86EFAC" stroke-width="0.75" opacity="0.25"/>
      <!-- Lignes de filigrane de sécurité : UNIQUEMENT UJPAA / UCRAO / CSCRAO / UCRPPLAO-CI -->
      <text x="5" y="24" font-family="'Arial Black', monospace" font-weight="900" font-size="10.5" fill="#0D4A36" opacity="0.16" letter-spacing="2">
        ${watermarkText}
      </text>
      <text x="35" y="58" font-family="'Arial Black', monospace" font-weight="900" font-size="10.5" fill="#EA580C" opacity="0.16" letter-spacing="2">
        ${watermarkText}
      </text>
    </pattern>

    <!-- Ruban supérieur bicolore Côte d'Ivoire (Orange & Vert émeraude) -->
    <linearGradient id="cotedivoireRibbon" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#EA580C"/>
      <stop offset="35%" stop-color="#F97316"/>
      <stop offset="50%" stop-color="#FFFFFF"/>
      <stop offset="65%" stop-color="#16A34A"/>
      <stop offset="100%" stop-color="#0D4A36"/>
    </linearGradient>

    <!-- Ombre ticket -->
    <filter id="ticketShadow" x="-3%" y="-5%" width="106%" height="110%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#0F172A" flood-opacity="0.22"/>
    </filter>
  </defs>

  <!-- 1. CORPS DU TICKET AVEC FOND SÉCURISÉ PAPIER MONNAIE -->
  <g filter="url(#ticketShadow)">
    <rect x="15" y="15" width="1120" height="510" rx="14" fill="#FCFAF6" stroke="#0D4A36" stroke-width="2.5"/>
  </g>

  <!-- 2. TAPISSAGE INTÉGRAL DU FILIGRANE DE SÉCURITÉ SUR TOUT LE TICKET -->
  <rect x="16" y="16" width="1118" height="508" rx="13" fill="url(#ticketSecurityPattern)"/>

  <!-- 3. SILHOUETTE OFFICIELLE DE CÔTE D'IVOIRE EN FILIGRANE CENTRAL -->
  <g transform="translate(360, 140)" opacity="0.15">
    <path d="${COTE_DIVOIRE_PATH}" fill="none" stroke="#0D4A36" stroke-width="4"/>
    <circle cx="320" cy="435" r="14" fill="#EA580C"/>
    <text x="340" y="440" font-family="'Arial Black', sans-serif" font-weight="900" font-size="16" fill="#0D4A36">
      PORT D'ABIDJAN
    </text>
  </g>

  <!-- 4. RUBAN SUPÉRIEUR TRICOLORE CÔTE D'IVOIRE -->
  <path d="M 16,16 L 1134,16 L 1134,36 Q 575,54 16,36 Z" fill="url(#cotedivoireRibbon)"/>

  <!-- 5. EN-TÊTE OFFICIEL UJPAA -->
  <!-- Logo institutionnel à gauche -->
  <g transform="translate(35, 48)">
    <circle cx="48" cy="48" r="46" fill="#0D4A36" stroke="#F59E0B" stroke-width="3"/>
    <!-- Mini silhouette Côte d'Ivoire & ancre -->
    <path d="${COTE_DIVOIRE_PATH}" transform="translate(18, 12) scale(0.15)" fill="#EA580C" stroke="#FFFFFF" stroke-width="3"/>
    <circle cx="48" cy="48" r="18" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>
    <text x="48" y="52" font-family="'Arial Black', sans-serif" font-weight="900" font-size="11" fill="#FFFFFF" text-anchor="middle">
      UJPAA
    </text>
  </g>

  <!-- Textes officiels en-tête -->
  <g transform="translate(145, 62)">
    <text font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="22" fill="#0D4A36" letter-spacing="1">
      UNION DES JEUNES DU PORT AUTONOME D’ABIDJAN (UJPAA)
    </text>
    <text y="24" font-family="'Arial Black', sans-serif" font-weight="900" font-size="15" fill="#EA580C" letter-spacing="2">
      SURVEILLANCE &amp; LOGISTIQUE - PORT D’ABIDJAN
    </text>
    <text y="44" font-family="'Segoe UI', Arial, sans-serif" font-weight="700" font-size="12" fill="#334155">
      Zone Industrielle &amp; Zone Portuaire d’Abidjan
    </text>
  </g>

  <!-- Double liseré séparateur officiel vert émeraude & orange de Côte d'Ivoire -->
  <line x1="30" y1="124" x2="890" y2="124" stroke="#0D4A36" stroke-width="3.5"/>
  <line x1="30" y1="129" x2="890" y2="129" stroke="#EA580C" stroke-width="1.8"/>

  <!-- ========================================================================= -->
  <!-- 6. BLOC NUMÉRO DE TICKET : N° VRDCH -->
  <!-- ========================================================================= -->
  <g transform="translate(35, 145)">
    <rect width="360" height="54" rx="8" fill="#F8FAFC" stroke="#0D4A36" stroke-width="2.5"/>
    <rect x="3" y="3" width="354" height="48" rx="6" fill="none" stroke="#EA580C" stroke-width="1" stroke-dasharray="4,2"/>
    <text x="180" y="36" font-family="'Arial Black', 'Impact', monospace" font-weight="900" font-size="24" fill="#0D4A36" text-anchor="middle" letter-spacing="3">
      N° VRDCH-000001
    </text>
  </g>

  <!-- 7. DATE DU TICKET -->
  <g transform="translate(420, 160)">
    <text font-family="'Arial Black', sans-serif" font-weight="900" font-size="13" fill="#0D4A36">DATE</text>
    <rect x="55" y="-18" width="190" height="34" rx="6" fill="#FFFFFF" stroke="#64748B" stroke-width="1.8"/>
    <text x="150" y="5" font-family="'Courier New', monospace" font-weight="bold" font-size="18" fill="#1E293B" text-anchor="middle">
      ____ / ____ / 2026
    </text>
  </g>

  <!-- ========================================================================= -->
  <!-- 8. N° IMMATRICULATION CAMION (8 CASES NORMALISÉES) -->
  <!-- ========================================================================= -->
  <g transform="translate(35, 215)">
    <rect width="575" height="60" rx="8" fill="#FFFFFF" stroke="#334155" stroke-width="2"/>
    <text x="15" y="36" font-family="'Arial Black', sans-serif" font-weight="900" font-size="11.5" fill="#0D4A36" letter-spacing="1">
      N° IMMATRICULATION CAMION
    </text>
    
    <!-- 8 cases carrées sécurisées pour les caractères de la plaque -->
    <g transform="translate(260, 10)">
      <rect x="0" width="32" height="40" rx="4" fill="#F8FAFC" stroke="#0D4A36" stroke-width="2"/>
      <rect x="38" width="32" height="40" rx="4" fill="#F8FAFC" stroke="#0D4A36" stroke-width="2"/>
      <rect x="76" width="32" height="40" rx="4" fill="#F8FAFC" stroke="#0D4A36" stroke-width="2"/>
      <rect x="114" width="32" height="40" rx="4" fill="#F8FAFC" stroke="#0D4A36" stroke-width="2"/>
      <rect x="152" width="32" height="40" rx="4" fill="#F8FAFC" stroke="#0D4A36" stroke-width="2"/>
      <rect x="190" width="32" height="40" rx="4" fill="#F8FAFC" stroke="#0D4A36" stroke-width="2"/>
      <rect x="228" width="32" height="40" rx="4" fill="#F8FAFC" stroke="#0D4A36" stroke-width="2"/>
      <rect x="266" width="32" height="40" rx="4" fill="#F8FAFC" stroke="#0D4A36" stroke-width="2"/>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 9. NOM DU CHAUFFEUR -->
  <!-- ========================================================================= -->
  <g transform="translate(35, 290)">
    <rect width="575" height="48" rx="8" fill="#FFFFFF" stroke="#334155" stroke-width="2"/>
    <text x="15" y="30" font-family="'Arial Black', sans-serif" font-weight="900" font-size="12" fill="#0D4A36">
      NOM DU CHAUFFEUR
    </text>
    <line x1="200" y1="32" x2="550" y2="32" stroke="#64748B" stroke-width="2" stroke-dasharray="5,3"/>
  </g>

  <!-- ========================================================================= -->
  <!-- 10. CADRES SIGNATURE AGENT UJPAA & VALIDATION UJPAA -->
  <!-- ========================================================================= -->
  <g transform="translate(35, 355)">
    <!-- Cadre SIGNATURE AGENT UJPAA -->
    <g>
      <rect width="280" height="110" rx="8" fill="#FFFFFF" stroke="#0D4A36" stroke-width="2" stroke-dasharray="5,3"/>
      <rect x="5" y="5" width="270" height="26" rx="4" fill="#0D4A36"/>
      <text x="140" y="22" font-family="'Arial Black', sans-serif" font-weight="900" font-size="11.5" fill="#FFFFFF" text-anchor="middle">
        SIGNATURE AGENT UJPAA
      </text>
      <!-- Simulation signature officielle -->
      <path d="M 40,75 C 70,55 90,95 130,65 C 160,50 190,85 240,70" fill="none" stroke="#1E3A8A" stroke-width="2.8"/>
    </g>

    <!-- Cadre VALIDATION UJPAA avec cachet officiel -->
    <g transform="translate(295, 0)">
      <rect width="280" height="110" rx="8" fill="#FFFFFF" stroke="#EA580C" stroke-width="2" stroke-dasharray="5,3"/>
      <rect x="5" y="5" width="270" height="26" rx="4" fill="#EA580C"/>
      <text x="140" y="22" font-family="'Arial Black', sans-serif" font-weight="900" font-size="12" fill="#FFFFFF" text-anchor="middle">
        VALIDATION UJPAA
      </text>

      <!-- Cachet circulaire UJPAA -->
      <g transform="translate(140, 70)">
        <circle cx="0" cy="0" r="34" fill="#FFFFFF" stroke="#0D4A36" stroke-width="2.5"/>
        <circle cx="0" cy="0" r="30" fill="none" stroke="#EA580C" stroke-width="1.2" stroke-dasharray="3,2"/>
        <text y="-6" font-family="'Arial Black', sans-serif" font-weight="900" font-size="9" fill="#0D4A36" text-anchor="middle">
          VALIDATION
        </text>
        <text y="12" font-family="'Arial Black', sans-serif" font-weight="900" font-size="14" fill="#0D4A36" text-anchor="middle" letter-spacing="2">
          UJPAA
        </text>
      </g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 11. ZONE DU QR CODE DE VÉRIFICATION SÉCURISÉ (DROITE DU TICKET PRINCIPAL) -->
  <!-- ========================================================================= -->
  <g transform="translate(640, 145)">
    <!-- Cartouche QR Code sécurisé -->
    <rect width="235" height="320" rx="10" fill="#FFFFFF" stroke="#0D4A36" stroke-width="2.5"/>
    <rect x="5" y="5" width="225" height="28" rx="6" fill="#0D4A36"/>
    <text x="117" y="23" font-family="'Arial Black', sans-serif" font-weight="900" font-size="11" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">
      VÉRIFICATION QR CODE
    </text>

    <!-- Rosette guilloche hologramme UJPAA -->
    <g transform="translate(117, 72)">
      <circle cx="0" cy="0" r="32" fill="#0D4A36" stroke="#F59E0B" stroke-width="2.5"/>
      <circle cx="0" cy="0" r="27" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-dasharray="3,2"/>
      <text y="5" font-family="'Arial Black', sans-serif" font-weight="900" font-size="12" fill="#FFFFFF" text-anchor="middle">
        UJPAA
      </text>
    </g>

    <!-- Zone d'impression QR Code 180x180 px -->
    <g transform="translate(37, 120)">
      <rect width="160" height="160" rx="8" fill="#FFFFFF" stroke="#334155" stroke-width="2"/>
      <!-- Coins de calibration QR (Position patterns) -->
      <rect x="10" y="10" width="34" height="34" fill="#0D4A36"/>
      <rect x="15" y="15" width="24" height="24" fill="#FFFFFF"/>
      <rect x="20" y="20" width="14" height="14" fill="#0D4A36"/>

      <rect x="116" y="10" width="34" height="34" fill="#0D4A36"/>
      <rect x="121" y="15" width="24" height="24" fill="#FFFFFF"/>
      <rect x="126" y="20" width="14" height="14" fill="#0D4A36"/>

      <rect x="10" y="116" width="34" height="34" fill="#0D4A36"/>
      <rect x="15" y="121" width="24" height="24" fill="#FFFFFF"/>
      <rect x="20" y="126" width="14" height="14" fill="#0D4A36"/>

      <!-- Matrice de modules internes -->
      <rect x="55" y="15" width="10" height="10" fill="#0D4A36"/>
      <rect x="75" y="25" width="10" height="10" fill="#0D4A36"/>
      <rect x="95" y="15" width="10" height="10" fill="#0D4A36"/>
      <rect x="55" y="65" width="10" height="10" fill="#0D4A36"/>
      <rect x="95" y="65" width="10" height="10" fill="#0D4A36"/>
      <rect x="55" y="120" width="10" height="10" fill="#0D4A36"/>
      <rect x="75" y="135" width="10" height="10" fill="#0D4A36"/>
      <rect x="105" y="120" width="10" height="10" fill="#0D4A36"/>

      <!-- Badge central UJPAA -->
      <rect x="55" y="55" width="50" height="50" rx="6" fill="#EA580C" stroke="#FFFFFF" stroke-width="2"/>
      <text x="80" y="85" font-family="'Arial Black', sans-serif" font-weight="900" font-size="11" fill="#FFFFFF" text-anchor="middle">
        UJPAA
      </text>
    </g>

    <text x="117" y="305" font-family="'Arial Black', sans-serif" font-weight="900" font-size="9" fill="#0D4A36" text-anchor="middle">
      SCANNER POUR CONTRÔLE OFFICIEL
    </text>
  </g>

  <!-- ========================================================================= -->
  <!-- 12. LIGNE DE PERFORATION OFFICIELLE POUR LE TALON DÉTACHABLE -->
  <!-- ========================================================================= -->
  <g transform="translate(895, 0)">
    <line x1="0" y1="20" x2="0" y2="520" stroke="#0D4A36" stroke-width="2.5" stroke-dasharray="8,6"/>
    <!-- Petits ciseaux indicateurs de découpe -->
    <text x="-4" y="35" font-size="14" fill="#0D4A36">✂</text>
    <text x="-4" y="505" font-size="14" fill="#0D4A36">✂</text>
  </g>

  <!-- ========================================================================= -->
  <!-- 13. TALON DÉTACHABLE DROIT (RIGHT-HAND TICKET STUB) -->
  <!-- Contient : N° VRDCH, IMMATRICULATION, DATE, contact@portus-ujpaa.online, Emblème UJPAA -->
  <!-- ========================================================================= -->
  <g transform="translate(915, 30)">
    <!-- Fond du talon avec fine bordure aux couleurs nationales -->
    <rect width="205" height="480" rx="8" fill="#FDFBF7" stroke="#EA580C" stroke-width="2"/>

    <!-- Emblème UJPAA en haut du talon -->
    <g transform="translate(102, 55)">
      <circle cx="0" cy="0" r="38" fill="#0D4A36" stroke="#F59E0B" stroke-width="2.5"/>
      <path d="${COTE_DIVOIRE_PATH}" transform="translate(-16, -20) scale(0.12)" fill="#EA580C" stroke="#FFFFFF" stroke-width="2"/>
      <circle cx="0" cy="0" r="14" fill="none" stroke="#FFFFFF" stroke-width="2"/>
      <text y="4" font-family="'Arial Black', sans-serif" font-weight="900" font-size="8.5" fill="#FFFFFF" text-anchor="middle">
        UJPAA
      </text>
    </g>

    <!-- Titre du talon -->
    <text x="102" y="112" font-family="'Arial Black', sans-serif" font-weight="900" font-size="11" fill="#0D4A36" text-anchor="middle">
      TALON DE CONTRÔLE
    </text>

    <!-- N° VRDCH sur le talon -->
    <g transform="translate(12, 130)">
      <rect width="180" height="42" rx="6" fill="#F1F5F9" stroke="#0D4A36" stroke-width="1.8"/>
      <text x="90" y="27" font-family="'Arial Black', monospace" font-weight="900" font-size="13" fill="#0D4A36" text-anchor="middle">
        N° VRDCH-000001
      </text>
    </g>

    <!-- IMMATRICULATION sur le talon -->
    <g transform="translate(12, 190)">
      <text font-family="'Arial Black', sans-serif" font-weight="900" font-size="10" fill="#0D4A36">
        IMMATRICULATION :
      </text>
      <rect y="10" width="180" height="34" rx="4" fill="#FFFFFF" stroke="#334155" stroke-width="1.5"/>
      <line x1="10" y1="36" x2="170" y2="36" stroke="#94A3B8" stroke-width="1" stroke-dasharray="3,2"/>
    </g>

    <!-- DATE sur le talon -->
    <g transform="translate(12, 255)">
      <text font-family="'Arial Black', sans-serif" font-weight="900" font-size="10" fill="#0D4A36">
        DATE :
      </text>
      <rect y="10" width="180" height="34" rx="4" fill="#FFFFFF" stroke="#334155" stroke-width="1.5"/>
      <text x="90" y="32" font-family="'Courier New', monospace" font-weight="bold" font-size="13" fill="#334155" text-anchor="middle">
        ____ / ____ / 2026
      </text>
    </g>

    <!-- ADRESSE E-MAIL OFFICIELLE SUR LE TALON : contact@portus-ujpaa.online -->
    <g transform="translate(12, 330)">
      <rect width="180" height="50" rx="6" fill="#0D4A36"/>
      <text x="90" y="20" font-family="'Arial Black', sans-serif" font-weight="900" font-size="8.5" fill="#FDE68A" text-anchor="middle">
        CONTACT OFFICIEL UJPAA
      </text>
      <text x="90" y="38" font-family="'Arial Black', sans-serif" font-weight="bold" font-size="9" fill="#FFFFFF" text-anchor="middle">
        contact@portus-ujpaa.online
      </text>
    </g>

    <!-- Mention verticale de sécurité bord droit du talon -->
    <g transform="translate(192, 450) rotate(-90)">
      <text font-family="'Arial Black', sans-serif" font-weight="900" font-size="8.5" fill="#64748B" letter-spacing="1.5">
        PROPRIÉTÉ EXCLUSIVE UJPAA — TOUTE COPIE INTERDITE
      </text>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 14. BANDEAU DE PIED DE PAGE DU TICKET PRINCIPAL -->
  <!-- ========================================================================= -->
  <g transform="translate(460, 502)" text-anchor="middle">
    <rect x="-420" y="-18" width="840" height="24" rx="5" fill="#0D4A36"/>
    <text y="-2" font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="10.5" fill="#FFFFFF" letter-spacing="1">
      VÉRIFICATION PORTUS-UJPAA • EMAIL : contact@portus-ujpaa.online • TÉL : 07 77 91 78 04 / 01 0 31 37 68
    </text>
  </g>
</svg>`;
}

// 4. GÉNÉRATION DE LA SILHOUETTE OFFICIELLE VECTORIELLE DE CÔTE D'IVOIRE
function generateCoteDIvoireMapSVG(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <defs>
    <linearGradient id="ciMapOrange" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF7A29"/>
      <stop offset="100%" stop-color="#EA580C"/>
    </linearGradient>
    <linearGradient id="ciMapGreen" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#16A34A"/>
      <stop offset="100%" stop-color="#0D4A36"/>
    </linearGradient>
    <clipPath id="ciMapClip">
      <path d="${COTE_DIVOIRE_PATH}"/>
    </clipPath>
    <filter id="ciMapShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#0F172A" flood-opacity="0.3"/>
    </filter>
  </defs>

  <g filter="url(#ciMapShadow)">
    <!-- Fond tricolore national Orange / Blanc / Vert -->
    <path d="${COTE_DIVOIRE_PATH}" fill="#FFFFFF" stroke="#0D4A36" stroke-width="4"/>
    
    <g clip-path="url(#ciMapClip)">
      <!-- Tiers Orange -->
      <rect x="0" y="0" width="166" height="500" fill="url(#ciMapOrange)" opacity="0.9"/>
      <!-- Tiers Blanc -->
      <rect x="166" y="0" width="168" height="500" fill="#FFFFFF"/>
      <!-- Tiers Vert -->
      <rect x="334" y="0" width="166" height="500" fill="url(#ciMapGreen)" opacity="0.9"/>

      <!-- Hachures géographiques fines -->
      <line x1="50" y1="50" x2="450" y2="450" stroke="#0D4A36" stroke-width="1" opacity="0.2"/>
      <line x1="100" y1="50" x2="500" y2="450" stroke="#0D4A36" stroke-width="1" opacity="0.2"/>
    </g>

    <!-- Contour extérieur doré et vert -->
    <path d="${COTE_DIVOIRE_PATH}" fill="none" stroke="#D97706" stroke-width="2.5"/>
    <path d="${COTE_DIVOIRE_PATH}" fill="none" stroke="#0D4A36" stroke-width="1.5"/>

    <!-- Point Port d'Abidjan & coordonnées maritimes -->
    <circle cx="320" cy="435" r="12" fill="#EA580C" stroke="#FFFFFF" stroke-width="3"/>
    <circle cx="320" cy="435" r="5" fill="#FDE68A"/>
    <text x="338" y="440" font-family="'Arial Black', sans-serif" font-weight="900" font-size="12" fill="#0D4A36">
      Port d'Abidjan (UJPAA)
    </text>
  </g>
</svg>`;
}

async function main() {
  console.log('🇨🇮 Démarrage de la mise à jour générale des assets officiels UJPAA - Côte d’Ivoire...');

  // 1. Emblème officiel institutionnel UJPAA
  const emblemSvg = generateUjpaaEmblemSVG();
  const emblemSvgPath = path.join(PUBLIC_DIR, 'ujpaa-logo.svg');
  fs.writeFileSync(emblemSvgPath, emblemSvg, 'utf-8');
  console.log('✅ Emblème UJPAA SVG généré :', emblemSvgPath);

  // Conversion en PNG haute définition (1000x1000) et compression
  const emblemPngBuffer = await sharp(Buffer.from(emblemSvg))
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  const emblemPngPath = path.join(PUBLIC_DIR, 'logo-ujpaa.png');
  fs.writeFileSync(emblemPngPath, emblemPngBuffer);
  console.log('✅ Emblème UJPAA PNG généré :', emblemPngPath);

  // Mise à jour de logoss.jpg avec aplat blanc pour compatibilité maximale
  const emblemJpgPath = path.join(PUBLIC_DIR, 'logoss.jpg');
  await sharp(Buffer.from(emblemSvg))
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 95, mozjpeg: true })
    .toFile(emblemJpgPath);
  console.log('✅ logoss.jpg mis à jour avec le nouvel emblème :', emblemJpgPath);

  // 2. Cachet officiel de validation UJPAA
  const stampSvg = generateValidationStampSVG();
  const stampSvgPath = path.join(PUBLIC_DIR, 'cachet-ujpaa.svg');
  fs.writeFileSync(stampSvgPath, stampSvg, 'utf-8');

  const stampPngBuffer = await sharp(Buffer.from(stampSvg))
    .png({ quality: 100 })
    .toBuffer();

  const stampPngPath = path.join(PUBLIC_DIR, 'cachet-ujpaa.png');
  fs.writeFileSync(stampPngPath, stampPngBuffer);
  console.log('✅ Cachet de validation UJPAA PNG généré :', stampPngPath);

  // Rétrocompatibilité cachet-ujsrv.png
  const legacyStampPath = path.join(PUBLIC_DIR, 'cachet-ujsrv.png');
  fs.writeFileSync(legacyStampPath, stampPngBuffer);

  // 3. Modèle de ticket de sécurité officiel UJPAA
  const ticketSvg = generateUjpaaTicketSpecimenSVG();
  const ticketSvgPath = path.join(PUBLIC_DIR, 'ticket-ujpaa-specimen.svg');
  fs.writeFileSync(ticketSvgPath, ticketSvg, 'utf-8');

  const ticketPngPath = path.join(PUBLIC_DIR, 'ticket-ujpaa-specimen.png');
  await sharp(Buffer.from(ticketSvg))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(ticketPngPath);
  console.log('✅ Modèle de ticket UJPAA PNG généré :', ticketPngPath);

  // 4. Silhouette officielle de Côte d'Ivoire
  const mapSvg = generateCoteDIvoireMapSVG();
  const mapSvgPath = path.join(ASSETS_DIR, 'cote-divoire-map.svg');
  fs.writeFileSync(mapSvgPath, mapSvg, 'utf-8');
  console.log('✅ Carte de Côte d’Ivoire SVG générée :', mapSvgPath);

  const mapPngPath = path.join(ASSETS_DIR, 'cote-divoire-map.png');
  await sharp(Buffer.from(mapSvg))
    .png({ quality: 100 })
    .toFile(mapPngPath);
  console.log('✅ Carte de Côte d’Ivoire PNG générée :', mapPngPath);

  console.log('🎉 Tous les assets officiels UJPAA aux couleurs de Côte d’Ivoire ont été générés avec succès !');
}

main().catch((err) => {
  console.error('❌ Erreur lors de la génération des assets UJPAA:', err);
  process.exit(1);
});
