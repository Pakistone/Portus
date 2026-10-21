import React, { useState, useMemo, useEffect } from 'react';
import {
  UserPlus,
  HandCoins,
  Ticket as TicketIcon,
  AlertTriangle,
  CheckCircle2,
  Users,
  Receipt,
  Search,
  User as UserIcon,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { CoteDIvoireMap } from '../common/CoteDIvoireMap';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA } from '../../utils/normalization';
import { EntityRankingChart, EntityRankItem } from './DashboardCharts';
import { normalizeSectorId } from '../../db/supabaseService';

// Modals
import { TicketAssignmentModal } from '../tickets/TicketAssignmentModal';
import { RemiseFormModal } from '../remises/RemiseFormModal';
import { RemisesListModal } from '../remises/RemisesListModal';
import { TicketListModal } from '../tickets/TicketListModal';
import { SalesListModal } from '../sales/SalesListModal';
import { ControlsListModal } from '../controls/ControlsListModal';
import { VentesARemettreModal } from '../remises/VentesARemettreModal';
import { AdvancedSearchModal } from '../search/AdvancedSearchModal';
import { ExpensesModule } from '../expenses/ExpensesModule';
import { AgentDirectoryView } from '../agents/AgentDirectoryView';

export const ResponsableDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { users, tickets, remises, alerts } = useData();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'agents' | 'expenses'>('dashboard');

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [remiseModalOpen, setRemiseModalOpen] = useState(false);
  const [selectedAgentForRemise, setSelectedAgentForRemise] = useState<string | undefined>();
  const [ventesARemettreOpen, setVentesARemettreOpen] = useState(false);
  const [selectedAgentForVentes, setSelectedAgentForVentes] = useState<string | undefined>();
  const [remisesListOpen, setRemisesListOpen] = useState(false);
  const [ticketsListOpen, setTicketsListOpen] = useState(false);
  const [salesListOpen, setSalesListOpen] = useState(false);
  const [controlsListOpen, setControlsListOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  useEffect(() => {
    const handleNotificationClicked = (e: Event) => {
      const customEvent = e as CustomEvent<{ type?: string }>;
      const notification = customEvent.detail;
      if (!notification) return;

      const type = notification.type;
      if (type === 'ASSIGNMENT') {
        setAssignmentModalOpen(true);
      } else if (type === 'REMITTANCE' || type === 'FINANCIAL_ALERT') {
        setRemiseModalOpen(true);
      }
    };
    window.addEventListener('portus-notification-clicked', handleNotificationClicked);
    return () =>
      window.removeEventListener('portus-notification-clicked', handleNotificationClicked);
  }, []);

  // ---------------------------------------------------------------------------
  // GOUVERNANCE U.J.P.A.S. : POOL GLOBAL D'AGENTS MOBILES & LOTS DU SUPERVISEUR
  // ---------------------------------------------------------------------------
  const respSector = useMemo(() => {
    return normalizeSectorId(currentUser?.sectorId, currentUser?.sectorName);
  }, [currentUser?.sectorId, currentUser?.sectorName]);

  // Tous les agents actifs sont mobiles et mobilisables par tout superviseur
  const sectorAgents = useMemo(() => {
    return users.filter((u) => u.role === 'AGENT' && u.isActive !== false);
  }, [users]);

  // Tickets gérés par ce superviseur (ou rattachés à son périmètre)
  const sectorTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (t.assignedResponsableId === currentUser?.id) return true;
      if (!t.assignedResponsableId && !respSector) return true;
      if (!t.assignedResponsableId && respSector) {
        const tSector = normalizeSectorId(t.sectorId);
        return !tSector || tSector === respSector || t.sectorId === currentUser?.sectorId;
      }
      return false;
    });
  }, [tickets, currentUser, respSector]);

  // 1. Tickets disponibles (prêts à attribuer ou en main des agents)
  const availableInSector = useMemo(() => {
    return sectorTickets.filter(
      (t) =>
        t.status === 'ASSIGNED_TO_RESPONSIBLE' ||
        t.status === 'AVAILABLE' ||
        t.status === 'ASSIGNED_TO_AGENT'
    );
  }, [sectorTickets]);

  const readyToAssignCount = useMemo(() => {
    return sectorTickets.filter(
      (t) => t.status === 'ASSIGNED_TO_RESPONSIBLE' || t.status === 'AVAILABLE'
    ).length;
  }, [sectorTickets]);

  const inAgentHandsCount = useMemo(() => {
    return sectorTickets.filter((t) => t.status === 'ASSIGNED_TO_AGENT').length;
  }, [sectorTickets]);

  // 2. Tickets vendus du lot superviseur
  const sectorSoldTickets = useMemo(() => {
    return sectorTickets.filter((t) => t.status === 'SOLD' || t.status === 'CONTROLLED');
  }, [sectorTickets]);
  const ticketsSold = sectorSoldTickets.length;

  // 3. Valeur des ventes
  const totalSalesAmount = ticketsSold * TICKET_PRICE_FCFA;

  // 4. Remises encaissées par ce superviseur
  const sectorRemises = useMemo(() => {
    return remises.filter((r) => {
      if (r.responsableId === currentUser?.id) return true;
      if (!r.responsableId && respSector) {
        const rSector = normalizeSectorId(r.sectorId);
        return rSector === respSector || r.sectorId === currentUser?.sectorId;
      }
      return false;
    });
  }, [remises, currentUser, respSector]);
  const totalRemittedAmount = sectorRemises.reduce((sum, r) => sum + r.amount, 0);

  // 5. Solde à récupérer auprès des agents
  const remainingSectorBalance = Math.max(0, totalSalesAmount - totalRemittedAmount);
  const sectorEcart = Math.max(0, totalRemittedAmount - totalSalesAmount);

  // 6. Alertes financières
  const sectorAlerts = useMemo(() => {
    return alerts;
  }, [alerts]);

  // 7. Ventes non couvertes
  const unremittedTickets = useMemo(() => {
    return sectorSoldTickets.filter((t) => !t.coveredByRemiseId);
  }, [sectorSoldTickets]);

  // 8. Ventes par agent (graphique de classement)
  const salesByAgentItems: EntityRankItem[] = useMemo(() => {
    return sectorAgents
      .map((ag) => {
        const agTickets = sectorTickets.filter((t) => t.assignedAgentId === ag.id);
        const count = agTickets.filter(
          (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
        ).length;
        const amount = count * TICKET_PRICE_FCFA;

        const agRemises = sectorRemises.filter((r) => r.agentId === ag.id);
        const remitted = agRemises.reduce((sum, r) => sum + r.amount, 0);

        return {
          id: ag.id,
          name: ag.fullName,
          detail: ag.phone || 'Pool Mobile U.J.P.A.S.',
          count,
          amount,
          remitted,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [sectorAgents, sectorTickets, sectorRemises]);

  const handleOpenRemiseForAgent = (agentId: string) => {
    setSelectedAgentForRemise(agentId);
    setRemiseModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 space-y-5">
      {/* Navigation Onglets */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 flex-wrap">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
            activeTab === 'dashboard'
              ? 'bg-linear-to-r from-orange-600 to-emerald-700 text-white shadow-md shadow-orange-950/40 border border-orange-400/30'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Tableau de Bord Superviseur U.J.P.A.S.</span>
        </button>
        <button
          onClick={() => setActiveTab('agents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            activeTab === 'agents'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Trombinoscope &amp; Suivi Agents ({sectorAgents.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            activeTab === 'expenses'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>💰 Dépenses</span>
        </button>
      </div>

      {activeTab === 'expenses' ? (
        <ExpensesModule />
      ) : activeTab === 'agents' ? (
        <AgentDirectoryView viewMode="RESPONSABLE" />
      ) : (
        <div className="space-y-5">
          {/* ========================================================================= */}
          {/* EN-TÊTE DU TABLEAU DE BORD SUPERVISEUR                                    */}
          {/* ========================================================================= */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-white/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-xl">
            <div className="absolute right-0 top-0 pointer-events-none opacity-5 overflow-hidden">
              <CoteDIvoireMap
                variant="watermark"
                className="w-56 h-56 -mr-12 -mt-12 text-emerald-400"
              />
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase font-black tracking-wider text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                  Supervision Terrain U.J.P.A.S. 🇨🇮
                </span>
                <span className="rounded bg-emerald-950 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  {currentUser?.sectorName || 'Zone Portuaire & Industrielle'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                Tableau de Bord Superviseur (Responsable)
              </h2>
              <p className="text-xs text-slate-400">
                Distribution des carnets au pool global d'agents mobiles et encaissement direct des remises vers l'Administrateur.
              </p>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOC 1 : INDICATEURS CLÉS DE PERFORMANCE (KPIs)                           */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <TicketIcon className="w-4 h-4 text-orange-400" />
                <span>Bloc 1 — Indicateurs Clés du Périmètre</span>
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">Vue En Temps Réel</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                title="Tickets Disponibles"
                value={availableInSector.length}
                subtitle={`${readyToAssignCount} prêts • ${inAgentHandsCount} en main`}
                icon={<TicketIcon className="w-4 h-4" />}
                variant="blue"
                onClick={() => setTicketsListOpen(true)}
              />
              <StatCard
                title="Valeur des Ventes"
                value={formatFCFA(totalSalesAmount)}
                subtitle={`${ticketsSold} ticket(s) vendu(s)`}
                icon={<Receipt className="w-4 h-4" />}
                variant="emerald"
                onClick={() => setSalesListOpen(true)}
              />
              <StatCard
                title="Remises Encaissées"
                value={formatFCFA(totalRemittedAmount)}
                subtitle={`${sectorRemises.length} versement(s)`}
                icon={<HandCoins className="w-4 h-4" />}
                variant="blue"
                onClick={() => setRemisesListOpen(true)}
              />
              <StatCard
                title="Solde à Récupérer"
                value={formatFCFA(remainingSectorBalance)}
                subtitle={
                  sectorEcart > 0
                    ? `Écart : +${formatFCFA(sectorEcart)}`
                    : 'A verser par les agents'
                }
                icon={<AlertTriangle className="w-4 h-4" />}
                variant={remainingSectorBalance > 0 ? 'amber' : 'slate'}
                onClick={() => {
                  setSelectedAgentForVentes(undefined);
                  setVentesARemettreOpen(true);
                }}
              />
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOC 2 : ACTIONS TERRAIN IMMÉDIATES (2 Grands Boutons Distincts)          */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-orange-400" />
                <span>Bloc 2 — Actions Terrain Immédiates</span>
              </h3>
              <span className="text-[11px] text-slate-500">Supervision directe</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* BOUTON LARGE 1 : ATTRIBUER TICKETS */}
              <button
                onClick={() => setAssignmentModalOpen(true)}
                className="relative overflow-hidden rounded-2xl bg-linear-to-r from-orange-600 via-orange-500 to-amber-500 p-4 sm:p-5 text-left text-white shadow-xl shadow-orange-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-orange-400/40 group"
              >
                <div className="absolute right-3 top-3 opacity-20 group-hover:opacity-30 transition pointer-events-none">
                  <UserPlus className="w-16 h-16 text-white" />
                </div>
                <div className="relative z-10 flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                      Attribution Terrain
                    </span>
                    <h4 className="text-lg sm:text-xl font-black text-white">Attribuer Carnets / Tickets</h4>
                    <p className="text-xs text-orange-100/90 mt-0.5">
                      Confier un carnet ou lot de tickets à un agent libre du pool mobile
                    </p>
                  </div>
                </div>
              </button>

              {/* BOUTON LARGE 2 : ENREGISTRER REMISE */}
              <button
                onClick={() => {
                  setSelectedAgentForRemise(undefined);
                  setRemiseModalOpen(true);
                }}
                className="relative overflow-hidden rounded-2xl bg-linear-to-r from-emerald-600 via-emerald-500 to-teal-500 p-4 sm:p-5 text-left text-white shadow-xl shadow-emerald-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-emerald-400/40 group"
              >
                <div className="absolute right-3 top-3 opacity-20 group-hover:opacity-30 transition pointer-events-none">
                  <HandCoins className="w-16 h-16 text-white" />
                </div>
                <div className="relative z-10 flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
                    <HandCoins className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                      Encaissement Fonds
                    </span>
                    <h4 className="text-lg sm:text-xl font-black text-white">Enregistrer Remise Agent</h4>
                    <p className="text-xs text-emerald-100/90 mt-0.5">
                      Saisir le versement des recettes collectées par un agent sur le terrain
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOC 3 : GRILLE DE GESTION SECONDAIRE (Grid 2 ou 4 Colonnes Propre)        */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                <span>Bloc 3 — Modules de Gestion Secondaire</span>
              </h3>
              <span className="text-[11px] text-slate-500">Supervision &amp; Registres</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* 1. Lot & Stock Tickets */}
              <div
                onClick={() => setTicketsListOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-blue-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 group-hover:scale-110 transition">
                    <TicketIcon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-300 px-2 py-0.5 border border-blue-500/30">
                    {sectorTickets.length} ticket(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-blue-400 transition">
                    Lot &amp; Stock Tickets
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Vision détaillée des tickets
                  </p>
                </div>
              </div>

              {/* 2. Trombinoscope Équipe */}
              <div
                onClick={() => setActiveTab('agents')}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-emerald-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 group-hover:scale-110 transition">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 border border-emerald-500/30">
                    {sectorAgents.length} agent(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-emerald-400 transition">
                    Trombinoscope Équipe
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Photos, rôles &amp; numéros
                  </p>
                </div>
              </div>

              {/* 3. Registre des Ventes */}
              <div
                onClick={() => setSalesListOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-orange-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 group-hover:scale-110 transition">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-orange-500/20 text-orange-300 px-2 py-0.5 border border-orange-500/30">
                    {ticketsSold} vente(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-orange-400 transition">
                    Registre des Ventes
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Historique complet des ventes
                  </p>
                </div>
              </div>

              {/* 4. Historique des Remises */}
              <div
                onClick={() => setRemisesListOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-teal-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 group-hover:scale-110 transition">
                    <HandCoins className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-teal-500/20 text-teal-300 px-2 py-0.5 border border-teal-500/30">
                    {sectorRemises.length} remise(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-teal-400 transition">
                    Historique des Remises
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Flux d'encaissement direct
                  </p>
                </div>
              </div>

              {/* 5. Ventes Non Couvertes */}
              <div
                onClick={() => {
                  setSelectedAgentForVentes(undefined);
                  setVentesARemettreOpen(true);
                }}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-amber-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 group-hover:scale-110 transition">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5 border border-amber-500/30">
                    {unremittedTickets.length} non versé(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-amber-400 transition">
                    Ventes Non Couvertes
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Tickets vendus en attente
                  </p>
                </div>
              </div>

              {/* 6. Registre des Contrôles */}
              <div
                onClick={() => setControlsListOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-purple-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 group-hover:scale-110 transition">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-purple-500/20 text-purple-300 px-2 py-0.5 border border-purple-500/30">
                    Secteur
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-purple-400 transition">
                    Registre des Contrôles
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Passages vérifiés aux barrages
                  </p>
                </div>
              </div>

              {/* 7. Recherche Multicritères */}
              <div
                onClick={() => setSearchModalOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-amber-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 group-hover:scale-110 transition">
                    <Search className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5 border border-amber-500/30">
                    Filtres
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-amber-400 transition">
                    Recherche Multicritères
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Tickets, camions, agents
                  </p>
                </div>
              </div>

              {/* 8. Dépenses du Secteur */}
              <div
                onClick={() => setActiveTab('expenses')}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-emerald-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 group-hover:scale-110 transition">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 border border-emerald-500/30">
                    Budget
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-emerald-400 transition">
                    Dépenses du Secteur
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Frais de fonctionnement
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* GRAPHIQUE DES VENTES PAR AGENT                                            */}
          {/* ========================================================================= */}
          <EntityRankingChart
            title="Ventes par Agent Mobile (Vos Lots)"
            items={salesByAgentItems}
            emptyMessage="Aucun agent n'a encore enregistré de ventes sur vos lots."
            showRemitted={true}
          />

          {/* ========================================================================= */}
          {/* TABLEAU DU POOL D'AGENTS MOBILES & ÉTAT FINANCIER DÉTAILLÉ                */}
          {/* ========================================================================= */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Pool Global des Agents Mobiles U.J.P.A.S. ({sectorAgents.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Suivi individuel des tickets distribués, vendus et des remises directes (Agent → Superviseur → Admin)
                </p>
              </div>
              <button
                onClick={() => setRemisesListOpen(true)}
                className="text-xs text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                Registre des Remises ({sectorRemises.length})
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400 bg-slate-900/70">
                  <tr>
                    <th className="py-2.5 px-3">Agent &amp; Photo</th>
                    <th className="py-2.5 px-3">Téléphone</th>
                    <th className="py-2.5 px-3 text-center">En Main (Dispo)</th>
                    <th className="py-2.5 px-3 text-center">Tickets Vendus</th>
                    <th className="py-2.5 px-3 text-right">Montant Attendu</th>
                    <th className="py-2.5 px-3 text-right">Montant Remis</th>
                    <th className="py-2.5 px-3 text-right">Solde Restant</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {sectorAgents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                        Aucun agent actif dans le pool U.J.P.A.S.
                      </td>
                    </tr>
                  ) : (
                    sectorAgents.map((ag) => {
                      const agTickets = sectorTickets.filter((t) => t.assignedAgentId === ag.id);
                      const availableCount = agTickets.filter(
                        (t) => t.status === 'ASSIGNED_TO_AGENT'
                      ).length;
                      const soldCount = agTickets.filter(
                        (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
                      ).length;
                      const totalEarned = soldCount * TICKET_PRICE_FCFA;

                      const agRemises = sectorRemises.filter((r) => r.agentId === ag.id);
                      const remitted = agRemises.reduce((sum, r) => sum + r.amount, 0);
                      const balance = Math.max(0, totalEarned - remitted);
                      const hasAlert = Math.ceil(balance / TICKET_PRICE_FCFA) >= 10;

                      return (
                        <tr key={ag.id} className="hover:bg-slate-900/40 transition">
                          <td className="py-3 px-3 font-sans font-bold text-white whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full overflow-hidden border border-emerald-500/40 bg-slate-800 flex items-center justify-center shrink-0">
                                {ag.avatarUrl ? (
                                  <img
                                    src={ag.avatarUrl}
                                    alt={ag.fullName}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <UserIcon className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span>{ag.fullName}</span>
                                  {hasAlert && (
                                    <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-bold">
                                      ALERTE
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  @{ag.username}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-400 whitespace-nowrap font-sans">
                            {ag.phone || '—'}
                          </td>
                          <td className="py-3 px-3 text-center text-blue-300 font-bold whitespace-nowrap">
                            {availableCount}
                          </td>
                          <td className="py-3 px-3 text-center text-emerald-400 font-bold whitespace-nowrap">
                            {soldCount}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-300 whitespace-nowrap">
                            {formatFCFA(totalEarned)}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-400 font-bold whitespace-nowrap">
                            {formatFCFA(remitted)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                            <span className={balance > 0 ? 'text-amber-400' : 'text-slate-400'}>
                              {formatFCFA(balance)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap font-sans">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedAgentForVentes(ag.id);
                                  setVentesARemettreOpen(true);
                                }}
                                className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                              >
                                Ventes
                              </button>
                              <button
                                onClick={() => handleOpenRemiseForAgent(ag.id)}
                                className="rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition cursor-pointer"
                              >
                                Encaisser
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modals Superviseur */}
          <TicketAssignmentModal
            isOpen={assignmentModalOpen}
            onClose={() => setAssignmentModalOpen(false)}
          />
          <RemiseFormModal
            isOpen={remiseModalOpen}
            onClose={() => setRemiseModalOpen(false)}
            preselectedAgentId={selectedAgentForRemise}
          />
          <VentesARemettreModal
            isOpen={ventesARemettreOpen}
            onClose={() => setVentesARemettreOpen(false)}
            preselectedAgentId={selectedAgentForVentes}
          />
          <RemisesListModal
            isOpen={remisesListOpen}
            onClose={() => setRemisesListOpen(false)}
            onOpenNewRemise={() => {
              setRemisesListOpen(false);
              setRemiseModalOpen(true);
            }}
          />
          <TicketListModal isOpen={ticketsListOpen} onClose={() => setTicketsListOpen(false)} />
          <SalesListModal isOpen={salesListOpen} onClose={() => setSalesListOpen(false)} />
          <ControlsListModal
            isOpen={controlsListOpen}
            onClose={() => setControlsListOpen(false)}
          />
          <AdvancedSearchModal
            isOpen={searchModalOpen}
            onClose={() => setSearchModalOpen(false)}
          />
        </div>
      )}
    </div>
  );
};
