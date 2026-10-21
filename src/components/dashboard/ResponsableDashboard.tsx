import React, { useState, useMemo, useEffect } from 'react';
import {
  UserPlus,
  HandCoins,
  Ticket as TicketIcon,
  AlertTriangle,
  CheckCircle2,
  Users,
  Receipt,
  Layers,
  User as UserIcon,
  ShoppingBag,
  QrCode,
  Vault,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { CoteDIvoireMap } from '../common/CoteDIvoireMap';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA } from '../../utils/normalization';
import { EntityRankingChart, EntityRankItem } from './DashboardCharts';
import { isTicketEligibleForRemiseByActor } from '../../context/data/hooks/useRemittances';

// Modals autorisés pour le Responsable
import { TicketAssignmentModal } from '../tickets/TicketAssignmentModal';
import { CarnetManagementModal } from '../tickets/CarnetManagementModal';
import { SaleFormModal } from '../sales/SaleFormModal';
import { RemiseFormModal } from '../remises/RemiseFormModal';
import { RemisesListModal } from '../remises/RemisesListModal';
import { TicketListModal } from '../tickets/TicketListModal';
import { SalesListModal } from '../sales/SalesListModal';
import { VentesARemettreModal } from '../remises/VentesARemettreModal';
import { ControlScanModal } from '../controls/ControlScanModal';
import { DailyOperationsCenterModal } from '../operations/DailyOperationsCenterModal';
import { ExpensesModule } from '../expenses/ExpensesModule';
import { AgentDirectoryView } from '../agents/AgentDirectoryView';

export const ResponsableDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { users, carnets, tickets, remises } = useData();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'agents' | 'expenses'>('dashboard');

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [carnetModalOpen, setCarnetModalOpen] = useState(false);
  const [saleFormModalOpen, setSaleFormModalOpen] = useState(false);
  const [remiseModalOpen, setRemiseModalOpen] = useState(false);
  const [selectedAgentForRemise, setSelectedAgentForRemise] = useState<string | undefined>();
  const [ventesARemettreOpen, setVentesARemettreOpen] = useState(false);
  const [selectedAgentForVentes, setSelectedAgentForVentes] = useState<string | undefined>();
  const [remisesListOpen, setRemisesListOpen] = useState(false);
  const [ticketsListOpen, setTicketsListOpen] = useState(false);
  const [salesListOpen, setSalesListOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [dailyClosingModalOpen, setDailyClosingModalOpen] = useState(false);

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

  // Pool global d'agents mobiles actifs (aucun blocage par secteur)
  const poolAgents = useMemo(() => {
    return users.filter((u) => u.role === 'AGENT' && u.isActive !== false);
  }, [users]);

  // Carnets attribués à ce responsable
  const myCarnets = useMemo(() => {
    if (!currentUser) return [];
    return carnets.filter(
      (c) => c.status !== 'CANCELLED' && c.assignedToResponsableId === currentUser.id
    );
  }, [carnets, currentUser]);

  // Tickets gérés par ce superviseur (rattachés à lui ou à ses carnets, ou éligibles à l'encaissement)
  const managedTickets = useMemo(() => {
    if (!currentUser) return [];
    return tickets.filter(
      (t) =>
        t.status !== 'CANCELLED' &&
        isTicketEligibleForRemiseByActor(t, carnets, currentUser)
    );
  }, [tickets, carnets, currentUser]);

  // 1. Tickets disponibles (prêts à attribuer ou en main des agents)
  const availableManagedTickets = useMemo(() => {
    return managedTickets.filter(
      (t) =>
        t.status === 'ASSIGNED_TO_RESPONSIBLE' ||
        t.status === 'AVAILABLE' ||
        t.status === 'ASSIGNED_TO_AGENT'
    );
  }, [managedTickets]);

  const readyToAssignCount = useMemo(() => {
    return managedTickets.filter(
      (t) => t.status === 'ASSIGNED_TO_RESPONSIBLE' || t.status === 'AVAILABLE'
    ).length;
  }, [managedTickets]);

  const inAgentHandsCount = useMemo(() => {
    return managedTickets.filter((t) => t.status === 'ASSIGNED_TO_AGENT').length;
  }, [managedTickets]);

  // 2. Tickets vendus
  const soldManagedTickets = useMemo(() => {
    return managedTickets.filter((t) => t.status === 'SOLD' || t.status === 'CONTROLLED');
  }, [managedTickets]);

  const ticketsSoldCount = soldManagedTickets.length;
  const totalSalesAmount = ticketsSoldCount * TICKET_PRICE_FCFA;

  // 3. Remises encaissées par ce superviseur
  const myRemises = useMemo(() => {
    if (!currentUser) return [];
    return remises.filter((r) => r.responsableId === currentUser.id || !r.responsableId);
  }, [remises, currentUser]);

  const totalRemittedAmount = useMemo(() => {
    return myRemises.reduce((sum, r) => sum + r.amount, 0);
  }, [myRemises]);

  // 4. Tickets vendus non couverts par une remise
  const uncoveredTickets = useMemo(() => {
    return soldManagedTickets.filter((t) => !t.coveredByRemiseId);
  }, [soldManagedTickets]);

  const remainingBalance = uncoveredTickets.length * TICKET_PRICE_FCFA;

  // 5. Classement par agent mobile
  const salesByAgentItems: EntityRankItem[] = useMemo(() => {
    return poolAgents
      .map((ag) => {
        const agTickets = managedTickets.filter((t) => t.assignedAgentId === ag.id);
        const count = agTickets.filter(
          (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
        ).length;
        const amount = count * TICKET_PRICE_FCFA;
        const agRemises = myRemises.filter((r) => r.agentId === ag.id);
        const remitted = agRemises.reduce((sum, r) => sum + r.amount, 0);

        return {
          id: ag.id,
          name: ag.fullName,
          detail: ag.phone || `@${ag.username}`,
          count,
          amount,
          remitted,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [poolAgents, managedTickets, myRemises]);

  const handleOpenRemiseForAgent = (agentId: string) => {
    setSelectedAgentForRemise(agentId);
    setRemiseModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 space-y-5">
      {/* Navigation Onglets Superviseur */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 flex-wrap">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
            activeTab === 'dashboard'
              ? 'bg-linear-to-r from-orange-600 to-emerald-700 text-white shadow-md shadow-orange-950/40 border border-orange-400/30'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Dashboard Superviseur</span>
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
          <span>Trombinoscope Agents ({poolAgents.length})</span>
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
          <span>Dépenses de l&apos;Équipe</span>
        </button>
      </div>

      {activeTab === 'expenses' ? (
        <ExpensesModule />
      ) : activeTab === 'agents' ? (
        <AgentDirectoryView embedded />
      ) : (
        <div className="space-y-5">
          {/* En-tête Superviseur */}
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
                  {myCarnets.length} carnet(s) attribué(s)
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                Tableau de Bord Superviseur ({currentUser?.fullName})
              </h2>
              <p className="text-xs text-slate-400">
                Attribution aux agents disponibles, enregistrement de vente, encaissement direct des remises et point de caisse vers l&apos;Administrateur.
              </p>
            </div>
          </div>

          {/* BLOC 1 : INDICATEURS CLÉS DE PERFORMANCE */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              title="Tickets Disponibles"
              value={availableManagedTickets.length}
              subtitle={`${readyToAssignCount} prêts • ${inAgentHandsCount} chez agents`}
              icon={<TicketIcon className="w-4 h-4" />}
              variant="blue"
              onClick={() => setTicketsListOpen(true)}
            />
            <StatCard
              title="Valeur des Ventes"
              value={formatFCFA(totalSalesAmount)}
              subtitle={`${ticketsSoldCount} ticket(s) vendu(s)`}
              icon={<Receipt className="w-4 h-4" />}
              variant="emerald"
              onClick={() => setSalesListOpen(true)}
            />
            <StatCard
              title="Remises Encaissées"
              value={formatFCFA(totalRemittedAmount)}
              subtitle={`${myRemises.length} versement(s) validé(s)`}
              icon={<HandCoins className="w-4 h-4" />}
              variant="blue"
              onClick={() => setRemisesListOpen(true)}
            />
            <StatCard
              title="Solde à Récupérer"
              value={formatFCFA(remainingBalance)}
              subtitle={`${uncoveredTickets.length} ticket(s) non versé(s)`}
              icon={<AlertTriangle className="w-4 h-4" />}
              variant={remainingBalance > 0 ? 'amber' : 'slate'}
              onClick={() => {
                setSelectedAgentForVentes(undefined);
                setVentesARemettreOpen(true);
              }}
            />
          </div>

          {/* BLOC 2 : ACTIONS TERRAIN IMMÉDIATES */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* 1. ATTRIBUER UN CARNET / TICKETS AUX AGENTS LIBRES */}
            <button
              onClick={() => setAssignmentModalOpen(true)}
              className="relative overflow-hidden rounded-2xl bg-linear-to-r from-orange-600 via-orange-500 to-amber-500 p-4 sm:p-5 text-left text-white shadow-xl shadow-orange-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-orange-400/40 group"
            >
              <div className="relative z-10 flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <span className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                    Agents Libres Uniquement
                  </span>
                  <h4 className="text-base sm:text-lg font-black text-white">
                    Attribuer un Carnet / Tickets
                  </h4>
                  <p className="text-xs text-orange-100/90 mt-0.5">
                    Bloque si l&apos;agent a déjà des tickets actifs
                  </p>
                </div>
              </div>
            </button>

            {/* 2. ENREGISTRER VENTE */}
            <button
              onClick={() => setSaleFormModalOpen(true)}
              className="relative overflow-hidden rounded-2xl bg-linear-to-r from-blue-600 via-blue-500 to-indigo-600 p-4 sm:p-5 text-left text-white shadow-xl shadow-blue-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-blue-400/40 group"
            >
              <div className="relative z-10 flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <div>
                  <span className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                    Vente Terrain
                  </span>
                  <h4 className="text-base sm:text-lg font-black text-white">
                    Enregistrer Vente
                  </h4>
                  <p className="text-xs text-blue-100/90 mt-0.5">
                    Vendre un ticket et générer le reçu chauffeur
                  </p>
                </div>
              </div>
            </button>

            {/* 3. ENREGISTRER REMISE (ENCAISSER AGENT) */}
            <button
              onClick={() => {
                setSelectedAgentForRemise(undefined);
                setRemiseModalOpen(true);
              }}
              className="relative overflow-hidden rounded-2xl bg-linear-to-r from-emerald-600 via-emerald-500 to-teal-500 p-4 sm:p-5 text-left text-white shadow-xl shadow-emerald-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-emerald-400/40 group"
            >
              <div className="relative z-10 flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
                  <HandCoins className="w-6 h-6" />
                </div>
                <div>
                  <span className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                    Encaissement Direct
                  </span>
                  <h4 className="text-base sm:text-lg font-black text-white">
                    Enregistrer Remise
                  </h4>
                  <p className="text-xs text-emerald-100/90 mt-0.5">
                    Encaisser les tickets vendus d&apos;un agent
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* BLOC 3 : OUTILS DE SUPERVISION AUTORISÉS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* 1. Suivi Financier de ses Carnets */}
            <div
              onClick={() => setCarnetModalOpen(true)}
              className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-purple-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 group-hover:scale-110 transition">
                  <Layers className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold rounded-full bg-purple-500/20 text-purple-300 px-2 py-0.5 border border-purple-500/30">
                  {myCarnets.length} carnet(s)
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-xs font-black text-white group-hover:text-purple-400 transition">
                  Suivi Financier Carnets
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                  Consultation des lots attribués
                </p>
              </div>
            </div>

            {/* 2. Ventes à Encaisser */}
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
                  {uncoveredTickets.length} en attente
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-xs font-black text-white group-hover:text-amber-400 transition">
                  Ventes à Encaisser
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                  Tickets vendus non remis
                </p>
              </div>
            </div>

            {/* 3. Contrôle QR / Plaque */}
            <div
              onClick={() => setScanModalOpen(true)}
              className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-orange-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 group-hover:scale-110 transition">
                  <QrCode className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold rounded-full bg-orange-500/20 text-orange-300 px-2 py-0.5 border border-orange-500/30">
                  Validité 14 j
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-xs font-black text-white group-hover:text-orange-400 transition">
                  Contrôle QR &amp; Plaque
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                  Vérifier un ticket ou camion
                </p>
              </div>
            </div>

            {/* 4. Point de Caisse / Remise Globale vers l'Admin */}
            <div
              onClick={() => setDailyClosingModalOpen(true)}
              className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-emerald-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 group-hover:scale-110 transition">
                  <Vault className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 border border-emerald-500/30">
                  Vers Admin
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-xs font-black text-white group-hover:text-emerald-400 transition">
                  Point de Caisse vers Admin
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                  Remise globale à l&apos;Administrateur
                </p>
              </div>
            </div>
          </div>

          {/* GRAPHIQUE DES VENTES PAR AGENT */}
          <EntityRankingChart
            title="Ventes par Agent Mobile"
            items={salesByAgentItems}
            emptyMessage="Aucun agent n'a encore enregistré de ventes."
            showRemitted={true}
          />

          {/* TABLEAU DU POOL D'AGENTS MOBILES & ENCAISSEMENT DIRECT */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Pool Global des Agents Mobiles U.J.P.A.S. ({poolAgents.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Suivi des tickets confiés, vendus et encaissement direct des remises
                </p>
              </div>
              <button
                onClick={() => setRemisesListOpen(true)}
                className="text-xs text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                Historique des Remises ({myRemises.length})
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400 bg-slate-900/70">
                  <tr>
                    <th className="py-2.5 px-3">Agent &amp; Photo</th>
                    <th className="py-2.5 px-3">Téléphone</th>
                    <th className="py-2.5 px-3 text-center">En Main</th>
                    <th className="py-2.5 px-3 text-center">Vendus</th>
                    <th className="py-2.5 px-3 text-center">Non Couverts</th>
                    <th className="py-2.5 px-3 text-right">Solde à Verser</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {poolAgents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                        Aucun agent actif dans le pool U.J.P.A.S.
                      </td>
                    </tr>
                  ) : (
                    poolAgents.map((ag) => {
                      const agTickets = tickets.filter(
                        (t) => t.status !== 'CANCELLED' && t.assignedAgentId === ag.id
                      );
                      const availableCount = agTickets.filter(
                        (t) => t.status === 'ASSIGNED_TO_AGENT'
                      ).length;
                      const soldAgTickets = agTickets.filter(
                        (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
                      );
                      const uncoveredAgTickets = soldAgTickets.filter(
                        (t) => !t.coveredByRemiseId
                      );
                      const balance = uncoveredAgTickets.length * TICKET_PRICE_FCFA;
                      const hasAlert = uncoveredAgTickets.length >= 10;

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
                                      SEUIL 10+
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
                            {soldAgTickets.length}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                uncoveredAgTickets.length > 0
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {uncoveredAgTickets.length}
                            </span>
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
          <CarnetManagementModal
            isOpen={carnetModalOpen}
            onClose={() => setCarnetModalOpen(false)}
          />
          <SaleFormModal
            isOpen={saleFormModalOpen}
            onClose={() => setSaleFormModalOpen(false)}
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
          <SalesListModal
            isOpen={salesListOpen}
            onClose={() => setSalesListOpen(false)}
            onOpenNewSale={() => {
              setSalesListOpen(false);
              setSaleFormModalOpen(true);
            }}
          />
          <ControlScanModal
            isOpen={scanModalOpen}
            onClose={() => setScanModalOpen(false)}
          />
          <DailyOperationsCenterModal
            isOpen={dailyClosingModalOpen}
            onClose={() => setDailyClosingModalOpen(false)}
          />
        </div>
      )}
    </div>
  );
};
