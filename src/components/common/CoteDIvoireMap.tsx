import React from 'react';

export const COTE_DIVOIRE_SVG_PATH = `
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

interface CoteDIvoireMapProps {
  className?: string;
  variant?: 'watermark' | 'badge' | 'detailed' | 'tricolor';
  showAbidjanPin?: boolean;
}

export const CoteDIvoireMap: React.FC<CoteDIvoireMapProps> = ({
  className = 'w-16 h-16',
  variant = 'detailed',
  showAbidjanPin = true,
}) => {
  const idPrefix = React.useId().replace(/:/g, '');

  if (variant === 'watermark') {
    return (
      <svg
        viewBox="0 0 500 500"
        className={`pointer-events-none select-none text-emerald-500/10 ${className}`}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d={COTE_DIVOIRE_SVG_PATH} />
        {showAbidjanPin && (
          <circle cx="320" cy="435" r="8" className="fill-orange-500/20" />
        )}
      </svg>
    );
  }

  if (variant === 'badge') {
    return (
      <div className={`relative flex items-center justify-center shrink-0 ${className}`}>
        <svg viewBox="0 0 500 500" className="w-full h-full drop-shadow-sm">
          <defs>
            <linearGradient id={`${idPrefix}-badge-grad`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EA580C" />
              <stop offset="50%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#15803D" />
            </linearGradient>
          </defs>
          <path
            d={COTE_DIVOIRE_SVG_PATH}
            fill={`url(#${idPrefix}-badge-grad)`}
            stroke="#0D4A36"
            strokeWidth="8"
          />
          {showAbidjanPin && (
            <circle cx="320" cy="435" r="18" fill="#EA580C" stroke="#FFFFFF" strokeWidth="4" />
          )}
        </svg>
      </div>
    );
  }

  return (
    <div className={`relative inline-block shrink-0 ${className}`}>
      <svg viewBox="0 0 500 500" className="w-full h-full filter drop-shadow-md">
        <defs>
          <clipPath id={`${idPrefix}-map-clip`}>
            <path d={COTE_DIVOIRE_SVG_PATH} />
          </clipPath>
          <linearGradient id={`${idPrefix}-ci-orange`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF7A29" />
            <stop offset="100%" stopColor="#EA580C" />
          </linearGradient>
          <linearGradient id={`${idPrefix}-ci-green`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#16A34A" />
            <stop offset="100%" stopColor="#0D4A36" />
          </linearGradient>
        </defs>

        {/* Contour de fond */}
        <path d={COTE_DIVOIRE_SVG_PATH} fill="#FFFFFF" stroke="#0D4A36" strokeWidth="6" />

        {/* Drapeau Tricolore en Tiers (Orange / Blanc / Vert) */}
        <g clipPath={`url(#${idPrefix}-map-clip)`}>
          <rect x="0" y="0" width="166" height="500" fill={`url(#${idPrefix}-ci-orange)`} opacity="0.95" />
          <rect x="166" y="0" width="168" height="500" fill="#FFFFFF" />
          <rect x="334" y="0" width="166" height="500" fill={`url(#${idPrefix}-ci-green)`} opacity="0.95" />
          {/* Lignes de repère géographique fines */}
          <line x1="50" y1="50" x2="450" y2="450" stroke="#0D4A36" strokeWidth="1.5" opacity="0.15" />
          <line x1="120" y1="40" x2="320" y2="435" stroke="#EA580C" strokeWidth="1" strokeDasharray="4,4" opacity="0.3" />
        </g>

        {/* Liseré or & vert */}
        <path d={COTE_DIVOIRE_SVG_PATH} fill="none" stroke="#D97706" strokeWidth="3" />
        <path d={COTE_DIVOIRE_SVG_PATH} fill="none" stroke="#0D4A36" strokeWidth="1.5" />

        {/* Port Autonome d'Abidjan Pin */}
        {showAbidjanPin && (
          <g>
            <circle cx="320" cy="435" r="14" fill="#EA580C" stroke="#FFFFFF" strokeWidth="3" className="animate-pulse" />
            <circle cx="320" cy="435" r="6" fill="#FDE68A" />
          </g>
        )}
      </svg>
    </div>
  );
};
