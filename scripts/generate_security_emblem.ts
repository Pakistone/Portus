import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const PUBLIC_DIR = path.resolve('public');
const ASSETS_DIR = path.resolve('public/assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. GÉOMÉTRIE PRÉCISE DE LA SILHOUETTE DE LA RÉPUBLIQUE DE CÔTE D'IVOIRE
// ---------------------------------------------------------------------------
// Tracé vectoriel haute fidélité des frontières terrestres et du littoral atlantique
const COTE_DIVOIRE_GEO_PATH = `
  M 152,48
  C 185,46 220,53 255,51
  C 285,49 320,58 355,67
  C 375,102 388,138 395,178
  C 400,218 388,255 385,295
  C 392,332 408,368 416,400
  C 406,414 386,422 366,428
  C 342,426 328,424 318,425
  C 292,428 272,432 252,435
  C 232,438 212,442 192,445
  C 172,448 152,452 132,455
  C 108,458 92,460 82,460
  C 76,436 86,406 95,386
  C 101,356 86,332 76,318
  C 64,288 60,264 62,242
  C 65,214 78,190 85,166
  C 95,136 102,106 110,84
  Z
`;

// ---------------------------------------------------------------------------
// 2. GÉNÉRATION MATHÉMATIQUE DES ROSACES & MOTIFS GUILLOCHÉS DE SÉCURITÉ
// ---------------------------------------------------------------------------
function generateGuillocheRosette(
  cx: number,
  cy: number,
  R: number,
  r: number,
  p: number,
  steps: number,
  stroke: string,
  strokeWidth: number,
  opacity: number
): string {
  let pathStr = '';
  for (let i = 0; i <= steps; i++) {
    const theta = (i * 2 * Math.PI) / steps;
    // Hypotrochoid math curve
    const x = cx + (R - r) * Math.cos(theta) + p * Math.cos(((R - r) / r) * theta);
    const y = cy + (R - r) * Math.sin(theta) - p * Math.sin(((R - r) / r) * theta);
    if (i === 0) {
      pathStr += `M ${x.toFixed(2)},${y.toFixed(2)}`;
    } else {
      pathStr += ` L ${x.toFixed(2)},${y.toFixed(2)}`;
    }
  }
  return `<path d="${pathStr} Z" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linejoin="round"/>`;
}

// Générateur d'ondes guillochées concentriques
function generateWaveRing(
  cx: number,
  cy: number,
  baseRadius: number,
  waves: number,
  amplitude: number,
  stroke: string,
  strokeWidth: number,
  opacity: number
): string {
  const steps = waves * 16;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const angle = (i * 2 * Math.PI) / steps;
    const r = baseRadius + amplitude * Math.sin(waves * angle);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) d += `M ${x.toFixed(2)},${y.toFixed(2)}`;
    else d += ` L ${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return `<path d="${d} Z" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
}

// ---------------------------------------------------------------------------
// 3. CODE SVG DE L'EMBLÈME INSTITUTIONNEL UJPAA DE HAUTE PRÉCISION (2000 x 2000)
// ---------------------------------------------------------------------------
export function generateInstitutionalSecurityEmblemSVG(): string {
  const cx = 1000;
  const cy = 1000;

  // Calcul des rosaces guillochées intaglio
  const rosette1 = generateGuillocheRosette(cx, cy, 720, 240, 160, 720, '#D97706', 1.8, 0.45);
  const rosette2 = generateGuillocheRosette(cx, cy, 700, 175, 140, 720, '#0D4A36', 1.6, 0.55);
  const rosette3 = generateGuillocheRosette(cx, cy, 640, 160, 110, 640, '#EA580C', 1.4, 0.4);
  const rosetteInner = generateGuillocheRosette(cx, cy, 420, 105, 75, 480, '#15803D', 1.2, 0.35);

  // Anneaux d'ondes de sécurité
  const wave1 = generateWaveRing(cx, cy, 915, 96, 7, '#B45309', 2.2, 0.8);
  const wave2 = generateWaveRing(cx, cy, 900, 96, 6, '#042F24', 1.8, 0.7);
  const wave3 = generateWaveRing(cx, cy, 835, 64, 5, '#D97706', 1.5, 0.5);
  const wave4 = generateWaveRing(cx, cy, 580, 48, 4, '#15803D', 1.2, 0.5);

  // Micro-hachures intaglio pour l'impression fiduciaire
  let fineHatching = '';
  for (let y = 350; y <= 1650; y += 12) {
    fineHatching += `<line x1="320" y1="${y}" x2="1680" y2="${y}" stroke="#062F22" stroke-width="0.8" opacity="0.12"/>`;
  }
  for (let x = 350; x <= 1650; x += 12) {
    fineHatching += `<line x1="${x}" y1="350" x2="${x}" y2="1650" stroke="#B45309" stroke-width="0.6" opacity="0.08"/>`;
  }

  // Dentelures du sceau extérieur officiel (120 crans de gravure)
  let outerGearTeeth = '';
  const numTeeth = 120;
  for (let i = 0; i < numTeeth; i++) {
    const angle = (i * 360) / numTeeth;
    const rad = (angle * Math.PI) / 180;
    const xOuter = cx + 960 * Math.cos(rad);
    const yOuter = cy + 960 * Math.sin(rad);
    const xInner = cx + 942 * Math.cos(rad);
    const yInner = cy + 942 * Math.sin(rad);
    outerGearTeeth += `<line x1="${xInner.toFixed(1)}" y1="${yInner.toFixed(1)}" x2="${xOuter.toFixed(1)}" y2="${yOuter.toFixed(1)}" stroke="#042F24" stroke-width="3" stroke-linecap="round"/>`;
  }

  // Étoiles de sécurité sur l'anneau intermédiaire
  let securityStars = '';
  for (let a = 0; a < 360; a += 15) {
    const rad = (a * Math.PI) / 180;
    const sx = cx + 805 * Math.cos(rad);
    const sy = cy + 805 * Math.sin(rad);
    securityStars += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.8" fill="#FBBF24"/>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="2000" height="2000">
  <defs>
    <!-- FILTRES DE RELIEF INTAGLIO & TEXTURE PAPIER SÉCURISÉ -->
    <filter id="intaglioPlateRelief" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#021710" flood-opacity="0.6"/>
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.35"/>
    </filter>

    <filter id="innerEmbossFilter" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="2" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.45"/>
    </filter>

    <filter id="goldenInkShine" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#78350F" flood-opacity="0.5"/>
    </filter>

    <filter id="printedInkGrain">
      <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="4" result="noise"/>
      <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.18 0" in="noise" result="coloredNoise"/>
      <feComposite operator="in" in2="SourceGraphic"/>
    </filter>

    <!-- DÉGRADÉS OFFICIELS CÔTE D'IVOIRE & ENCRES FIDUCIAIRES -->
    <!-- Orange Ivoirien Profond -->
    <linearGradient id="ivoryOrangeInk" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF7B25"/>
      <stop offset="40%" stop-color="#EA580C"/>
      <stop offset="85%" stop-color="#C2410C"/>
      <stop offset="100%" stop-color="#9A3412"/>
    </linearGradient>

    <!-- Vert Forêt Ivoirien / Sceau de Sécurité -->
    <linearGradient id="ivoryGreenInk" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#16A34A"/>
      <stop offset="35%" stop-color="#0F6042"/>
      <stop offset="70%" stop-color="#09412D"/>
      <stop offset="100%" stop-color="#03261A"/>
    </linearGradient>

    <!-- Blanc Parchemin Velin / Filigrane Sécurité -->
    <linearGradient id="securityParchment" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="50%" stop-color="#FDFBF7"/>
      <stop offset="100%" stop-color="#F5EFE3"/>
    </linearGradient>

    <!-- Dorure d'Encre Gravée Métallique -->
    <linearGradient id="engravedGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FEF3C7"/>
      <stop offset="25%" stop-color="#F59E0B"/>
      <stop offset="50%" stop-color="#FFFBEB"/>
      <stop offset="75%" stop-color="#D97706"/>
      <stop offset="100%" stop-color="#92400E"/>
    </linearGradient>

    <linearGradient id="darkBronzeRim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#D97706"/>
      <stop offset="50%" stop-color="#451A03"/>
      <stop offset="100%" stop-color="#78350F"/>
    </linearGradient>

    <!-- CHEMINS POUR TYPOGRAPHIE COURBÉE GRAVÉE -->
    <!-- Arc Supérieur Principal : UNION DES JEUNES DU PORT AUTONOME D'ABIDJAN -->
    <path id="topTextArc" d="M 230,1000 A 770,770 0 1,1 1770,1000" fill="none"/>
    
    <!-- Arc Inférieur Principal : SURVEILLANCE & LOGISTIQUE • PORT D'ABIDJAN -->
    <path id="bottomTextArc" d="M 1740,1000 A 740,740 0 0,1 260,1000" fill="none"/>

    <!-- Arc Intérieur Supérieur : RÉPUBLIQUE DE CÔTE D'IVOIRE -->
    <path id="innerTopArc" d="M 440,1000 A 560,560 0 1,1 1560,1000" fill="none"/>

    <!-- Clip pour la carte de Côte d'Ivoire tricolore -->
    <clipPath id="ciMapClip">
      <path d="${COTE_DIVOIRE_GEO_PATH}" transform="translate(565, 480) scale(2.05)"/>
    </clipPath>
  </defs>

  <!-- ========================================================================= -->
  <!-- COUCHE 1 : PLAQUE DE GRAVURE & BORDURE DENTELÉE DE SÉCURITÉ -->
  <!-- ========================================================================= -->
  <g filter="url(#intaglioPlateRelief)">
    <!-- Fond d'appui du sceau sur papier velin -->
    <circle cx="${cx}" cy="${cy}" r="975" fill="#031E15" stroke="url(#engravedGold)" stroke-width="8"/>
    
    <!-- Dentelures extérieures (engraved lathe rim) -->
    <g>${outerGearTeeth}</g>

    <!-- Anneau extérieur vert forêt profond -->
    <circle cx="${cx}" cy="${cy}" r="940" fill="url(#ivoryGreenInk)" stroke="url(#engravedGold)" stroke-width="6"/>

    <!-- Ondes guillochées extérieures -->
    ${wave1}
    ${wave2}

    <!-- Rosaces guillochées primaires entrelacées -->
    ${rosette1}
    ${rosette2}
    ${rosette3}

    <!-- Anneau circulaire intermédiaire avec perles de sécurité -->
    <circle cx="${cx}" cy="${cy}" r="860" fill="none" stroke="url(#engravedGold)" stroke-width="5"/>
    <circle cx="${cx}" cy="${cy}" r="852" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="10,6" opacity="0.75"/>
    <circle cx="${cx}" cy="${cy}" r="750" fill="none" stroke="url(#engravedGold)" stroke-width="4"/>
    ${wave3}
  </g>

  <!-- ========================================================================= -->
  <!-- COUCHE 2 : TYPOGRAPHIE INSTITUTIONNELLE GRAVÉE SUR L'ANNEAU EXTÉRIEUR -->
  <!-- ========================================================================= -->
  <!-- Titre officiel supérieur courbé -->
  <text font-family="'Times New Roman', 'Baskerville', 'Georgia', 'Arial Black', serif" 
        font-weight="900" 
        font-size="62" 
        fill="#FFFFFF" 
        letter-spacing="5.5" 
        filter="url(#goldenInkShine)">
    <textPath href="#topTextArc" startOffset="50%" text-anchor="middle">
      UNION DES JEUNES DU PORT AUTONOME D’ABIDJAN
    </textPath>
  </text>

  <!-- Sous-titre inférieur courbé -->
  <text font-family="'Arial Black', 'Helvetica', 'Impact', sans-serif" 
        font-weight="900" 
        font-size="44" 
        fill="#FDE68A" 
        letter-spacing="7" 
        filter="url(#goldenInkShine)">
    <textPath href="#bottomTextArc" startOffset="50%" text-anchor="middle">
      ★ SURVEILLANCE &amp; LOGISTIQUE • PORT D’ABIDJAN ★
    </textPath>
  </text>

  <!-- Étoiles de séparation latérales tricolores ivoiriennes -->
  <!-- Flanc Gauche -->
  <g transform="translate(230, 1000)" filter="url(#goldenInkShine)">
    <circle cx="0" cy="0" r="28" fill="#042F24" stroke="url(#engravedGold)" stroke-width="4"/>
    <polygon points="0,-20 6,-6 20,-6 9,4 13,18 0,10 -13,18 -9,4 -20,-6 -6,-6" fill="#EA580C"/>
  </g>
  <!-- Flanc Droit -->
  <g transform="translate(1770, 1000)" filter="url(#goldenInkShine)">
    <circle cx="0" cy="0" r="28" fill="#042F24" stroke="url(#engravedGold)" stroke-width="4"/>
    <polygon points="0,-20 6,-6 20,-6 9,4 13,18 0,10 -13,18 -9,4 -20,-6 -6,-6" fill="#15803D"/>
  </g>

  <!-- ========================================================================= -->
  <!-- COUCHE 3 : DISQUE INTÉRIEUR PARCHEMIN VELIN & GUILLOCHÉ CENTRAL -->
  <!-- ========================================================================= -->
  <g filter="url(#innerEmbossFilter)">
    <!-- Bordure biseautée dorée du médaillon central -->
    <circle cx="${cx}" cy="${cy}" r="710" fill="url(#securityParchment)" stroke="url(#engravedGold)" stroke-width="14"/>
    <circle cx="${cx}" cy="${cy}" r="698" fill="none" stroke="#042F24" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy}" r="688" fill="none" stroke="#EA580C" stroke-width="2" stroke-dasharray="6,4" opacity="0.6"/>

    <!-- Micro-trame de hachures d'imprimerie fiduciaire -->
    <g>${fineHatching}</g>

    <!-- Ondes et rosaces guillochées intérieures -->
    ${rosetteInner}
    ${wave4}

    <!-- Anneau intérieur de micro-texte de sécurité répété -->
    <circle cx="${cx}" cy="${cy}" r="660" fill="none" stroke="#0D4A36" stroke-width="1.5" opacity="0.4"/>
    <circle cx="${cx}" cy="${cy}" r="620" fill="none" stroke="#0D4A36" stroke-width="1.5" opacity="0.4"/>
  </g>

  <!-- ========================================================================= -->
  <!-- COUCHE 4 : CARTE OFFICIELLE DE CÔTE D'IVOIRE (ENCRES TRICOLORES GRAVÉES) -->
  <!-- Silhouette géographiquement exacte, tiers orange, blanc, vert, hachures -->
  <!-- ========================================================================= -->
  <g transform="translate(565, 480) scale(2.05)" filter="url(#innerEmbossFilter)">
    <!-- Ombrage d'encre sous la carte -->
    <path d="${COTE_DIVOIRE_GEO_PATH}" fill="#0A3829" opacity="0.25" transform="translate(4, 6)"/>

    <!-- Fond de la carte -->
    <path d="${COTE_DIVOIRE_GEO_PATH}" fill="#FFFFFF" stroke="#062F22" stroke-width="6"/>

    <!-- Remplissage aux trois couleurs de la Côte d'Ivoire avec texture d'encre -->
    <g clip-path="url(#ciMapClip)">
      <!-- Tiers Ouest : Orange Ivoirien -->
      <rect x="0" y="0" width="185" height="520" fill="url(#ivoryOrangeInk)" opacity="0.88"/>
      <!-- Tiers Central : Blanc Pur de Sécurité -->
      <rect x="185" y="0" width="112" height="520" fill="#FFFFFF" opacity="0.95"/>
      <!-- Tiers Est : Vert Forêt Ivoirien -->
      <rect x="297" y="0" width="195" height="520" fill="url(#ivoryGreenInk)" opacity="0.88"/>

      <!-- Hachures topographiques et méridiens de sécurité intaglio sur la carte -->
      <line x1="40" y1="40" x2="440" y2="440" stroke="#042F24" stroke-width="1.8" opacity="0.22"/>
      <line x1="80" y1="40" x2="480" y2="440" stroke="#042F24" stroke-width="1.8" opacity="0.22"/>
      <line x1="120" y1="40" x2="520" y2="440" stroke="#042F24" stroke-width="1.8" opacity="0.22"/>
      <line x1="0" y1="40" x2="400" y2="440" stroke="#042F24" stroke-width="1.8" opacity="0.22"/>
      <line x1="-40" y1="40" x2="360" y2="440" stroke="#042F24" stroke-width="1.8" opacity="0.22"/>

      <line x1="40" y1="440" x2="440" y2="40" stroke="#B45309" stroke-width="1.2" opacity="0.18"/>
      <line x1="80" y1="440" x2="480" y2="40" stroke="#B45309" stroke-width="1.2" opacity="0.18"/>
      <line x1="120" y1="440" x2="520" y2="40" stroke="#B45309" stroke-width="1.2" opacity="0.18"/>
    </g>

    <!-- Filets de démarcation gravés des trois bandes -->
    <g clip-path="url(#ciMapClip)">
      <line x1="185" y1="0" x2="185" y2="520" stroke="#B45309" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.6"/>
      <line x1="297" y1="0" x2="297" y2="520" stroke="#042F24" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.6"/>
    </g>

    <!-- Contour renforcé de la Côte d'Ivoire en or et vert d'imprimerie -->
    <path d="${COTE_DIVOIRE_GEO_PATH}" fill="none" stroke="url(#engravedGold)" stroke-width="5"/>
    <path d="${COTE_DIVOIRE_GEO_PATH}" fill="none" stroke="#062F22" stroke-width="2.5"/>

    <!-- Repère officiel du PORT AUTONOME D'ABIDJAN (Canal de Vridi / Lagune Ébrié) -->
    <!-- Coordonnées géographiques précises : ~318, 424 -->
    <circle cx="318" cy="424" r="16" fill="#EA580C" stroke="#FFFFFF" stroke-width="4"/>
    <circle cx="318" cy="424" r="7" fill="#FDE68A"/>
    <polygon points="318,406 322,418 334,420 324,428 327,440 318,433 309,440 312,428 302,420 314,418" fill="#FBBF24" stroke="#78350F" stroke-width="1"/>

    <!-- Vagues maritimes côtières sous Abidjan -->
    <path d="M 270,442 Q 295,432 320,442 Q 345,452 370,442 Q 395,432 420,442" fill="none" stroke="#0D4A36" stroke-width="3" opacity="0.75"/>
    <path d="M 285,450 Q 310,440 335,450 Q 360,460 385,450" fill="none" stroke="#EA580C" stroke-width="2" opacity="0.65"/>
  </g>

  <!-- ========================================================================= -->
  <!-- COUCHE 5 : SYMBOLES MARITIMES DU PORT D'ABIDJAN & SOUVERAINETÉ -->
  <!-- Grande Ancre Héraldique d'Or, Lauriers d'Honneur & Boussole de Sécurité -->
  <!-- ========================================================================= -->
  <g transform="translate(1000, 960)" filter="url(#intaglioPlateRelief)">
    <!-- COURONNE DE LAURIERS INSTITUTIONNELLE ENTOURANT LE CŒUR DU SCEAU -->
    <!-- Branche gauche -->
    <path d="M -320,160 C -420,0 -400,-240 -220,-380 C -280,-240 -240,-20 -180,80" fill="none" stroke="#09412D" stroke-width="10"/>
    <!-- Branche droite -->
    <path d="M 320,160 C 420,0 400,-240 220,-380 C 280,-240 240,-20 180,80" fill="none" stroke="#09412D" stroke-width="10"/>

    <!-- Feuilles de laurier gravées dorées et émeraude -->
    <g fill="url(#ivoryGreenInk)" stroke="url(#engravedGold)" stroke-width="2.5">
      <ellipse cx="-330" cy="-40" rx="32" ry="15" transform="rotate(-30 -330 -40)"/>
      <ellipse cx="-290" cy="-160" rx="32" ry="15" transform="rotate(-50 -290 -160)"/>
      <ellipse cx="-200" cy="-280" rx="30" ry="14" transform="rotate(-70 -200 -280)"/>
      <ellipse cx="-100" cy="-350" rx="28" ry="13" transform="rotate(-85 -100 -350)"/>

      <ellipse cx="330" cy="-40" rx="32" ry="15" transform="rotate(30 330 -40)"/>
      <ellipse cx="290" cy="-160" rx="32" ry="15" transform="rotate(50 290 -160)"/>
      <ellipse cx="200" cy="-280" rx="30" ry="14" transform="rotate(70 200 -280)"/>
      <ellipse cx="100" cy="-350" rx="28" ry="13" transform="rotate(85 100 -350)"/>
    </g>

    <!-- GRANDE ANCRE DE MARINE DU PORT AUTONOME D'ABIDJAN -->
    <!-- Anneau supérieur (organeau / cigale) avec cordage gravé -->
    <circle cx="0" cy="-320" r="56" fill="none" stroke="url(#engravedGold)" stroke-width="22"/>
    <circle cx="0" cy="-320" r="34" fill="none" stroke="#042F24" stroke-width="6"/>

    <!-- Câble de marine enroulé autour de la verge (mooring cable) -->
    <path d="M -26,-260 Q 34,-230 20,-170 Q -40,-120 10,-60 Q 40,-10 0,60 Q -30,120 20,180" 
          fill="none" stroke="#D97706" stroke-width="14" stroke-linecap="round"/>
    <path d="M -26,-260 Q 34,-230 20,-170 Q -40,-120 10,-60 Q 40,-10 0,60 Q -30,120 20,180" 
          fill="none" stroke="#451A03" stroke-width="3" stroke-dasharray="10,6"/>

    <!-- Verge centrale de l'ancre (shank) en bronze doré sculpté -->
    <line x1="0" y1="-265" x2="0" y2="240" stroke="url(#engravedGold)" stroke-width="38" stroke-linecap="round"/>
    <line x1="0" y1="-265" x2="0" y2="240" stroke="#78350F" stroke-width="6" stroke-linecap="round"/>
    <!-- Filet central de relief -->
    <line x1="0" y1="-260" x2="0" y2="235" stroke="#FFFBEB" stroke-width="4" stroke-linecap="round" opacity="0.8"/>

    <!-- Jas transversal de l'ancre (stock) avec embouts sphériques -->
    <line x1="-150" y1="-190" x2="150" y2="-190" stroke="url(#engravedGold)" stroke-width="28" stroke-linecap="round"/>
    <line x1="-150" y1="-190" x2="150" y2="-190" stroke="#78350F" stroke-width="4" stroke-linecap="round"/>
    <circle cx="-150" cy="-190" r="20" fill="url(#engravedGold)" stroke="#78350F" stroke-width="4"/>
    <circle cx="150" cy="-190" r="20" fill="url(#engravedGold)" stroke="#78350F" stroke-width="4"/>

    <!-- Bras courbés de l'ancre (arms) et pattes d'ancrage triangulaires (flukes) -->
    <path d="M -260,100 C -200,330 200,330 260,100 L 295,120 C 224,390 -224,390 -295,120 Z" 
          fill="url(#engravedGold)" stroke="#78350F" stroke-width="7"/>
    <!-- Pattes triangulaires -->
    <polygon points="-260,100 -320,70 -280,160" fill="url(#engravedGold)" stroke="#78350F" stroke-width="6"/>
    <polygon points="260,100 320,70 280,160" fill="url(#engravedGold)" stroke="#78350F" stroke-width="6"/>
    <!-- Diamant inférieur de l'ancre (crown) -->
    <circle cx="0" cy="295" r="28" fill="#042F24" stroke="url(#engravedGold)" stroke-width="8"/>
    <circle cx="0" cy="295" r="12" fill="#EA580C"/>
  </g>

  <!-- ========================================================================= -->
  <!-- COUCHE 6 : GRANDE BANNIÈRE HÉRALDIQUE CENTRALE EN RELIEF « UJPAA » -->
  <!-- Bannière chintzée en émeraude et or gravé, biseautée avec ombre portée -->
  <!-- ========================================================================= -->
  <g transform="translate(1000, 1360)" filter="url(#intaglioPlateRelief)">
    <!-- Rubans repliés arrière d'ombrage -->
    <polygon points="-560,50 -480,-30 -480,110" fill="#021710" stroke="#000000" stroke-width="2"/>
    <polygon points="560,50 480,-30 480,110" fill="#021710" stroke="#000000" stroke-width="2"/>

    <!-- Queue de ruban gauche festonnée aux couleurs ivoiriennes -->
    <path d="M -540,50 L -460,-20 L -460,100 L -540,80 Z" fill="url(#ivoryOrangeInk)" stroke="url(#engravedGold)" stroke-width="4"/>
    <!-- Queue de ruban droite -->
    <path d="M 540,50 L 460,-20 L 460,100 L 540,80 Z" fill="url(#ivoryGreenInk)" stroke="url(#engravedGold)" stroke-width="4"/>

    <!-- Corps de la bannière principale bombée -->
    <path d="M -500,-48 L 500,-48 L 460,92 L -460,92 Z" 
          fill="url(#ivoryGreenInk)" stroke="url(#engravedGold)" stroke-width="10"/>

    <!-- Double liseré d'or intérieur -->
    <path d="M -480,-32 L 480,-32 L 444,76 L -444,76 Z" 
          fill="none" stroke="#FDE68A" stroke-width="3.5" opacity="0.9"/>

    <!-- Ombrage d'incision pour les lettres UJPAA -->
    <text x="0" y="58" 
          font-family="'Arial Black', 'Impact', sans-serif" 
          font-weight="900" 
          font-size="116" 
          fill="#021710" 
          text-anchor="middle" 
          letter-spacing="20">
      UJPAA
    </text>

    <!-- Lettres ciselées dorées et blanches UJPAA avec hachures de gravure -->
    <text x="0" y="52" 
          font-family="'Arial Black', 'Impact', sans-serif" 
          font-weight="900" 
          font-size="116" 
          fill="#FFFFFF" 
          text-anchor="middle" 
          letter-spacing="20" 
          filter="url(#goldenInkShine)">
      UJPAA
    </text>
  </g>

  <!-- ========================================================================= -->
  <!-- COUCHE 7 : CARTOUCHE DE SÉCURITÉ INFÉRIEUR & INSCRIPTIONS PORT D'ABIDJAN -->
  <!-- ========================================================================= -->
  <g transform="translate(1000, 1510)" filter="url(#innerEmbossFilter)">
    <!-- Cartouche Orange Ivoirien -->
    <rect x="-360" y="-24" width="720" height="52" rx="12" fill="url(#ivoryOrangeInk)" stroke="#FFFFFF" stroke-width="4"/>
    <rect x="-352" y="-18" width="704" height="40" rx="8" fill="none" stroke="url(#engravedGold)" stroke-width="2" opacity="0.8"/>

    <text x="0" y="10" 
          font-family="'Arial Black', 'Impact', sans-serif" 
          font-weight="900" 
          font-size="26" 
          fill="#FFFFFF" 
          text-anchor="middle" 
          letter-spacing="4" 
          filter="url(#goldenInkShine)">
      PORT AUTONOME D’ABIDJAN • SÉCURITÉ
    </text>
  </g>

  <!-- ========================================================================= -->
  <!-- COUCHE 8 : SCEAU DE CONFIRMATION OFFICIELLE & BLASON DE LA RÉPUBLIQUE -->
  <!-- Rosette inférieure à 6 heures avec millésime et étoile dorée -->
  <!-- ========================================================================= -->
  <g transform="translate(1000, 1670)" filter="url(#goldenInkShine)">
    <!-- Anneau rosette -->
    <circle cx="0" cy="0" r="44" fill="#042F24" stroke="url(#engravedGold)" stroke-width="6"/>
    <circle cx="0" cy="0" r="32" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="4,3"/>

    <!-- Étoile flamboyante à 5 branches -->
    <polygon points="0,-24 7,-7 25,-7 11,5 16,22 0,12 -16,22 -11,5 -25,-7 -7,-7" fill="#FBBF24" stroke="#78350F" stroke-width="1.5"/>
  </g>

  <!-- Année de fondation / validation de sécurité gravée -->
  <g transform="translate(1000, 1740)">
    <text font-family="'Arial Black', monospace" font-weight="900" font-size="18" fill="#FDE68A" text-anchor="middle" letter-spacing="5">
      ★ SOUVERAINETÉ &amp; INTÉGRITÉ PORTUAIRE ★
    </text>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// 4. PIPELINE D'EXPORTATION RASTER ULTRA HAUTE DÉFINITION (PNG & JPEG & WEBP)
// ---------------------------------------------------------------------------
async function buildHighQualityRasterEmblem() {
  console.log('🏛️ Démarrage de la génération de l’emblème officiel institutionnel UJPAA...');

  const svgContent = generateInstitutionalSecurityEmblemSVG();

  // 1. Sauvegarde du SVG maître vectoriel
  const svgPath = path.join(PUBLIC_DIR, 'ujpaa-logo.svg');
  fs.writeFileSync(svgPath, svgContent, 'utf-8');
  console.log('✅ SVG Maître généré :', svgPath);

  // 2. Rendu Raster Sharp à 1200 x 1200 px (ultra net, immédiat et haute fidélité)
  console.log('🎨 Rendu raster haute définition avec Sharp...');
  const svgBuffer = Buffer.from(svgContent);

  // Rendu direct à 1200x1200px sans sur-échantillonnage excessif
  const emblemSharp = sharp(svgBuffer).resize(1200, 1200);

  // Export PNG Transparent 1200x1200
  const png1200Buffer = await emblemSharp
    .png({
      quality: 100,
      compressionLevel: 8,
    })
    .toBuffer();

  // Écriture du PNG officiel principal
  const pngPath = path.join(PUBLIC_DIR, 'logo-ujpaa.png');
  fs.writeFileSync(pngPath, png1200Buffer);
  console.log('✅ Emblème institutionnel PNG 1200x1200 généré :', pngPath);

  // Écriture d'une copie dans public/assets/ujpaa-institutional-emblem.png
  const assetPngPath = path.join(ASSETS_DIR, 'ujpaa-institutional-emblem.png');
  fs.writeFileSync(assetPngPath, png1200Buffer);
  console.log('✅ Copie d’archive générée :', assetPngPath);

  // Écriture de la version JPEG pour logoss.jpg avec aplat ivoire sécurisé
  const jpgPath = path.join(PUBLIC_DIR, 'logoss.jpg');
  await sharp(png1200Buffer)
    .flatten({ background: '#FDFBF7' }) // Teinte de papier sécurisé ivoire
    .jpeg({ quality: 96, mozjpeg: true })
    .toFile(jpgPath);
  console.log('✅ logoss.jpg mis à jour avec fond parchemin sécurisé :', jpgPath);

  // Également mise à jour de icon.svg
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon.svg'), svgContent, 'utf-8');

  console.log('🎉 Emblème officiel institutionnel UJPAA généré avec succès en haute définition !');
}

buildHighQualityRasterEmblem().catch((err) => {
  console.error('❌ Erreur lors de la génération de l’emblème UJPAA:', err);
  process.exit(1);
});
