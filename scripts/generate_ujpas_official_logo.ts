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

export function buildOfficialUjpasLogoSVG(): string {
  const cx = 500;
  const cy = 500;
  const rOuter = 460;
  const rNavy = 445;
  const rInner = 335;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <defs>
    <!-- Tracé du texte circulaire du sceau -->
    <path id="sealTextTop" d="M 115,500 A 385,385 0 1,1 885,500" fill="none"/>
    <path id="sealTextBottom" d="M 885,500 A 385,385 0 0,1 115,500" fill="none"/>

    <!-- Filtre d'ombrage pour relief -->
    <filter id="logoShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#02140d" flood-opacity="0.25"/>
    </filter>
  </defs>

  <!-- 1. CERCLE EXTÉRIEUR DE BORDURE -->
  <circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="#FFFFFF" stroke="#0D4A36" stroke-width="8" filter="url(#logoShadow)"/>

  <!-- Cercles tricolores Côte d'Ivoire en liseré extérieur -->
  <circle cx="${cx}" cy="${cy}" r="${rOuter - 6}" fill="none" stroke="#EA580C" stroke-width="4"/>
  <circle cx="${cx}" cy="${cy}" r="${rOuter - 10}" fill="none" stroke="#FFFFFF" stroke-width="4"/>
  <circle cx="${cx}" cy="${cy}" r="${rOuter - 14}" fill="none" stroke="#15803D" stroke-width="4"/>

  <!-- 2. LARGE BANDE BLEU MARINE OFFICIELLE -->
  <circle cx="${cx}" cy="${cy}" r="${rNavy}" fill="#0F2942" stroke="#FFFFFF" stroke-width="3"/>

  <!-- TEXTE CIRCULAIRE SUPÉRIEUR -->
  <text font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="20.5" fill="#FFFFFF" letter-spacing="3.0">
    <textPath href="#sealTextTop" startOffset="50%" text-anchor="middle">
      UNION DES JEUNES DU PORT POUR L'ASSISTANCE ET LA SÉCURITÉ
    </textPath>
  </text>

  <!-- TEXTE CIRCULAIRE INFÉRIEUR -->
  <text font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="22" fill="#FFFFFF" letter-spacing="4.5">
    <textPath href="#sealTextBottom" startOffset="50%" text-anchor="middle">
      ABIDJAN, CÔTE D'IVOIRE
    </textPath>
  </text>

  <!-- Cercles tricolores intérieurs de la bande bleue -->
  <circle cx="${cx}" cy="${cy}" r="${rInner + 14}" fill="none" stroke="#EA580C" stroke-width="4"/>
  <circle cx="${cx}" cy="${cy}" r="${rInner + 10}" fill="none" stroke="#FFFFFF" stroke-width="4"/>
  <circle cx="${cx}" cy="${cy}" r="${rInner + 6}" fill="none" stroke="#15803D" stroke-width="4"/>

  <!-- 3. DISQUE CENTRAL BLANC -->
  <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="#FFFFFF" stroke="#D97706" stroke-width="6"/>

  <!-- 4. SYMBOLE DE LA POIGNÉE DE MAINS (FRATERNITÉ & SOLIDARITÉ) -->
  <g transform="translate(${cx}, ${cy - 120}) scale(0.85)">
    <!-- Poignet gauche (orange/marron) -->
    <rect x="-85" y="-18" width="35" height="36" rx="6" fill="#EA580C" stroke="#7C2D12" stroke-width="3"/>
    <line x1="-50" y1="-18" x2="-50" y2="18" stroke="#FFFFFF" stroke-width="3"/>
    <!-- Poignet droit (vert/marron) -->
    <rect x="50" y="-18" width="35" height="36" rx="6" fill="#15803D" stroke="#0D4A36" stroke-width="3"/>
    <line x1="50" y1="-18" x2="50" y2="18" stroke="#FFFFFF" stroke-width="3"/>
    <!-- Mains entrelacées -->
    <path d="M -50,-10 C -30,-22 0,-15 15, -4 C 30,8 45,5 50,-10 L 50,15 C 30,25 5,20 -15,10 C -30,0 -45,15 -50,15 Z" fill="#D29062" stroke="#78350F" stroke-width="4"/>
    <path d="M -15,-5 Q 0,8 15,2" fill="none" stroke="#78350F" stroke-width="3"/>
    <path d="M -10,5 Q 5,16 20,8" fill="none" stroke="#78350F" stroke-width="3"/>
  </g>

  <!-- 5. SILHOUETTE GÉOGRAPHIQUE DE LA CÔTE D'IVOIRE TRICOLORE -->
  <g transform="translate(${cx - 135}, ${cy - 100}) scale(0.58)" opacity="0.95">
    <clipPath id="ciLogoClip">
      <path d="${COTE_DIVOIRE_PATH}"/>
    </clipPath>
    <path d="${COTE_DIVOIRE_PATH}" fill="#FFFFFF" stroke="#0D4A36" stroke-width="8"/>
    <g clip-path="url(#ciLogoClip)">
      <rect x="0" y="0" width="166" height="500" fill="#EA580C"/>
      <rect x="166" y="0" width="168" height="500" fill="#FFFFFF"/>
      <rect x="334" y="0" width="166" height="500" fill="#15803D"/>
    </g>
    <path d="${COTE_DIVOIRE_PATH}" fill="none" stroke="#D97706" stroke-width="6"/>
  </g>

  <!-- 6. CAMION ROUTIER DE SURVEILLANCE LOGISTIQUE (CABINE ORANGE) -->
  <g transform="translate(${cx}, ${cy + 25}) scale(1.02)">
    <!-- Remorque / Châssis métallique arrière -->
    <rect x="-80" y="-45" width="65" height="60" rx="4" fill="#E2E8F0" stroke="#0F2942" stroke-width="4"/>
    <line x1="-70" y1="-45" x2="-70" y2="15" stroke="#0F2942" stroke-width="2"/>
    <line x1="-55" y1="-45" x2="-55" y2="15" stroke="#0F2942" stroke-width="2"/>
    <line x1="-40" y1="-45" x2="-40" y2="15" stroke="#0F2942" stroke-width="2"/>
    <line x1="-25" y1="-45" x2="-25" y2="15" stroke="#0F2942" stroke-width="2"/>
    
    <!-- Cabine tracteur orange vif -->
    <path d="M -15,-40 L 40,-40 C 45,-40 55,-25 60,-10 L 65,15 L -15,15 Z" fill="#EA580C" stroke="#7C2D12" stroke-width="4"/>
    <!-- Pare-brise & vitre latérale -->
    <path d="M 0,-34 L 35,-34 C 42,-34 50,-22 52,-12 L 0,-12 Z" fill="#38BDF8" stroke="#0F2942" stroke-width="3"/>
    <!-- Calandre chromée -->
    <rect x="35" y="-6" width="30" height="18" rx="3" fill="#1E293B" stroke="#0F2942" stroke-width="2.5"/>
    <line x1="40" y1="-2" x2="60" y2="-2" stroke="#FFFFFF" stroke-width="2"/>
    <line x1="40" y1="3" x2="60" y2="3" stroke="#FFFFFF" stroke-width="2"/>
    <line x1="40" y1="8" x2="60" y2="8" stroke="#FFFFFF" stroke-width="2"/>
    <!-- Phares routiers -->
    <circle cx="58" cy="9" r="4.5" fill="#FDE047" stroke="#78350F" stroke-width="1.8"/>
    <circle cx="36" cy="9" r="4.5" fill="#FDE047" stroke="#78350F" stroke-width="1.8"/>
    <!-- Roues -->
    <circle cx="-60" cy="18" r="15" fill="#0F172A" stroke="#000000" stroke-width="1"/>
    <circle cx="-60" cy="18" r="7.5" fill="#94A3B8"/>
    <circle cx="-35" cy="18" r="15" fill="#0F172A" stroke="#000000" stroke-width="1"/>
    <circle cx="-35" cy="18" r="7.5" fill="#94A3B8"/>
    <circle cx="20" cy="18" r="15" fill="#0F172A" stroke="#000000" stroke-width="1"/>
    <circle cx="20" cy="18" r="7.5" fill="#94A3B8"/>
    <circle cx="48" cy="18" r="15" fill="#0F172A" stroke="#000000" stroke-width="1"/>
    <circle cx="48" cy="18" r="7.5" fill="#94A3B8"/>
  </g>

  <!-- 7. ÉCUSSON INSTITUTIONNEL BLEU & ANCRE DE MARINE D'ABIDJAN -->
  <g transform="translate(${cx}, ${cy + 125})">
    <!-- Écu bleu avec filet doré -->
    <path d="M -38,-12 L 38,-12 C 38,15 20,32 0,42 C -20,32 -38,15 -38,-12 Z" fill="#0F2942" stroke="#D97706" stroke-width="3"/>
    <!-- Ancre marine dorée d'Abidjan -->
    <g transform="translate(0, 15) scale(0.42)" stroke="#FDE047" stroke-width="4.5" fill="none">
      <circle cx="0" cy="-22" r="8"/>
      <line x1="0" y1="-14" x2="0" y2="28" stroke-width="6"/>
      <line x1="-16" y1="-6" x2="16" y2="-6"/>
      <path d="M -20,12 C -12,32 12,32 20,12"/>
    </g>
    <!-- Mention U.J.P.A.S. -->
    <text x="0" y="2" font-family="'Arial Black', sans-serif" font-weight="900" font-size="11" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">
      U.J.P.A.S.
    </text>
  </g>
</svg>
`;
}

async function run() {
  console.log('🇨🇮 Démarrage de la mise à jour complète du logo officiel UJPAS...');

  const svgContent = buildOfficialUjpasLogoSVG();
  
  // 1. Sauvegarder le SVG officiel
  const svgPath = path.join(PUBLIC_DIR, 'ujpaa-logo.svg');
  const svgPathUjpas = path.join(PUBLIC_DIR, 'ujpas-logo.svg');
  fs.writeFileSync(svgPath, svgContent, 'utf-8');
  fs.writeFileSync(svgPathUjpas, svgContent, 'utf-8');
  console.log('✅ Logo SVG enregistré :', svgPath);

  // 2. Générer le PNG officiel haute définition
  const pngPath = path.join(PUBLIC_DIR, 'logo-ujpaa.png');
  const pngPathUjpas = path.join(PUBLIC_DIR, 'logo-ujpas.png');
  const pngBuffer = await sharp(Buffer.from(svgContent))
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(pngPath, pngBuffer);
  fs.writeFileSync(pngPathUjpas, pngBuffer);
  console.log('✅ Logo PNG HD enregistré :', pngPath);

  // 3. Mettre à jour logoss.jpg avec aplat blanc pour compatibilité maximale
  const jpgPath = path.join(PUBLIC_DIR, 'logoss.jpg');
  await sharp(Buffer.from(svgContent))
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 96, mozjpeg: true })
    .toFile(jpgPath);
  console.log('✅ logoss.jpg enregistré :', jpgPath);

  console.log('🎉 Le logo officiel de l’UJPAS a été mis à jour avec succès sur l’ensemble de l’application !');
}

run().catch((err) => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
