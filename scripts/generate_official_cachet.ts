import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const PUBLIC_DIR = path.resolve('public');

// Generates a scalloped circle (festooned border) path
function generateScallopPath(cx: number, cy: number, r: number, amplitude: number, count: number): string {
  let points: string[] = [];
  const totalSteps = count * 4;
  for (let i = 0; i <= totalSteps; i++) {
    const angle = (i * 2 * Math.PI) / totalSteps;
    // Radial oscillation for scalloped teeth
    const currentR = r + amplitude * Math.sin(count * angle);
    const x = cx + currentR * Math.cos(angle);
    const y = cy + currentR * Math.sin(angle);
    if (i === 0) {
      points.push(`M ${x.toFixed(2)},${y.toFixed(2)}`);
    } else {
      points.push(`L ${x.toFixed(2)},${y.toFixed(2)}`);
    }
  }
  return points.join(' ') + ' Z';
}

export function buildOfficialCachetSVG(): string {
  const cx = 400;
  const cy = 400;
  const outerR = 370;
  const scallopAmp = 5;
  const scallopCount = 64;
  const textR = 300;

  // Paths for circular texts
  const topTextPath = `M ${cx - textR},${cy} A ${textR},${textR} 0 1,1 ${cx + textR},${cy}`;
  const bottomTextPath = `M ${cx + textR},${cy} A ${textR},${textR} 0 0,1 ${cx - textR},${cy}`;

  // Festooned scalloped border path
  const festoonedBorder = generateScallopPath(cx, cy, outerR, scallopAmp, scallopCount);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <!-- Hidden paths for text centering -->
    <path id="cachetTopPath" d="${topTextPath}" fill="none"/>
    <path id="cachetBottomPath" d="${bottomTextPath}" fill="none"/>
  </defs>

  <!-- 1. Festooned (scalloped) outer ring in professional stamp-blue/purple -->
  <path d="${festoonedBorder}" fill="none" stroke="#0F2942" stroke-width="4"/>
  
  <!-- 2. Concentric inner rings -->
  <circle cx="${cx}" cy="${cy}" r="${outerR - 12}" fill="none" stroke="#0F2942" stroke-width="2.5"/>
  <circle cx="${cx}" cy="${cy}" r="${outerR - 18}" fill="none" stroke="#0F2942" stroke-width="1.2"/>
  <circle cx="${cx}" cy="${cy}" r="${textR - 45}" fill="none" stroke="#0F2942" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${textR - 51}" fill="none" stroke="#0F2942" stroke-width="1.2"/>

  <!-- 3. Circular Text - Upper: UNION DES JEUNES DU PORT POUR L'ASSISTANCE ET LA SÉCURITÉ -->
  <text font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="18" fill="#0F2942" letter-spacing="3.2">
    <textPath href="#cachetTopPath" startOffset="50%" text-anchor="middle">
      ★ UNION DES JEUNES DU PORT POUR L'ASSISTANCE ET LA SÉCURITÉ ★
    </textPath>
  </text>

  <!-- 4. Circular Text - Lower: RÉPUBLIQUE DE CÔTE D'IVOIRE • ABIDJAN - PORT-BOUËT -->
  <text font-family="'Arial Black', 'Helvetica', sans-serif" font-weight="900" font-size="18.5" fill="#0F2942" letter-spacing="3.5">
    <textPath href="#cachetBottomPath" startOffset="50%" text-anchor="middle">
      ★ RÉPUBLIQUE DE CÔTE D'IVOIRE • ABIDJAN - PORT-BOUËT ★
    </textPath>
  </text>
  
  <!-- 5. Inner subtle security background pattern (optional, let's keep it clean for high quality stamp overlay) -->
  <circle cx="${cx}" cy="${cy}" r="${textR - 55}" fill="#FFFFFF" fill-opacity="0.95"/>
</svg>
`;
}

async function run() {
  console.log('🇨🇮 Génération du cachet administratif officiel UJPAS...');

  const svgContent = buildOfficialCachetSVG();
  const tempSvgPath = path.join(PUBLIC_DIR, 'cachet-ujpas-temp.svg');
  fs.writeFileSync(tempSvgPath, svgContent, 'utf-8');

  const logoPath = path.join(PUBLIC_DIR, 'logo-ujpas.png');
  const cachetDestPath = path.join(PUBLIC_DIR, 'cachet-ujpas.png');

  if (!fs.existsSync(logoPath)) {
    console.warn(`⚠️ Fichier logo non trouvé à ${logoPath}. Génération du cachet sans logo central...`);
    await sharp(Buffer.from(svgContent))
      .png({ quality: 100 })
      .toFile(cachetDestPath);
  } else {
    // Resize logo to fit exactly inside the stamp's center (diameter ~ 380px, fitting in r = 200 circle)
    const resizedLogoBuffer = await sharp(logoPath)
      .resize(380, 380, { fit: 'inside' })
      .toBuffer();

    // Composite the logo at the center of the stamp SVG
    await sharp(Buffer.from(svgContent))
      .composite([{
        input: resizedLogoBuffer,
        top: 210, // 400 - 380/2 = 210
        left: 210 // 400 - 380/2 = 210
      }])
      .png({ quality: 100 })
      .toFile(cachetDestPath);
  }

  // Clean up temp file
  if (fs.existsSync(tempSvgPath)) {
    fs.unlinkSync(tempSvgPath);
  }

  console.log('🎉 Le cachet administratif officiel UJPAS a été généré avec succès !', cachetDestPath);
}

run().catch(err => {
  console.error('❌ Erreur de génération du cachet:', err);
  process.exit(1);
});
