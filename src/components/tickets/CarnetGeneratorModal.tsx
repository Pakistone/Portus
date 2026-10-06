import React, { useState } from 'react';
import { X, Layers, Printer, CheckCircle, AlertTriangle, Download, ExternalLink } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { CARNET_SIZE_MULTIPLE, ORG_INFO } from '../../config/constants';
import { generateCarnetPrintPDF, printPdfDocument } from '../../utils/pdfGenerator';
import { CarnetPrintModal } from './CarnetPrintModal';
import type { Carnet, Ticket } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CarnetGeneratorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { createCarnet, users, tickets } = useData();

  const [seriesPrefix, setSeriesPrefix] = useState('VRDCH');
  const [size, setSize] = useState<string>('18'); // Multiple de 3 par défaut
  const [startPhysicalNumber, setStartPhysicalNumber] = useState<string>('');
  const [assignedResponsableId, setAssignedResponsableId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCarnet, setCreatedCarnet] = useState<Carnet | null>(null);
  const [createdTickets, setCreatedTickets] = useState<Ticket[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<{ url: string; filename: string } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  if (!isOpen) return null;

  const responsables = users.filter((u) => u.role === 'RESPONSABLE' && u.isActive);

  // Suggestions de tailles valides strictement multiples de 3
  const sizeSuggestions = [3, 9, 18, 27, 45, 90, 150, 153];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numSize = Number(size || 0);
    if (!numSize || numSize <= 0 || numSize % CARNET_SIZE_MULTIPLE !== 0) {
      setError(`Le nombre de tickets doit obligatoirement être un multiple de 3 (ex: 3, 6, 9, 12, 15... 150, 153). Toute autre valeur est refusée.`);
      return;
    }

    setLoading(true);
    try {
      const res = await createCarnet({
        seriesPrefix,
        size: numSize,
        startPhysicalNumber: startPhysicalNumber ? Number(startPhysicalNumber) : 1,
        assignedResponsableId: assignedResponsableId || undefined,
      });
      setCreatedCarnet(res.carnet);
      setCreatedTickets(res.tickets);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la création du carnet.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintPDF = async () => {
    if (!createdCarnet || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const carnetTickets = createdTickets.length > 0 
        ? createdTickets 
        : tickets.filter((t) => t.carnetId === createdCarnet.id || t.carnetNumber === createdCarnet.carnetNumber);
      const filename = `PORTUS_UJPAS_CARNET_${createdCarnet.carnetNumber}_${createdCarnet.size || 9}TICKETS.pdf`;
      const url = await generateCarnetPrintPDF(createdCarnet, carnetTickets);
      if (url) {
        setGeneratedPdfUrl({ url, filename });
        setShowPrintModal(true);
        printPdfDocument(url);
      }
    } catch (err: any) {
      console.error('Erreur téléchargement/impression PDF carnet:', err);
      setDownloadError(err?.message || 'Erreur lors de la génération du PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-lg my-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 pb-28 sm:pb-32 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Générer un Nouveau Carnet</h3>
          </div>
          <button
            onClick={() => {
              setCreatedCarnet(null);
              onClose();
            }}
            className="rounded-lg p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {createdCarnet ? (
          <div className="mt-5 space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-white">{createdCarnet.carnetNumber}</h4>
              <p className="text-xs text-slate-400 mt-1">
                Génération réussie de {createdCarnet.size} tickets (Numéros {createdCarnet.startNumber} à {createdCarnet.endNumber})
              </p>
              {createdCarnet.assignedToResponsableName && (
                <p className="text-xs text-emerald-400 font-semibold mt-1">
                  Attribué à : {createdCarnet.assignedToResponsableName}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400 text-left space-y-1.5">
              <p className="font-bold text-orange-400">Normes de Sécurité Officielle UJPAS 🇨🇮 :</p>
              <p>• Format physique : <strong>9 tickets par feuille A4 Paysage (99 × 70 mm)</strong></p>
              <p>• Fond de référence officiel : <strong>Gabarit officiel UJPAS HD</strong></p>
              <p>• Surimpression dynamique : <strong>N° VRDCH séquentiel &amp; QR code avec badge UJPAS</strong></p>
              <p>• Contacts officiels : <strong>{ORG_INFO.CONTACT_TEL} | {ORG_INFO.CONTACT_EMAIL}</strong></p>
              <p>• ⚠️ Le montant unitaire de 5 000 FCFA n'est pas imprimé sur le ticket physique</p>
            </div>

            {downloadError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{downloadError}</span>
              </div>
            )}

            {generatedPdfUrl && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex flex-col gap-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>PDF généré avec succès ({generatedPdfUrl.filename})</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      printPdfDocument(generatedPdfUrl.url);
                      setShowPrintModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition shadow"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Lancer l'Impression</span>
                  </button>
                  <a
                    href={generatedPdfUrl.url}
                    download={generatedPdfUrl.filename}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                  >
                    <Download className="w-3.5 h-3.5 text-orange-400" />
                    <span>Télécharger PDF</span>
                  </a>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handlePrintPDF}
                disabled={downloading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-orange-600 via-orange-500 to-emerald-600 hover:from-orange-500 hover:to-emerald-500 py-3 text-xs font-bold text-white shadow-lg transition cursor-pointer border border-orange-400/30 disabled:opacity-60"
              >
                <Printer className={`w-4 h-4 ${downloading ? 'animate-spin' : ''}`} />
                <span>
                  {downloading
                    ? 'Génération du PDF en cours...'
                    : generatedPdfUrl
                    ? 'Régénérer & Imprimer à nouveau'
                    : 'Générer & Imprimer le PDF (9 tickets/page)'}
                </span>
              </button>
              <button
                onClick={() => {
                  setCreatedCarnet(null);
                  onClose();
                }}
                className="rounded-xl bg-slate-800 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Terminer
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Préfixe de Série
              </label>
              <input
                type="text"
                required
                value={seriesPrefix}
                onChange={(e) => setSeriesPrefix(e.target.value.toUpperCase())}
                placeholder="VRDCH"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm text-white focus:border-emerald-500 focus:outline-hidden"
              />
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] text-slate-500">Séries suggérées :</span>
                {['VRDCH', 'VRD', 'UJPAS'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSeriesPrefix(p)}
                    className={`px-2 py-0.5 text-[11px] rounded font-bold border transition ${
                      seriesPrefix === p
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    {p} {p === 'VRDCH' && '★ Nouveau UJPAS'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  Taille du carnet (Nombre de tickets)
                </label>
                <span className="text-[11px] text-amber-400 font-bold">
                  Obligatoirement multiple de 3
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                required
                value={size}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d]/g, '').replace(/^0+/, '');
                  setSize(cleaned);
                }}
                placeholder="18"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm text-white focus:border-emerald-500 focus:outline-hidden"
              />
              {/* Raccourcis de tailles */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {sizeSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(String(s))}
                    className={`px-2.5 py-1 text-xs rounded-lg border font-semibold ${
                      Number(size || 0) === s
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {s} tickets ({s / 9 >= 1 ? `${Math.ceil(s / 9)} page(s) A4` : '1 page'})
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Numéro physique de départ (Optionnel)
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="1 (par défaut)"
                value={startPhysicalNumber}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d]/g, '').replace(/^0+/, '');
                  setStartPhysicalNumber(cleaned);
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm text-white focus:border-emerald-500 focus:outline-hidden"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Les numéros physiques sont uniques au sein d'un même carnet.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Attribuer immédiatement à un Responsable (Optionnel)
              </label>
              <select
                value={assignedResponsableId}
                onChange={(e) => setAssignedResponsableId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm text-white focus:border-emerald-500 focus:outline-hidden"
              >
                <option value="">-- Conserver en stock central Admin --</option>
                {responsables.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName} ({r.sectorName || 'Secteur non défini'})
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-400 space-y-1">
              <p className="font-bold text-orange-400">Règles d’impression physique UJPAS 🇨🇮 :</p>
              <p>• 9 tickets par page A4 paysage (99 × 70 mm).</p>
              <p>• Fond graphique officiel de haute sécurité UJPAS.</p>
              <p>• Numéro séquentiel N° VRDCH et QR Code scannable avec badge central UJPAS.</p>
              <p>• Le montant de 5 000 FCFA ne figure pas sur le ticket physique.</p>
              <p>• Contacts officiels : {ORG_INFO.CONTACT_TEL} | {ORG_INFO.CONTACT_EMAIL}.</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-linear-to-r from-orange-600 via-orange-500 to-emerald-600 hover:from-orange-500 hover:to-emerald-500 py-2.5 text-xs font-bold text-white shadow-md transition disabled:opacity-50 cursor-pointer border border-orange-400/30"
              >
                {loading ? 'Génération...' : 'Générer le Carnet UJPAS'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Modal d'aperçu et d'impression officielle du carnet */}
      {showPrintModal && createdCarnet && generatedPdfUrl && (
        <CarnetPrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          carnet={createdCarnet}
          pdfUrl={generatedPdfUrl.url}
          filename={generatedPdfUrl.filename}
        />
      )}
    </div>
  );
};
