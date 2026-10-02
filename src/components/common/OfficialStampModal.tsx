import React from 'react';
import { X, Download, Printer, Shield, CheckCircle2 } from 'lucide-react';

interface OfficialStampModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OfficialStampModal({ isOpen, onClose }: OfficialStampModalProps) {
  if (!isOpen) return null;

  const handleDownloadPNG = () => {
    const downloadLink = document.createElement('a');
    downloadLink.href = '/cachet-ujsrv.png';
    downloadLink.download = 'CACHET_OFFICIEL_UJSRV_PORTUS.png';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cachet Officiel U.J.S.R.V. — PORTUS</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: sans-serif; background: #fff; }
            .stamp-container { width: 350px; height: 350px; display: flex; align-items: center; justify-content: center; }
            .stamp-container img { max-width: 100%; max-height: 100%; object-fit: contain; }
            .info { margin-top: 20px; text-align: center; color: #334155; }
          </style>
        </head>
        <body>
          <div class="stamp-container">
            <img src="/cachet-ujsrv.png" alt="Cachet Officiel UJSRV" />
          </div>
          <div class="info">
            <h3>U.J.S.R.V. — Cachet Officiel de Surveillance Camion</h3>
            <p>Zone Industrielle & Portuaire de Vridi | Contacts : 07 77 91 78 04 / 01 03 31 37 68</p>
          </div>
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl overflow-hidden flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">Cachet Officiel U.J.S.R.V.</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Image officielle haute résolution (Portus)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps - Aperçu du Cachet réel */}
        <div className="p-8 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950/50">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 flex flex-col items-center">
            <img
              src="/cachet-ujsrv.png"
              alt="Cachet Officiel Réel U.J.S.R.V."
              className="w-72 h-72 sm:w-80 sm:h-80 object-contain drop-shadow-md"
            />
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-4 h-4" />
            Image du cachet physique officiel, certifiée conforme pour l'impression des documents et des carnets.
          </div>
        </div>

        {/* Pied d'actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            Fermer
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
          <button
            onClick={handleDownloadPNG}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Download className="w-4 h-4" />
            Télécharger PNG
          </button>
        </div>
      </div>
    </div>
  );
}
