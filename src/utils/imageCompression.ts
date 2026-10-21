/**
 * Compression Photo Avatar Hors-Ligne pour PORTUS — U.J.P.A.S.
 * Union des Jeunes du Port pour l'Assistance et la Sécurité
 * Redimensionne et compresse les photos d'identité des agents en WebP / JPEG ultra-léger (< 25 Ko)
 * pour un stockage instantané dans IndexedDB et Supabase sans dépendance réseau lourde.
 */

const MAX_TARGET_BYTES = 25 * 1024; // < 25 Ko strict

/**
 * Estime la taille binaire réelle (en octets) d'une chaîne DataURL Base64.
 */
export function estimateDataUrlBytes(dataUrl: string): number {
  if (!dataUrl) return 0;
  const base64Index = dataUrl.indexOf(';base64,');
  if (base64Index === -1) return dataUrl.length;
  const base64Length = dataUrl.length - (base64Index + 8);
  return Math.ceil((base64Length * 3) / 4);
}

/**
 * Charge un objet File image dans un HTMLImageElement.
 */
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier photo sélectionné.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Format de données photo invalide.'));
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Le fichier sélectionné n’est pas une image valide.'));
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Redimensionne (recadrage centré carré ou proportionnel) et compresse la photo d'un agent
 * en WebP (avec repli JPEG automatique) pour garantir un poids < 25 Ko.
 */
export async function compressAvatarImage(
  file: File,
  maxSizePx = 320,
  quality = 0.8
): Promise<string> {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Veuillez sélectionner un fichier image valide (JPEG, PNG ou WebP).');
  }

  const img = await loadImageFromFile(file);

  // Recadrage carré centré pour un rendu d'avatar uniforme dans le Trombinoscope U.J.P.A.S.
  const sourceMinSide = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const sx = Math.max(0, Math.floor(((img.naturalWidth || img.width) - sourceMinSide) / 2));
  const sy = Math.max(0, Math.floor(((img.naturalHeight || img.height) - sourceMinSide) / 2));

  const targetSize = Math.min(maxSizePx, Math.max(120, sourceMinSide));

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexte graphique 2D indisponible pour la compression photo.');
  }

  // Fond neutre ardoise foncé au cas où l'image source comporte de la transparence PNG
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(img, sx, sy, sourceMinSide, sourceMinSide, 0, 0, targetSize, targetSize);

  // Tentative prioritaire en WebP, sinon repli JPEG
  const tryEncode = (mimeType: 'image/webp' | 'image/jpeg', q: number): string => {
    try {
      const encoded = canvas.toDataURL(mimeType, q);
      if (mimeType === 'image/webp' && !encoded.startsWith('data:image/webp')) {
        return canvas.toDataURL('image/jpeg', q);
      }
      return encoded;
    } catch {
      return canvas.toDataURL('image/jpeg', q);
    }
  };

  let currentQuality = Math.min(0.92, Math.max(0.3, quality));
  let dataUrl = tryEncode('image/webp', currentQuality);

  // Ajustement progressif si la photo dépasse 25 Ko
  const qualitySteps = [currentQuality - 0.12, 0.58, 0.45, 0.35];
  for (const stepQuality of qualitySteps) {
    if (estimateDataUrlBytes(dataUrl) <= MAX_TARGET_BYTES) {
      break;
    }
    if (stepQuality > 0.25) {
      dataUrl = tryEncode('image/webp', stepQuality);
    }
  }

  // Si toujours > 25 Ko (image très bruitée), réduire légèrement la dimension à 240px
  if (estimateDataUrlBytes(dataUrl) > MAX_TARGET_BYTES && targetSize > 240) {
    canvas.width = 240;
    canvas.height = 240;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 240, 240);
    ctx.drawImage(img, sx, sy, sourceMinSide, sourceMinSide, 0, 0, 240, 240);
    dataUrl = tryEncode('image/webp', 0.65);
  }

  return dataUrl;
}
