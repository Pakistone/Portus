import React, { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import {
  Users,
  Phone,
  MapPin,
  Clock,
  Printer,
  Search,
  CheckCircle2,
  User as UserIcon,
  Camera,
} from 'lucide-react';
import { formatFCFA, formatDateTime } from '../../utils/normalization';
import { AgentBadgeModal } from './AgentBadgeModal';
import type { User } from '../../types';

interface AgentDirectoryViewProps {
  viewMode?: 'CONTROLEUR' | 'RESPONSABLE' | 'ADMIN';
}

export const AgentDirectoryView: React.FC<AgentDirectoryViewProps> = ({ viewMode = 'ADMIN' }) => {
  const { currentUser } = useAuth();
  const { users, sales, tickets, remises, ticketPrice } = useData();

  const [badgeModalOpen, setBadgeModalOpen] = useState(false);
  const [selectedAgentForBadge, setSelectedAgentForBadge] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Gouvernance U.J.P.A.S. : Pool global d'agents mobiles sur toute la zone portuaire
  const agents = useMemo(() => {
    const activeAgents = users.filter((u) => u.role === 'AGENT' && u.isActive !== false);
    if (!searchTerm.trim()) return activeAgents;
    const q = searchTerm.toLowerCase().trim();
    return activeAgents.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (u.matricule && u.matricule.toLowerCase().includes(q))
    );
  }, [users, searchTerm]);

  // Calculs pour la vue Responsable (étanchéité financière par superviseur)
  const responsableStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        ticketsVendusCeResp: number;
        ticketsEnMainCeResp: number;
        montantAttendu: number;
        montantRemis: number;
        soldeDu: number;
        otherRespTicketsCount: number;
        otherRespNames: Set<string>;
      }
    >();

    if (viewMode !== 'RESPONSABLE' && currentUser?.role !== 'RESPONSABLE') return stats;

    const unitPrice = ticketPrice || 5000;

    agents.forEach((agent) => {
      const agentTickets = tickets.filter((t) => t.assignedAgentId === agent.id);

      const ticketsCeResp = agentTickets.filter(
        (t) => !t.assignedResponsableId || t.assignedResponsableId === currentUser?.id
      );
      const ticketsEnMainCeResp = ticketsCeResp.filter(
        (t) => t.status === 'ASSIGNED_TO_AGENT'
      ).length;
      const soldTicketsCeResp = ticketsCeResp.filter(
        (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
      );
      const montantAttendu = soldTicketsCeResp.length * unitPrice;

      const agentRemises = remises.filter(
        (r) => r.agentId === agent.id && (!r.responsableId || r.responsableId === currentUser?.id)
      );
      const montantRemis = agentRemises.reduce((sum, r) => sum + r.amount, 0);

      const otherRespTickets = agentTickets.filter(
        (t) => t.assignedResponsableId && t.assignedResponsableId !== currentUser?.id
      );
      const otherRespNames = new Set<string>();
      otherRespTickets.forEach((t) => {
        if (t.assignedResponsableName) otherRespNames.add(t.assignedResponsableName);
      });

      stats.set(agent.id, {
        ticketsVendusCeResp: soldTicketsCeResp.length,
        ticketsEnMainCeResp,
        montantAttendu,
        montantRemis,
        soldeDu: Math.max(0, montantAttendu - montantRemis),
        otherRespTicketsCount: otherRespTickets.length,
        otherRespNames,
      });
    });

    return stats;
  }, [agents, tickets, remises, currentUser, viewMode, ticketPrice]);

  // Dernière position GPS connue issue des ventes pour chaque agent
  const agentLastGpsMap = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number; accuracy?: number; time: string }>();

    const sortedSales = [...sales].sort(
      (a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()
    );

    sortedSales.forEach((s) => {
      if (
        s.agentId &&
        s.gpsStatus === 'AVAILABLE' &&
        s.gpsLatitude != null &&
        s.gpsLongitude != null &&
        !map.has(s.agentId)
      ) {
        map.set(s.agentId, {
          lat: s.gpsLatitude,
          lng: s.gpsLongitude,
          accuracy: s.gpsAccuracy ?? undefined,
          time: s.soldAt,
        });
      }
    });

    return map;
  }, [sales]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <span>Trombinoscope &amp; Annuaire Officiel des Agents U.J.P.A.S.</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {viewMode === 'CONTROLEUR'
              ? 'Identification visuelle anti-usurpation, contacts directs et dernière position GPS terrain'
              : viewMode === 'RESPONSABLE'
              ? 'Pool global des agents mobiles de la zone portuaire et suivi financier de vos lots'
              : 'Effectif global des agents mobiles U.J.P.A.S. et édition des badges professionnels'}
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher nom, matricule, tél..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
          />
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center text-xs text-slate-400">
          Aucun agent actif ne correspond à votre recherche.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const gps = agentLastGpsMap.get(agent.id);
            const rStats = responsableStats.get(agent.id);

            return (
              <div
                key={agent.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg flex flex-col justify-between space-y-4 hover:border-slate-700 transition"
              >
                <div className="space-y-3">
                  {/* En-tête avec Photo d'Identité / Trombinoscope */}
                  <div className="flex items-center gap-3.5">
                    <div className="relative h-16 w-16 shrink-0 rounded-2xl overflow-hidden border-2 border-emerald-500/40 bg-slate-800 flex items-center justify-center shadow-md">
                      {agent.avatarUrl ? (
                        <img
                          src={agent.avatarUrl}
                          alt={agent.fullName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <UserIcon className="w-7 h-7 text-slate-500" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter text-slate-500">
                            Sans Photo
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-black text-white truncate">
                          {agent.fullName}
                        </h3>
                        <span className="shrink-0 inline-flex items-center rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                          Pool Mobile U.J.P.A.S.
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono truncate">
                        @{agent.username}
                        {agent.matricule ? ` • ${agent.matricule}` : ''}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {agent.avatarUrl ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Photo d’identité certifiée</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400">
                            <Camera className="w-3 h-3" />
                            <span>Photo à enregistrer</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Téléphone & Appel direct */}
                  <div className="pt-2.5 flex items-center justify-between border-t border-slate-800/80">
                    <span className="text-xs text-slate-400">Contact direct :</span>
                    {agent.phone ? (
                      <a
                        href={`tel:${agent.phone}`}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-mono font-bold text-emerald-300 hover:bg-emerald-600/30 transition"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{agent.phone}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Non renseigné</span>
                    )}
                  </div>
                </div>

                {/* Spécificité Vue Contrôleur : GPS uniquement */}
                {viewMode === 'CONTROLEUR' && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-slate-300">
                      <MapPin className="w-4 h-4 text-emerald-400" />
                      <span>Dernière position GPS connue :</span>
                    </div>
                    {gps ? (
                      <div className="space-y-1 font-mono text-[11px] text-slate-300 pl-5">
                        <div>
                          Lat, Lng : {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                        </div>
                        {gps.accuracy && <div>Précision : ±{Math.round(gps.accuracy)}m</div>}
                        <div className="text-slate-400 flex items-center gap-1 pt-0.5">
                          <Clock className="w-3 h-3 text-blue-400" />
                          <span>{formatDateTime(gps.time)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="pl-5 text-slate-500 italic text-[11px]">
                        Aucune position GPS récente enregistrée.
                      </div>
                    )}
                  </div>
                )}

                {/* Spécificité Vue Responsable : Chiffres étanches */}
                {viewMode === 'RESPONSABLE' && rStats && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Tickets en main (vos lots) :</span>
                      <span className="font-bold text-blue-300 font-mono">
                        {rStats.ticketsEnMainCeResp}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Tickets vendus (vos lots) :</span>
                      <span className="font-bold text-white font-mono">
                        {rStats.ticketsVendusCeResp}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Montant attendu :</span>
                      <span className="font-bold text-emerald-400 font-mono">
                        {formatFCFA(rStats.montantAttendu)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                      <span className="text-slate-400">Montant remis :</span>
                      <span className="font-bold text-blue-400 font-mono">
                        {formatFCFA(rStats.montantRemis)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold">Solde dû :</span>
                      <span
                        className={`font-bold font-mono ${
                          rStats.soldeDu > 0 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {formatFCFA(rStats.soldeDu)}
                      </span>
                    </div>

                    {rStats.otherRespTicketsCount > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 italic">
                        ℹ️ {rStats.otherRespTicketsCount} autre(s) ticket(s) confié(s) par{' '}
                        {Array.from(rStats.otherRespNames).join(', ') || 'un autre superviseur'}
                      </div>
                    )}
                  </div>
                )}

                {viewMode !== 'CONTROLEUR' && (
                  <button
                    onClick={() => {
                      setSelectedAgentForBadge(agent);
                      setBadgeModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-orange-600/20 border border-orange-500/30 px-3 py-2 text-xs font-bold text-orange-300 hover:bg-orange-600/30 transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Éditer Photo &amp; Imprimer Badge U.J.P.A.S.</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AgentBadgeModal
        isOpen={badgeModalOpen}
        onClose={() => {
          setBadgeModalOpen(false);
          setSelectedAgentForBadge(null);
        }}
        selectedAgent={selectedAgentForBadge || undefined}
      />
    </div>
  );
};
