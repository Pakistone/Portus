import React, { useRef } from 'react';
import { X, Printer, Download, ExternalLink, CheckCircle2, FileText, AlertCircle } from 'lucide-react';
import { printPdfDocument } from '../../utils/pdfGenerator';
import type { Carnet } from '../../types';

interface CarnetPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  carnet: Carnet | null;
  pdfUrl: string | null;
  filename: string;
}

export const CarnetPrintModal: React.FC<CarnetPrintModalProps> = ({
  isOpen,
  onClose,
  carnet,
  pdfUrl,
  filename,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  if (!isOpen || !carnet || !pdfUrl) return null;

  const handlePrint = () => {
    // 1. Essai d'impression via l'iframe pré-chargée dans le modal
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
        return;
      } catch (err) {
        console.warn('Impression iframe interne bloquée, repli printPdfDocument:', err);
      }
    }

    // 2. Repli helper printPdfDocument
    printPdfDocument(pdfUrl);
  };

  const totalPages = Math.ceil((carnet.size || 9) / 9);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 sm:p-5 animate-fade-in">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-4xl max-h-[94vh] flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Impression Officielle — Carnet {carnet.carnetNumber}
                </h3>
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  {carnet.size || 9} TICKETS • {totalPages} PAGE(S) A4
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Série {carnet.seriesPrefix} ({String(carnet.startNumber).padStart(6, '0')} à {String(carnet.endNumber).padStart(6, '0')}) • Grille 3x3 (99 x 70 mm)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre d'actions d'impression & téléchargement */}
        <div className="border-b border-slate-800 bg-slate-950/40 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Bouton principal Impression directe */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-lg shadow-emerald-950 transition cursor-pointer active:scale-98"
            >
              <Printer className="w-4 h-4 text-emerald-200" />
              <span>Lancer l'Impression (Boîte de dialogue)</span>
            </button>

            {/* Bouton Téléchargement manuel direct */}
            <a
              href={pdfUrl}
              download={filename}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-orange-400" />
              <span>Télécharger le Fichier PDF</span>
            </a>
          </div>

          {/* Bouton d'ouverture plein écran */}
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Ouvrir dans un nouvel onglet</span>
          </a>
        </div>

        {/* Aperçu interactif du PDF */}
        <div className="flex-1 min-h-[360px] max-h-[58vh] bg-slate-950 p-4 overflow-hidden flex flex-col">
          <div className="w-full h-full rounded-xl overflow-hidden border border-slate-800 bg-white">
            <iframe
              ref={iframeRef}
              src={pdfUrl}
              title={`Aperçu PDF Carnet ${carnet.carnetNumber}`}
              className="w-full h-full border-0"
            />
          </div>
        </div>

        {/* Pied de page et recommandations techniques */}
        <div className="border-t border-slate-800 px-5 py-3 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Conseil d'impression :</strong> Orientation <em>Paysage (A4)</em>, mise à l'échelle à <em>100% (Taille réelle)</em> et marges <em>Aucune</em>.
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer ml-auto"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
