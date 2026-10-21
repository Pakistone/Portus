import React, { useState, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  Search,
  User as UserIcon,
  Receipt,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import {
  formatFCFA,
  formatDateTime,
  formatPlateDisplay,
} from '../../utils/normalization';
import { prioritizeUncoveredTicketsForActor } from '../../context/data/hooks/useRemittances';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preselectedAgentId?: string;
}

export const VentesARemettreModal: React.FC<Props> = ({
  isOpen,
  onClose,
  preselectedAgentId,
}) => {
  const { currentUser } = useAuth();
  const { tickets, carnets, users } = useData();

  const [selectedAgentId, setSelectedAgentId] = useState(preselectedAgentId || 'ALL');
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setSelectedAgentId(preselectedAgentId || 'ALL');
    }
  }, [isOpen, preselectedAgentId]);

  const isAdmin = currentUser?.role === 'ADMINISTRATEUR';
  const isResponsable = currentUser?.role === 'RESPONSABLE';
  const isAgent = currentUser?.role === 'AGENT';

  const agents = useMemo(() => {
    return users.filter((u) => u.role === 'AGENT' && u.isActive);
  }, [users]);

  const uncoveredTickets = useMemo(() => {
    if (!currentUser || (!isAdmin && !isResponsable && !isAgent)) return [];
    const allUncovered = tickets.filter((t) => {
      const isSold = t.status === 'SOLD' || t.status === 'CONTROLLED';
      if (!isSold || t.coveredByRemiseId) return false;
      if (isAgent && t.assignedAgentId !== currentUser.id) return false;
      if (!isAgent && selectedAgentId !== 'ALL' && t.assignedAgentId !== selectedAgentId)
        return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNum = t.ticketNumber.toLowerCase().includes(q);
        const matchPlate = (t.plateNumber || '').toLowerCase().includes(q);
        const matchAgent = (t.assignedAgentName || '').toLowerCase().includes(q);
        return matchNum || matchPlate || matchAgent;
      }
      return true;
    });

    if (isAgent) {
      return allUncovered;
    }

    return prioritizeUncoveredTicketsForActor(allUncovered, carnets, currentUser);
  }, [tickets, carnets, currentUser, isAdmin, isResponsable, isAgent, selectedAgentId, search]);

  if (!isOpen || !currentUser || (!isAdmin && !isResponsable && !isAgent)) return null;

  const totalPendingAmount = uncoveredTickets.length * TICKET_PRICE_FCFA;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Détail des Ventes Non Couvertes par une Remise ({uncoveredTickets.length})
              </h3>
              <p className="text-xs text-slate-400">
                Tickets vendus sur le terrain dont les fonds (5 000 FCFA/ticket) sont en attente de versement
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Résumé financier */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">
              Tickets Vendus Non Versés :
            </span>
            <span className="text-base font-black text-amber-400 font-mono">
              {uncoveredTickets.length} ticket(s)
            </span>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center justify-between">
            <span className="text-xs text-amber-300 font-semibold">
              Montant Total Attendu en Caisse :
            </span>
            <span className="text-base font-black text-amber-300 font-mono">
              {formatFCFA(totalPendingAmount)}
            </span>
          </div>
        </div>

        {/* Filtres */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par numéro de ticket, plaque ou agent..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-hidden"
            />
          </div>

          {!isAgent && (
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-hidden"
            >
              <option value="ALL">Tous les agents ({agents.length})</option>
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.fullName}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Liste des tickets */}
        <div className="mt-3 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
              <tr>
                <th className="py-2.5 px-3">N° Ticket</th>
                <th className="py-2.5 px-3">Carnet</th>
                <th className="py-2.5 px-3">Immatriculation</th>
                <th className="py-2.5 px-3">Agent Percepteur</th>
                <th className="py-2.5 px-3">Date &amp; Heure Vente</th>
                <th className="py-2.5 px-3 text-right">Montant Dû</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {uncoveredTickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 font-sans">
                    <div className="flex flex-col items-center gap-1.5">
                      <CheckCircle2 className="w-7 h-7 text-emerald-500/60" />
                      <span>Aucun ticket vendu en attente de remise pour cette sélection.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                uncoveredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-900/60 transition">
                    <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t.ticketNumber}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {t.carnetNumber}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400 whitespace-nowrap">
                      {t.plateNumber ? formatPlateDisplay(t.plateNumber) : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-200 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                        <span>{t.assignedAgentName || 'Agent'}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>{formatDateTime(t.soldAt)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-400 whitespace-nowrap">
                      {formatFCFA(t.price || TICKET_PRICE_FCFA)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end border-t border-slate-800 pt-3">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
