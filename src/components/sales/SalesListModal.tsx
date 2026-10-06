import React, { useState } from 'react';
import { X, Search, FileSpreadsheet, MapPin, CheckCircle, Clock, Plus, ShoppingCart, Printer, MessageSquare } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { exportSalesToExcel } from '../../utils/excelExport';
import { formatFCFA, formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import { generateReceiptImageBlob } from '../../utils/receiptImageGenerator';
import { generateWhatsAppReceiptUrl } from '../../utils/cedeao';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewSale?: () => void;
}

export const SalesListModal: React.FC<Props> = ({ isOpen, onClose, onOpenNewSale }) => {
  const { currentUser } = useAuth();
  const { sales, tickets } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [printingTicketId, setPrintingTicketId] = useState<string | null>(null);

  const handlePrintReceipt = async (sale: any) => {
    setPrintingTicketId(sale.id);
    try {
      const ticketObj = tickets.find((t) => t.id === sale.ticketId || t.ticketNumber === sale.ticketNumber);
      const carnetNumber = ticketObj ? ticketObj.carnetNumber : undefined;

      const blob = await generateReceiptImageBlob({
        ticketNumber: sale.ticketNumber,
        plateNumber: sale.plateNumber,
        amount: sale.price,
        agentName: sale.agentName,
        dateStr: formatDateTime(sale.soldAt),
        driverName: sale.driverName || 'Chauffeur non spécifié',
        driverPhone: sale.driverPhone || 'Non renseigné',
        carnetNumber: carnetNumber,
        qrPayload: sale.ticketNumber,
      });

      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.name = 'print-iframe';
      
      document.body.appendChild(iframe);
      
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.write(`
          <html>
            <head>
              <title>Impression Reçu PORTUS - ${sale.ticketNumber}</title>
              <style>
                body { margin: 0; padding: 10px; display: flex; justify-content: center; align-items: flex-start; background-color: white; }
                img { max-width: 100%; height: auto; object-fit: contain; }
                @page { size: auto; margin: 0; }
                @media print {
                  body { padding: 0; }
                  img { width: 100%; }
                }
              </style>
            </head>
            <body>
              <img src="${url}" />
              <script>
                const img = document.querySelector('img');
                if (img.complete) {
                  window.print();
                } else {
                  img.onload = function() {
                    window.print();
                  };
                }
              </script>
            </body>
          </html>
        `);
        doc.close();
      }

      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 10000);
    } catch (err) {
      console.error('[PORTUS Print] Erreur lors de l’impression du reçu:', err);
    } finally {
      setPrintingTicketId(null);
    }
  };

  if (!isOpen) return null;

  // Filtrer selon rôle
  const visibleSales = sales.filter((s) => {
    if (currentUser?.role === 'AGENT') {
      if (s.agentId !== currentUser.id) return false;
    } else if (currentUser?.role === 'RESPONSABLE') {
      if (s.sectorId && currentUser.sectorId && s.sectorId !== currentUser.sectorId) return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchPlate = s.plateNumber.toLowerCase().includes(term);
      const matchTicket = s.ticketNumber.toLowerCase().includes(term);
      const matchAgent = s.agentName.toLowerCase().includes(term);
      return matchPlate || matchTicket || matchAgent;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white">Historique Détaillé des Ventes</h3>
            <p className="text-xs text-slate-400">
              {visibleSales.length} vente(s) enregistrée(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenNewSale && (
              <button
                onClick={onOpenNewSale}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Nouvelle Vente</span>
              </button>
            )}
            <button
              onClick={() => exportSalesToExcel(visibleSales)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition"
              title="Exporter vers Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="mt-4 relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par immatriculation, numéro de ticket ou nom d’agent..."
            className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 pl-9 pr-3 text-xs text-white focus:outline-hidden focus:border-emerald-500"
          />
        </div>

        {/* Tableau Responsive */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
              <tr>
                <th className="py-2.5 px-3">Ticket</th>
                <th className="py-2.5 px-3">Immatriculation</th>
                <th className="py-2.5 px-3">Agent</th>
                <th className="py-2.5 px-3">Date Vente (Originale)</th>
                <th className="py-2.5 px-3">Téléphone</th>
                <th className="py-2.5 px-3">GPS</th>
                <th className="py-2.5 px-3">Mode</th>
                <th className="py-2.5 px-3">Statut Synchro</th>
                <th className="py-2.5 px-3 text-right">Montant</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {visibleSales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    Aucune vente enregistrée.
                  </td>
                </tr>
              ) : (
                visibleSales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-900/60 transition">
                    <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                      {s.ticketNumber}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400 whitespace-nowrap">
                      {formatPlateDisplay(s.plateNumber)}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300 whitespace-nowrap">
                      {s.agentName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                      {formatDateTime(s.soldAt)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {s.driverPhone || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                      {s.gpsStatus === 'AVAILABLE' ? (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <MapPin className="w-3 h-3 text-emerald-400" />
                          <span>{s.gpsLatitude?.toFixed(3)}, {s.gpsLongitude?.toFixed(3)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600">Non capturé</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                      {s.paymentMethod === 'MOBILE_MONEY' ? (
                        (() => {
                          const refStr = s.paymentReference || '';
                          const dashIdx = refStr.indexOf('-');
                          const provider = dashIdx !== -1 ? refStr.slice(0, dashIdx) : 'MOMO';
                          const ref = dashIdx !== -1 ? refStr.slice(dashIdx + 1) : refStr;
                          
                          let bg = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                          if (provider === 'WAVE') bg = 'bg-sky-500/10 text-sky-400 border-sky-500/20';
                          else if (provider === 'ORANGE') bg = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
                          else if (provider === 'MTN') bg = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
                          
                          return (
                            <span className={`inline-flex flex-col rounded-lg border px-2 py-0.5 text-[10px] font-bold ${bg}`}>
                              <span className="font-black text-[9px] uppercase tracking-wider">{provider}</span>
                              {ref && <span className="font-mono text-[9px] text-slate-400">{ref}</span>}
                            </span>
                          );
                        })()
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          💵 Espèces
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                      {s.syncStatus === 'SYNCED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle className="w-3 h-3" /> Synchronisé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <Clock className="w-3 h-3" /> En attente
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white whitespace-nowrap">
                      {formatFCFA(s.price)}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handlePrintReceipt(s)}
                          disabled={!!printingTicketId}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                          title="Imprimer le ticket"
                        >
                          <Printer className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-[10px] font-bold">Imprimer</span>
                        </button>

                        <a
                          href={generateWhatsAppReceiptUrl({
                            dialCode: '',
                            phoneNumber: s.driverPhone || '',
                            ticketNumber: s.ticketNumber,
                            plateNumber: s.plateNumber,
                            amount: s.price,
                            agentName: s.agentName,
                            dateStr: formatDateTime(s.soldAt),
                          })}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`p-1.5 rounded-lg border transition inline-flex items-center gap-1 cursor-pointer ${
                            s.driverPhone 
                              ? 'bg-emerald-600/20 border-emerald-500/30 hover:bg-emerald-600/40 text-emerald-300' 
                              : 'bg-slate-800/40 border-slate-700/30 hover:bg-slate-800 text-slate-500 hover:text-slate-400'
                          }`}
                          title={s.driverPhone ? "Partager le ticket via WhatsApp" : "Partager sans numéro prédéfini"}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-[10px] font-bold">WhatsApp</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
