import React, { useState, useMemo, useEffect } from 'react';
import {
  Ticket as TicketIcon,
  ShoppingCart,
  ShieldCheck,
  AlertTriangle,
  Users,
  HandCoins,
  FileSpreadsheet,
  Search,
  Layers,
  CheckCircle2,
  Printer,
  ShieldAlert,
  BarChart3,
  FileText,
  Receipt,
  Settings,
  CloudUpload,
  Filter,
  User as UserIcon,
  Truck,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { CoteDIvoireMap } from '../common/CoteDIvoireMap';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import {
  formatFCFA,
  formatDateTime,
  formatPlateDisplay,
} from '../../utils/normalization';
import {
  exportFullAuditPackage,
  exportTicketsToExcel,
} from '../../utils/excelExport';
import {
  PeriodSelector,
  PeriodFilterState,
  filterItemByPeriod,
  EntityRankingChart,
  EntityRankItem,
} from './DashboardCharts';

// Modals
import { CarnetGeneratorModal } from '../tickets/CarnetGeneratorModal';
import { CarnetManagementModal } from '../tickets/CarnetManagementModal';
import { UserManagementModal } from '../admin/UserManagementModal';
import { TicketListModal } from '../tickets/TicketListModal';
import { SalesListModal } from '../sales/SalesListModal';
import { SaleFormModal } from '../sales/SaleFormModal';
import { ControlsListModal } from '../controls/ControlsListModal';
import { RemisesListModal } from '../remises/RemisesListModal';
import { RemiseFormModal } from '../remises/RemiseFormModal';
import { VentesARemettreModal } from '../remises/VentesARemettreModal';
import { AuditTrailModal } from '../audit/AuditTrailModal';
import { AdvancedSearchModal } from '../search/AdvancedSearchModal';
import { ExpensesModule } from '../expenses/ExpensesModule';
import { AdminAnalyticsView } from './AdminAnalyticsView';
import { FraudManagementModal } from '../admin/FraudManagementModal';
import { AdminSettingsModal } from '../admin/AdminSettingsModal';
import { SecurityCenterModal } from '../security/SecurityCenterModal';
import { TruckRegistryModal } from '../admin/TruckRegistryModal';
import { AgentBadgeModal } from '../agents/AgentBadgeModal';
import type { User } from '../../types';

export const AdminDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    users,
    carnets,
    tickets,
    sales,
    controls,
    remises,
    alerts,
    auditLogs,
    fraudReports,
    expenses,
    vehicles,
    sosAlerts,
    syncAllToSupabase,
  } = useData();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'expenses'>('dashboard');
  const [period, setPeriod] = useState<PeriodFilterState>({ type: 'month' });

  // États des Modals
  const [carnetModalOpen, setCarnetModalOpen] = useState(false);
  const [carnetManagementModalOpen, setCarnetManagementModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [ticketsModalOpen, setTicketsModalOpen] = useState(false);
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [controlsModalOpen, setControlsModalOpen] = useState(false);
  const [remisesModalOpen, setRemisesModalOpen] = useState(false);
  const [newRemiseModalOpen, setNewRemiseModalOpen] = useState(false);
  const [selectedAgentForRemise, setSelectedAgentForRemise] = useState<string | undefined>();
  const [ventesARemettreOpen, setVentesARemettreOpen] = useState(false);
  const [selectedAgentForVentes, setSelectedAgentForVentes] = useState<string | undefined>();
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [advancedSearchModalOpen, setAdvancedSearchModalOpen] = useState(false);
  const [fraudManagementModalOpen, setFraudManagementModalOpen] = useState(false);
  const [fraudFilterStatus, setFraudFilterStatus] = useState<string>('ALL');
  const [adminSettingsModalOpen, setAdminSettingsModalOpen] = useState(false);
  const [safetyModalOpen, setSafetyModalOpen] = useState(false);
  const [vehicleRegistryOpen, setVehicleRegistryOpen] = useState(false);
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);
  const [selectedBadgeAgent, setSelectedBadgeAgent] = useState<User | undefined>(undefined);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleNotificationClicked = (e: Event) => {
      const customEvent = e as CustomEvent<{ type?: string }>;
      const notification = customEvent.detail;
      if (!notification) return;

      const type = notification.type;
      if (type === 'ASSIGNMENT') {
        setCarnetManagementModalOpen(true);
      } else if (type === 'REMITTANCE') {
        setRemisesModalOpen(true);
      } else if (type === 'SALE') {
        setSalesModalOpen(true);
      } else if (type === 'FRAUD_REPORT') {
        setFraudFilterStatus('ALL');
        setFraudManagementModalOpen(true);
      } else if (type === 'FINANCIAL_ALERT') {
        setVentesARemettreOpen(true);
      } else if (type === 'EXPENSE') {
        setActiveTab('expenses');
      }
    };
    window.addEventListener('portus-notification-clicked', handleNotificationClicked);
    return () =>
      window.removeEventListener('portus-notification-clicked', handleNotificationClicked);
  }, []);

  // 1. Carnets et Tickets actifs (hors annulés)
  const activeCarnets = useMemo(
    () => carnets.filter((c) => c.status !== 'CANCELLED'),
    [carnets]
  );
  const totalCarnets = activeCarnets.length;

  const activeTickets = useMemo(
    () => tickets.filter((t) => t.status !== 'CANCELLED'),
    [tickets]
  );

  // 2. Tickets disponibles (non vendus, non annulés)
  const availableTickets = useMemo(
    () =>
      activeTickets.filter(
        (t) =>
          t.status === 'GENERATED' ||
          t.status === 'ASSIGNED_TO_RESPONSIBLE' ||
          t.status === 'AVAILABLE' ||
          t.status === 'ASSIGNED_TO_AGENT'
      ),
    [activeTickets]
  );

  // 3. Ventes filtrées par la période
  const periodSoldTickets = useMemo(() => {
    return activeTickets.filter((t) => {
      const isSold = t.status === 'SOLD' || t.status === 'CONTROLLED';
      if (!isSold) return false;
      return filterItemByPeriod(t.soldAt, period);
    });
  }, [activeTickets, period]);

  const ticketsSoldCount = periodSoldTickets.length;
  const totalSalesAmount = ticketsSoldCount * TICKET_PRICE_FCFA;

  // 4. Remises filtrées par la période
  const periodRemises = useMemo(() => {
    return remises.filter((r) => filterItemByPeriod(r.createdAt, period));
  }, [remises, period]);

  const totalRemittedAmount = useMemo(() => {
    return periodRemises.reduce((sum, r) => sum + r.amount, 0);
  }, [periodRemises]);

  const remainingGlobalBalance = Math.max(0, totalSalesAmount - totalRemittedAmount);

  // 5. Ventes non couvertes par une remise
  const uncoveredTickets = useMemo(() => {
    return periodSoldTickets.filter((t) => !t.coveredByRemiseId);
  }, [periodSoldTickets]);

  // 6. Contrôles routiers sur la période
  const periodControls = useMemo(() => {
    return controls.filter((c) => filterItemByPeriod(c.controlledAt, period));
  }, [controls, period]);

  // 7. Dépenses validées sur la période
  const periodValidatedExpenses = useMemo(() => {
    return (
      expenses
        ?.filter(
          (e) =>
            (e.status === 'VALIDATED' || e.status === 'VALIDEE') &&
            filterItemByPeriod(e.expenseDate, period)
        )
        .reduce((sum, e) => sum + e.amount, 0) || 0
    );
  }, [expenses, period]);

  // 8. Équipes actives
  const activeResponsables = useMemo(
    () => users.filter((u) => u.role === 'RESPONSABLE' && u.isActive),
    [users]
  );
  const activeAgents = useMemo(
    () => users.filter((u) => u.role === 'AGENT' && u.isActive),
    [users]
  );

  // 9. Classements Superviseurs & Agents
  const salesBySupervisorItems: EntityRankItem[] = useMemo(() => {
    return activeResponsables
      .map((resp) => {
        const respCarnets = activeCarnets.filter(
          (c) => c.assignedToResponsableId === resp.id
        );
        const respCarnetIds = new Set(respCarnets.map((c) => c.id));
        const respSoldTickets = periodSoldTickets.filter(
          (t) =>
            t.assignedResponsableId === resp.id ||
            (t.carnetId && respCarnetIds.has(t.carnetId))
        );
        const count = respSoldTickets.length;
        const amount = count * TICKET_PRICE_FCFA;
        const respRemises = periodRemises.filter((r) => r.responsableId === resp.id);
        const remitted = respRemises.reduce((s, r) => s + r.amount, 0);

        return {
          id: resp.id,
          name: resp.fullName,
          detail: `${respCarnets.length} carnet(s) attribué(s)`,
          count,
          amount,
          remitted,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [activeResponsables, activeCarnets, periodSoldTickets, periodRemises]);

  const salesByAgentItems: EntityRankItem[] = useMemo(() => {
    return activeAgents
      .map((ag) => {
        const agSold = periodSoldTickets.filter((t) => t.assignedAgentId === ag.id);
        const count = agSold.length;
        const amount = count * TICKET_PRICE_FCFA;
        const agRemises = periodRemises.filter((r) => r.agentId === ag.id);
        const remitted = agRemises.reduce((s, r) => s + r.amount, 0);

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
  }, [activeAgents, periodSoldTickets, periodRemises]);

  const handleExportAll = () => {
    exportFullAuditPackage({
      tickets,
      sales,
      remises,
      controls,
      auditLogs,
    });
  };

  const handleOpenRemiseForAgent = (agentId: string) => {
    setSelectedAgentForRemise(agentId);
    setNewRemiseModalOpen(true);
  };

  const handleOpenVentesForAgent = (agentId: string) => {
    setSelectedAgentForVentes(agentId);
    setVentesARemettreOpen(true);
  };

  return (
    <div className="mx-auto max-w-7xl px-3 py-2.5 sm:px-6 space-y-5">
      {/* Navigation Onglets Supérieurs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-linear-to-r from-orange-600 to-emerald-700 text-white shadow-md shadow-orange-950/40 border border-orange-400/30'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Pilotage Général U.J.P.A.S.</span>
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-linear-to-r from-purple-600 to-indigo-700 text-white shadow-md shadow-purple-950/40 border border-purple-400/30'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analyses &amp; Performance</span>
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
              activeTab === 'expenses'
                ? 'bg-linear-to-r from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-950/40 border border-emerald-400/30'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Dépenses ({formatFCFA(periodValidatedExpenses)})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <PeriodSelector period={period} onChange={setPeriod} />
        </div>
      </div>

      {activeTab === 'expenses' ? (
        <ExpensesModule />
      ) : activeTab === 'analytics' ? (
        <AdminAnalyticsView period={period} />
      ) : (
        <div className="space-y-5">
          {/* En-tête Direction */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-white/10 p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-xl">
            <div className="absolute right-0 top-0 pointer-events-none opacity-5 overflow-hidden">
              <CoteDIvoireMap
                variant="watermark"
                className="w-64 h-64 -mr-16 -mt-16 text-emerald-400"
              />
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase font-black tracking-wider text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                  Administration Centrale U.J.P.A.S. 🇨🇮
                </span>
                <span className="text-[11px] text-emerald-400 font-bold hidden sm:inline">
                  Zone Portuaire &amp; Industrielle d'Abidjan
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                Tableau de Bord Direction &amp; Administration
              </h2>
              <p className="text-xs text-slate-400">
                Supervision intégrale des carnets, des ventes (5 000 FCFA), des remises directes et de la sécurité routière.
              </p>
            </div>

            <div className="relative z-10 flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportAll}
                className="flex items-center gap-1.5 rounded-xl bg-slate-800/90 border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
                title="Exporter l'ensemble de la base en Excel"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Export Global Excel</span>
              </button>
              <button
                onClick={() => {
                  const filteredTickets = tickets.filter((t) =>
                    filterItemByPeriod(t.soldAt || t.createdAt, period)
                  );
                  exportTicketsToExcel(filteredTickets);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600/20 border border-purple-500/30 px-3.5 py-2 text-xs font-bold text-purple-300 hover:bg-purple-600/30 transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-purple-400" />
                <span>Export Période XLSX</span>
              </button>
            </div>
          </div>

          {syncMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{syncMessage}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* BLOC 1 : INDICATEURS CLÉS DE PERFORMANCE (KPIs ADMINISTRATEUR)            */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Filter className="w-4 h-4 text-emerald-400" />
                <span>Bloc 1 — Indicateurs Clés de Performance (KPIs)</span>
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">
                Tarif Unique : {formatFCFA(TICKET_PRICE_FCFA)}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                title="Chiffre d'Affaires Ventes"
                value={formatFCFA(totalSalesAmount)}
                subtitle={`${ticketsSoldCount} ticket(s) vendu(s) • ${availableTickets.length} dispo`}
                icon={<Receipt className="w-4 h-4" />}
                variant="emerald"
                onClick={() => setSalesModalOpen(true)}
              />
              <StatCard
                title="Remises Encaissées"
                value={formatFCFA(totalRemittedAmount)}
                subtitle={`${periodRemises.length} versement(s) validé(s)`}
                icon={<HandCoins className="w-4 h-4" />}
                variant="blue"
                onClick={() => setRemisesModalOpen(true)}
              />
              <StatCard
                title="Solde à Récupérer"
                value={formatFCFA(remainingGlobalBalance)}
                subtitle={`${uncoveredTickets.length} ticket(s) non versé(s)`}
                icon={<AlertTriangle className="w-4 h-4" />}
                variant={remainingGlobalBalance > 0 ? 'amber' : 'slate'}
                onClick={() => {
                  setSelectedAgentForVentes(undefined);
                  setVentesARemettreOpen(true);
                }}
              />
              <StatCard
                title="Contrôles & Alertes"
                value={periodControls.length}
                subtitle={`${alerts.length} alerte(s) caisse • ${fraudReports.length} fraude(s)`}
                icon={<ShieldCheck className="w-4 h-4" />}
                variant={alerts.length > 0 || fraudReports.length > 0 ? 'rose' : 'blue'}
                onClick={() => setControlsModalOpen(true)}
              />
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOC 2 : ACTIONS TERRAIN IMMÉDIATES (2 Grands Boutons Distincts)          */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-orange-400" />
                <span>Bloc 2 — Actions Terrain Immédiates</span>
              </h3>
              <span className="text-[11px] text-slate-500">Accès direct 1-clic</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* BOUTON LARGE 1 : ENREGISTRER VENTE */}
              <button
                onClick={() => setSaleModalOpen(true)}
                className="relative overflow-hidden rounded-2xl bg-linear-to-r from-orange-600 via-orange-500 to-amber-500 p-4 sm:p-5 text-left text-white shadow-xl shadow-orange-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-orange-400/40 group"
              >
                <div className="absolute right-3 top-3 opacity-20 group-hover:opacity-30 transition pointer-events-none">
                  <ShoppingCart className="w-16 h-16 text-white" />
                </div>
                <div className="relative z-10 flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
                    <ShoppingCart className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                      Émission Directe
                    </span>
                    <h4 className="text-lg sm:text-xl font-black text-white">Enregistrer Vente</h4>
                    <p className="text-xs text-orange-100/90 mt-0.5">
                      Émettre un ticket poids lourd ({formatFCFA(TICKET_PRICE_FCFA)}) avec reçu QR Code
                    </p>
                  </div>
                </div>
              </button>

              {/* BOUTON LARGE 2 : ENREGISTRER REMISE */}
              <button
                onClick={() => {
                  setSelectedAgentForRemise(undefined);
                  setNewRemiseModalOpen(true);
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
                      Encaissement Tout Agent
                    </span>
                    <h4 className="text-lg sm:text-xl font-black text-white">Enregistrer Remise</h4>
                    <p className="text-xs text-emerald-100/90 mt-0.5">
                      Encaisser les recettes de n'importe quel agent (mise à jour immédiate des tickets)
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOC 3 : GRILLE DES MODULES D'ADMINISTRATION AUTORISÉS                    */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Bloc 3 — Grille des Modules d'Administration</span>
              </h3>
              <span className="text-[11px] text-slate-500">Accès Exclusif Administrateur</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* 1. Carnets & Stock */}
              <div
                onClick={() => setCarnetManagementModalOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-orange-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 group-hover:scale-110 transition">
                    <Layers className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-orange-500/20 text-orange-300 px-2 py-0.5 border border-orange-500/30">
                    {totalCarnets} carnet(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-orange-400 transition">
                    Gestion des Carnets
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Création, attribution &amp; impression PDF
                  </p>
                </div>
              </div>

              {/* 2. Équipe & Utilisateurs */}
              <div
                onClick={() => setUsersModalOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-blue-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 group-hover:scale-110 transition">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-300 px-2 py-0.5 border border-blue-500/30">
                    {users.length} compte(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-blue-400 transition">
                    Équipe &amp; Photos
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Comptes, rôles &amp; trombinoscope
                  </p>
                </div>
              </div>

              {/* 3. Badges Pro (85x120) */}
              <div
                onClick={() => {
                  setSelectedBadgeAgent(undefined);
                  setBadgeModalOpen(true);
                }}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-amber-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 group-hover:scale-110 transition">
                    <Printer className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5 border border-amber-500/30">
                    Format Pro
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-amber-400 transition">
                    Badges Pro (85×120)
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Cartes d'habilitation avec QR
                  </p>
                </div>
              </div>

              {/* 4. Recherches & Exports */}
              <div
                onClick={() => setAdvancedSearchModalOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-emerald-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 group-hover:scale-110 transition">
                    <Search className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 border border-emerald-500/30">
                    Excel / PDF
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-emerald-400 transition">
                    Recherches &amp; Exports
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Filtres multicritères &amp; extractions
                  </p>
                </div>
              </div>

              {/* 5. Registre des Véhicules */}
              <div
                onClick={() => setVehicleRegistryOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-cyan-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 group-hover:scale-110 transition">
                    <Truck className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-cyan-500/20 text-cyan-300 px-2 py-0.5 border border-cyan-500/30">
                    {vehicles.length} camion(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-cyan-400 transition">
                    Registre Véhicules
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Historique par plaque CEDEAO
                  </p>
                </div>
              </div>

              {/* 6. Centre Sécurité & Fraudes */}
              <div
                onClick={() => {
                  setFraudFilterStatus('ALL');
                  setFraudManagementModalOpen(true);
                }}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-rose-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 group-hover:scale-110 transition">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-300 px-2 py-0.5 border border-rose-500/30">
                    {fraudReports.length + sosAlerts.length} alerte(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-rose-400 transition">
                    Fraudes &amp; Incidents
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Infractions routières &amp; SOS
                  </p>
                </div>
              </div>

              {/* 7. Journal d'Audit */}
              <div
                onClick={() => setAuditModalOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-purple-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 group-hover:scale-110 transition">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-purple-500/20 text-purple-300 px-2 py-0.5 border border-purple-500/30">
                    {auditLogs.length} log(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-purple-400 transition">
                    Journal d'Audit
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Traçabilité inviolable U.J.P.A.S.
                  </p>
                </div>
              </div>

              {/* 8. Paramètres & Synchro Cloud */}
              <div
                onClick={() => setAdminSettingsModalOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-teal-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 group-hover:scale-110 transition">
                    <Settings className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-teal-500/20 text-teal-300 px-2 py-0.5 border border-teal-500/30">
                    Configuration
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-teal-400 transition">
                    Paramètres &amp; Cloud
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Tarifs &amp; réglages système
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SYNTHÈSE DES SUPERVISEURS & AGENTS MOBILES                                */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EntityRankingChart
              title="Performance par Superviseur (Responsable)"
              items={salesBySupervisorItems}
              emptyMessage="Aucun superviseur actif."
              showRemitted={true}
            />
            <EntityRankingChart
              title="Performance par Agent Mobile Terrain"
              items={salesByAgentItems}
              emptyMessage="Aucun agent actif."
              showRemitted={true}
            />
          </div>

          {/* ========================================================================= */}
          {/* TABLEAU DE SUIVI FINANCIER DIRECT DES AGENTS MOBILES                      */}
          {/* ========================================================================= */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Suivi Individuel des Agents Mobiles &amp; Encaissement des Remises ({activeAgents.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Encaissement direct sans restriction de secteur — mise à jour instantanée des tickets couverts
                </p>
              </div>
              <button
                onClick={() => setTicketsModalOpen(true)}
                className="text-xs text-emerald-400 hover:underline font-semibold cursor-pointer"
              >
                Inspecter tous les tickets ({activeTickets.length})
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400 bg-slate-900/70">
                  <tr>
                    <th className="py-2.5 px-3">Agent</th>
                    <th className="py-2.5 px-3 text-center">En Main</th>
                    <th className="py-2.5 px-3 text-center">Vendus</th>
                    <th className="py-2.5 px-3 text-center">Non Couverts</th>
                    <th className="py-2.5 px-3 text-right">Montant Attendu</th>
                    <th className="py-2.5 px-3 text-right">Montant Remis</th>
                    <th className="py-2.5 px-3 text-right">Solde Dû</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {activeAgents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                        Aucun agent enregistré.
                      </td>
                    </tr>
                  ) : (
                    activeAgents.map((ag) => {
                      const agTickets = activeTickets.filter((t) => t.assignedAgentId === ag.id);
                      const inHandCount = agTickets.filter(
                        (t) => t.status === 'ASSIGNED_TO_AGENT'
                      ).length;
                      const soldAgTickets = agTickets.filter(
                        (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
                      );
                      const uncoveredCount = soldAgTickets.filter(
                        (t) => !t.coveredByRemiseId
                      ).length;
                      const expectedAmount = soldAgTickets.length * TICKET_PRICE_FCFA;
                      const agRemises = remises.filter((r) => r.agentId === ag.id);
                      const remittedAmount = agRemises.reduce((sum, r) => sum + r.amount, 0);
                      const balance = Math.max(0, expectedAmount - remittedAmount);

                      return (
                        <tr key={ag.id} className="hover:bg-slate-900/50 transition">
                          <td className="py-2.5 px-3 font-sans font-bold text-white whitespace-nowrap">
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
                                <div>{ag.fullName}</div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  @{ag.username}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center text-blue-300 font-bold">
                            {inHandCount}
                          </td>
                          <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">
                            {soldAgTickets.length}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                uncoveredCount > 0
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {uncoveredCount}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            {formatFCFA(expectedAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                            {formatFCFA(remittedAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            <span className={balance > 0 ? 'text-amber-400' : 'text-slate-500'}>
                              {formatFCFA(balance)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap font-sans">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenVentesForAgent(ag.id)}
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

          {/* Modals Administrateur */}
          <CarnetGeneratorModal
            isOpen={carnetModalOpen}
            onClose={() => setCarnetModalOpen(false)}
          />
          <CarnetManagementModal
            isOpen={carnetManagementModalOpen}
            onClose={() => setCarnetManagementModalOpen(false)}
            onOpenCreate={() => {
              setCarnetManagementModalOpen(false);
              setCarnetModalOpen(true);
            }}
          />
          <UserManagementModal
            isOpen={usersModalOpen}
            onClose={() => setUsersModalOpen(false)}
          />
          <TicketListModal
            isOpen={ticketsModalOpen}
            onClose={() => setTicketsModalOpen(false)}
          />
          <SalesListModal
            isOpen={salesModalOpen}
            onClose={() => setSalesModalOpen(false)}
            onOpenNewSale={() => {
              setSalesModalOpen(false);
              setSaleModalOpen(true);
            }}
          />
          <SaleFormModal
            isOpen={saleModalOpen}
            onClose={() => setSaleModalOpen(false)}
          />
          <ControlsListModal
            isOpen={controlsModalOpen}
            onClose={() => setControlsModalOpen(false)}
          />
          <RemisesListModal
            isOpen={remisesModalOpen}
            onClose={() => setRemisesModalOpen(false)}
            onOpenNewRemise={() => {
              setRemisesModalOpen(false);
              setNewRemiseModalOpen(true);
            }}
          />
          <RemiseFormModal
            isOpen={newRemiseModalOpen}
            onClose={() => setNewRemiseModalOpen(false)}
            preselectedAgentId={selectedAgentForRemise}
          />
          <VentesARemettreModal
            isOpen={ventesARemettreOpen}
            onClose={() => setVentesARemettreOpen(false)}
            preselectedAgentId={selectedAgentForVentes}
          />
          <AuditTrailModal
            isOpen={auditModalOpen}
            onClose={() => setAuditModalOpen(false)}
          />
          <AdvancedSearchModal
            isOpen={advancedSearchModalOpen}
            onClose={() => setAdvancedSearchModalOpen(false)}
          />
          <FraudManagementModal
            isOpen={fraudManagementModalOpen}
            onClose={() => setFraudManagementModalOpen(false)}
          />
          <AdminSettingsModal
            isOpen={adminSettingsModalOpen}
            onClose={() => setAdminSettingsModalOpen(false)}
          />
          <SecurityCenterModal
            isOpen={safetyModalOpen}
            onClose={() => setSafetyModalOpen(false)}
          />
          <TruckRegistryModal
            isOpen={vehicleRegistryOpen}
            onClose={() => setVehicleRegistryOpen(false)}
          />
          <AgentBadgeModal
            isOpen={badgeModalOpen}
            onClose={() => setBadgeModalOpen(false)}
            selectedAgent={selectedBadgeAgent}
          />
        </div>
      )}
    </div>
  );
};
