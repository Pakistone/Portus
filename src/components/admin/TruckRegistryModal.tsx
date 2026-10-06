import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Search,
  Truck,
  Phone,
  Calendar,
  Download,
  ShieldAlert,
  FileSpreadsheet,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import { exportSalesToExcel } from '../../utils/excelExport';
import type { VehicleCategory } from '../../types';

interface TruckRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTicket?: (ticketNumber: string) => void;
}

export const TruckRegistryModal: React.FC<TruckRegistryModalProps> = ({
  isOpen,
  onClose,
  onSelectTicket,
}) => {
  const { currentUser } = useAuth();
  const { sales, controls, fraudReports } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | string>('ALL');
  const [selectedPlate, setSelectedPlate] = useState<string | null>(null);

  // Extraction unique des véhicules avec catégories et statistiques
  const registryMap = useMemo(() => {
    const map = new Map<
      string,
      {
        plateNumber: string;
        category: string;
        lastDriverPhone: string;
        lastSeen: string;
        totalPassages: number;
        lastAgentName: string;
        lastSector: string;
        salesHistory: typeof sales;
        controlsHistory: typeof controls;
        fraudsHistory: typeof fraudReports;
      }
    >();

    sales.forEach((s) => {
      const plate = s.plateNumber.toUpperCase().trim();
      if (!plate) return;

      const existing = map.get(plate);
      const cat = (s as any).vehicleCategory || 'Camion-citerne';

      if (!existing) {
        map.set(plate, {
          plateNumber: plate,
          category: cat,
          lastDriverPhone: s.driverPhone || '—',
          lastSeen: s.soldAt,
          totalPassages: 1,
          lastAgentName: s.agentName,
          lastSector: s.sectorName || 'Vridi Port',
          salesHistory: [s],
          controlsHistory: controls.filter((c) => c.plateNumber.toUpperCase().trim() === plate),
          fraudsHistory: fraudReports.filter((f) => f.plateNumber.toUpperCase().trim() === plate),
        });
      } else {
        existing.totalPassages += 1;
        existing.salesHistory.push(s);
        if (new Date(s.soldAt) > new Date(existing.lastSeen)) {
          existing.lastSeen = s.soldAt;
          existing.category = cat;
          existing.lastDriverPhone = s.driverPhone || existing.lastDriverPhone;
          existing.lastAgentName = s.agentName;
          existing.lastSector = s.sectorName || existing.lastSector;
        }
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    );
  }, [sales, controls, fraudReports]);

  const filteredRegistry = useMemo(() => {
    return registryMap.filter((item) => {
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (!searchTerm.trim()) return true;

      const term = searchTerm.toLowerCase();
      return (
        item.plateNumber.toLowerCase().includes(term) ||
        item.lastDriverPhone.toLowerCase().includes(term) ||
        item.lastAgentName.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term)
      );
    });
  }, [registryMap, searchTerm, categoryFilter]);

  const selectedVehicleDetail = useMemo(() => {
    if (!selectedPlate) return null;
    return registryMap.find((item) => item.plateNumber === selectedPlate) || null;
  }, [registryMap, selectedPlate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col max-h-[92vh]">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Registre Flotte & Véhicules Corridor Vridi</h2>
                <span className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">
                  Priorité Camions-Citernes
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Base centralisée des passages, contacts chauffeurs et traçabilité ({registryMap.length} véhicules)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre de recherche, filtre et actions */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap gap-3 items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3 flex-1 min-w-[280px]">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Immatriculation, téléphone, agent..."
                className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Filtre Catégorie */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">Toutes Catégories</option>
              <option value="Camion-citerne">Camions-citernes (Hydrocarbures)</option>
              <option value="Conteneur">Conteneurs</option>
              <option value="Plateau">Plateaux</option>
              <option value="Benne">Bennes</option>
              <option value="Marchandises">Marchandises Générales</option>
              <option value="Autre commercial">Autre commercial</option>
            </select>
          </div>

          <button
            onClick={() => exportSalesToExcel(sales)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exporter Registre (Excel)</span>
          </button>
        </div>

        {/* Contenu principal : Table des véhicules ou Fiche Véhicule */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selectedVehicleDetail ? (
            /* Fiche Détaillée d'un Véhicule */
            <div className="space-y-4 bg-slate-950/60 p-5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedPlate(null)}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition"
                  >
                    &larr; Retour à la liste
                  </button>
                  <h3 className="text-base font-bold text-white font-mono">
                    {formatPlateDisplay(selectedVehicleDetail.plateNumber)}
                  </h3>
                  <span className="rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-xs font-semibold">
                    {selectedVehicleDetail.category}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {selectedVehicleDetail.totalPassages} passage(s) enregistré(s)
                </span>
              </div>

              {/* Historique des Ventes / Tickets du Véhicule */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Historique des Passages & Tickets Reçus ({selectedVehicleDetail.salesHistory.length})
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">Date & Heure</th>
                        <th className="p-2.5">N° Ticket</th>
                        <th className="p-2.5">Agent Vendeur</th>
                        <th className="p-2.5">Montant</th>
                        <th className="p-2.5">Chauffeur</th>
                        <th className="p-2.5">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {selectedVehicleDetail.salesHistory.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-800/30">
                          <td className="p-2.5 font-mono text-slate-400">{formatDateTime(s.soldAt)}</td>
                          <td className="p-2.5 font-mono font-bold text-emerald-400">{s.ticketNumber}</td>
                          <td className="p-2.5 text-slate-300">{s.agentName}</td>
                          <td className="p-2.5 font-mono font-bold text-white">{s.price.toLocaleString('fr-FR')} FCFA</td>
                          <td className="p-2.5 text-slate-400 font-mono">{s.driverPhone || '—'}</td>
                          <td className="p-2.5">
                            {onSelectTicket && (
                              <button
                                onClick={() => onSelectTicket(s.ticketNumber)}
                                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline font-bold"
                              >
                                <span>Timeline</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Historique des Contrôles Routiers */}
              {selectedVehicleDetail.controlsHistory.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Contrôles Routiers Subis ({selectedVehicleDetail.controlsHistory.length})
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Contrôleur</th>
                          <th className="p-2.5">Ticket</th>
                          <th className="p-2.5">Résultat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                        {selectedVehicleDetail.controlsHistory.map((c) => (
                          <tr key={c.id}>
                            <td className="p-2.5 font-mono text-slate-400">{formatDateTime(c.controlledAt)}</td>
                            <td className="p-2.5 text-white">{c.controleurName}</td>
                            <td className="p-2.5 font-mono text-emerald-400">{c.ticketNumber}</td>
                            <td className="p-2.5">
                              {c.isValid ? (
                                <span className="text-emerald-400 font-bold">VALIDE</span>
                              ) : (
                                <span className="text-rose-400 font-bold">NON VALIDE</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : filteredRegistry.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              Aucun véhicule trouvé correspondant aux critères.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
                    <th className="py-3 px-4 font-bold">Immatriculation</th>
                    <th className="py-3 px-4 font-bold">Catégorie</th>
                    <th className="py-3 px-4 font-bold">Contact Chauffeur</th>
                    <th className="py-3 px-4 font-bold">Passages</th>
                    <th className="py-3 px-4 font-bold">Dernier Agent</th>
                    <th className="py-3 px-4 font-bold">Dernier Passage</th>
                    <th className="py-3 px-4 font-bold">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {filteredRegistry.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400 text-sm">
                        {formatPlateDisplay(item.plateNumber)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-white flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {item.lastDriverPhone}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 font-bold text-slate-300">
                          {item.totalPassages} passage(s)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{item.lastAgentName}</td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {formatDateTime(item.lastSeen)}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => setSelectedPlate(item.plateNumber)}
                          className="rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-xs text-emerald-400 font-semibold transition"
                        >
                          Fiche &rarr;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pied de modal */}
        <div className="border-t border-slate-800 p-4 bg-slate-950 flex justify-between items-center">
          <span className="text-[11px] text-slate-500">
            Conformité CEDEAO et protection des données chauffeurs
          </span>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
