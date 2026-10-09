import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Ticket as TicketIcon,
  Banknote,
  ShieldCheck,
  AlertTriangle,
  Plus,
  Users,
  FileSpreadsheet,
  HandCoins,
  History,
  ShieldAlert,
  Receipt,
  CheckCircle2,
  XCircle,
  Building2,
  Calendar,
  Filter,
  ArrowUpRight,
  Search,
  FileText,
  Settings,
  CloudUpload,
  ShoppingCart,
  BarChart3,
  ChevronUp,
  ChevronDown,
  Printer,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { CoteDIvoireMap } from '../common/CoteDIvoireMap';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA, formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import { exportFullAuditPackage } from '../../utils/excelExport';
import {
  exportFilteredTicketsToExcel,
  generateManagementReportPDF,
  EnrichedTicketRow,
} from '../../utils/advancedExport';
import {
  PeriodSelector,
  PeriodFilterState,
  filterItemByPeriod,
  buildTimelineData,
  SalesTimelineChart,
  EntityRankingChart,
  StockDistributionChart,
  EntityRankItem,
  StockBreakdown,
} from './DashboardCharts';

// Modals
import { CarnetGeneratorModal } from '../tickets/CarnetGeneratorModal';
import { CarnetManagementModal } from '../tickets/CarnetManagementModal';
import { TicketListModal } from '../tickets/TicketListModal';
import { SalesListModal } from '../sales/SalesListModal';
import { SaleFormModal } from '../sales/SaleFormModal';
import { RemisesListModal } from '../remises/RemisesListModal';
import { ControlsListModal } from '../controls/ControlsListModal';
import { AuditTrailModal } from '../audit/AuditTrailModal';
import { UserManagementModal } from '../admin/UserManagementModal';
import { SupabaseModal } from '../admin/SupabaseModal';
import { RemiseFormModal } from '../remises/RemiseFormModal';
import { FraudManagementModal } from '../admin/FraudManagementModal';
import { VentesARemettreModal } from '../remises/VentesARemettreModal';
import { AdvancedSearchModal } from '../search/AdvancedSearchModal';
import { ExpensesModule } from '../expenses/ExpensesModule';
import { AdminSettingsModal } from '../admin/AdminSettingsModal';
import { AdminAnalyticsView } from './AdminAnalyticsView';
import { AgentBadgeModal } from '../agents/AgentBadgeModal';

export const AdminDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    carnets,
    tickets,
    sales,
    remises,
    expenses,
    controls,
    fraudReports,
    auditLogs,
    alerts,
    users,
    sectors,
    syncAllToSupabase,
  } = useData();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'expenses'>('dashboard');
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Filtre de période
  const [period, setPeriod] = useState<PeriodFilterState>({ type: 'month' });

  // Agent Table Search, Filter and Sort States
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [agentSectorFilter, setAgentSectorFilter] = useState('ALL');
  const [agentSortField, setAgentSortField] = useState<'name' | 'sold' | 'expected' | 'remitted' | 'remaining'>('sold');
  const [agentSortDirection, setAgentSortDirection] = useState<'asc' | 'desc'>('desc');

  // Modals state
  const [carnetModalOpen, setCarnetModalOpen] = useState(false);
  const [carnetManagementModalOpen, setCarnetManagementModalOpen] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [remisesModalOpen, setRemisesModalOpen] = useState(false);
  const [newRemiseModalOpen, setNewRemiseModalOpen] = useState(false);
  const [selectedAgentForRemise, setSelectedAgentForRemise] = useState<string | undefined>();
  const [ventesARemettreOpen, setVentesARemettreOpen] = useState(false);
  const [selectedAgentForVentes, setSelectedAgentForVentes] = useState<string | undefined>();
  const [controlsModalOpen, setControlsModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [supabaseModalOpen, setSupabaseModalOpen] = useState(false);
  const [fraudManagementModalOpen, setFraudManagementModalOpen] = useState(false);
  const [fraudFilterStatus, setFraudFilterStatus] = useState<any>('ALL');
  const [advancedSearchModalOpen, setAdvancedSearchModalOpen] = useState(false);
  const [adminSettingsModalOpen, setAdminSettingsModalOpen] = useState(false);
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);
  const [selectedBadgeAgent, setSelectedBadgeAgent] = useState<any>(undefined);

  useEffect(() => {
    const handleNotificationClicked = (e: Event) => {
      const customEvent = e as CustomEvent;
      const notification = customEvent.detail;
      if (!notification) return;

      const type = notification.type;
      if (type === 'FRAUD_ALERT') {
        setFraudManagementModalOpen(true);
      } else if (type === 'REMITTANCE') {
        setRemisesModalOpen(true);
      } else if (type === 'FINANCIAL_ALERT') {
        setActiveTab('expenses');
      } else if (type === 'ASSIGNMENT') {
        setCarnetManagementModalOpen(true);
      } else if (type === 'SALE') {
        setSalesModalOpen(true);
      }
    };
    window.addEventListener('portus-notification-clicked', handleNotificationClicked);
    return () => window.removeEventListener('portus-notification-clicked', handleNotificationClicked);
  }, []);

  // ---------------------------------------------------------------------------
  // DONNÉES GLOBALES ET FILTRÉES PAR PÉRIODE (SUPABASE / INDEXEDDB)
  // ---------------------------------------------------------------------------
  const totalCarnets = carnets.length;
  const totalTickets = tickets.length;

  // Stock
  const availableTickets = useMemo(() => {
    return tickets.filter(
      (t) =>
        t.status === 'GENERATED' ||
        t.status === 'ASSIGNED_TO_RESPONSIBLE' ||
        t.status === 'AVAILABLE' ||
        t.status === 'ASSIGNED_TO_AGENT'
    );
  }, [tickets]);

  const cancelledTickets = useMemo(() => {
    return tickets.filter((t) => t.status === 'CANCELLED');
  }, [tickets]);

  // Valeurs de stock
  const stockPotentialValue = totalTickets * TICKET_PRICE_FCFA;
  const availableStockValue = availableTickets.length * TICKET_PRICE_FCFA;

  // Filtrage des ventes et remises sur la période
  const filteredSales = useMemo(() => {
    return sales.filter((s) => filterItemByPeriod(s.soldAt, period));
  }, [sales, period]);

  const filteredRemises = useMemo(() => {
    return remises.filter((r) => filterItemByPeriod(r.createdAt, period));
  }, [remises, period]);

  const filteredFrauds = useMemo(() => {
    return fraudReports.filter((f) => filterItemByPeriod(f.reportedAt, period));
  }, [fraudReports, period]);

  // KPIs financiers période & cumulés
  const periodSoldTicketsCount = filteredSales.length;
  const periodSalesAmount = periodSoldTicketsCount * TICKET_PRICE_FCFA;
  const periodRemittedAmount = filteredRemises.reduce((sum, r) => sum + r.amount, 0);
  const periodRemainingBalance = Math.max(0, periodSalesAmount - periodRemittedAmount);

  // Cumuls absolus
  const allSoldTicketsCount = tickets.filter(
    (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
  ).length;
  const allSalesAmount = allSoldTicketsCount * TICKET_PRICE_FCFA;
  const allRemittedAmount = remises.reduce((sum, r) => sum + r.amount, 0);
  const allRemainingBalance = Math.max(0, allSalesAmount - allRemittedAmount);

  // Utilisateurs
  const activeAgents = useMemo(() => {
    return users.filter((u) => u.role === 'AGENT' && u.isActive);
  }, [users]);

  const activeResponsables = useMemo(() => {
    return users.filter((u) => u.role === 'RESPONSABLE' && u.isActive);
  }, [users]);

  // Calcul, Filtrage et Tri Dynamique des Agents pour la Table de Décomposition
  const processedAgents = useMemo(() => {
    const agentsWithStats = activeAgents.map((ag) => {
      const agentSold = tickets.filter(
        (t) => t.assignedAgentId === ag.id && (t.status === 'SOLD' || t.status === 'CONTROLLED')
      ).length;
      const expected = agentSold * TICKET_PRICE_FCFA;
      const agentRemises = remises.filter((r) => r.agentId === ag.id);
      const remitted = agentRemises.reduce((sum, r) => sum + r.amount, 0);
      const remaining = Math.max(0, expected - remitted);
      const alertItem = alerts.find((a) => a.agentId === ag.id);

      return {
        ...ag,
        agentSold,
        expected,
        remitted,
        remaining,
        alertItem,
      };
    });

    const filtered = agentsWithStats.filter((ag) => {
      const matchesSearch = ag.fullName.toLowerCase().includes(agentSearchQuery.toLowerCase());
      const matchesSector =
        agentSectorFilter === 'ALL' ||
        ag.sectorId === agentSectorFilter ||
        ag.sectorName === agentSectorFilter;
      return matchesSearch && matchesSector;
    });

    return [...filtered].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (agentSortField === 'name') {
        valA = a.fullName.toLowerCase();
        valB = b.fullName.toLowerCase();
      } else if (agentSortField === 'sold') {
        valA = a.agentSold;
        valB = b.agentSold;
      } else if (agentSortField === 'expected') {
        valA = a.expected;
        valB = b.expected;
      } else if (agentSortField === 'remitted') {
        valA = a.remitted;
        valB = b.remitted;
      } else if (agentSortField === 'remaining') {
        valA = a.remaining;
        valB = b.remaining;
      }

      if (valA < valB) return agentSortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return agentSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    activeAgents,
    tickets,
    remises,
    alerts,
    agentSearchQuery,
    agentSectorFilter,
    agentSortField,
    agentSortDirection,
  ]);

  const totalFrauds = fraudReports.length;
  const pendingFraudsCount = fraudReports.filter(
    (f) => f.status === 'NOUVEAU' || f.status === 'EN_COURS'
  ).length;

  // ---------------------------------------------------------------------------
  // DONNÉES POUR LES GRAPHIQUES
  // ---------------------------------------------------------------------------
  // 1. Timeline Ventes & Remises
  const timelineData = useMemo(() => {
    return buildTimelineData(filteredSales, filteredRemises, period);
  }, [filteredSales, filteredRemises, period]);

  // 2. Ventes par Responsable (agrégé par secteur/responsable)
  const salesByResponsable: EntityRankItem[] = useMemo(() => {
    return activeResponsables.map((resp) => {
      // ventes associées au secteur ou responsable
      const respSales = filteredSales.filter(
        (s) => s.sectorId === resp.sectorId || s.sectorName === resp.sectorName
      );
      const count = respSales.length;
      const amount = count * TICKET_PRICE_FCFA;

      const respRemises = filteredRemises.filter(
        (r) => r.responsableId === resp.id || r.sectorId === resp.sectorId
      );
      const remitted = respRemises.reduce((sum, r) => sum + r.amount, 0);

      return {
        id: resp.id,
        name: resp.fullName,
        detail: resp.sectorName || 'Secteur Non Assigné',
        count,
        amount,
        remitted,
      };
    }).sort((a, b) => b.count - a.count);
  }, [activeResponsables, filteredSales, filteredRemises]);

  // 3. Ventes par Agent
  const salesByAgent: EntityRankItem[] = useMemo(() => {
    return activeAgents.map((ag) => {
      const agSales = filteredSales.filter((s) => s.agentId === ag.id);
      const count = agSales.length;
      const amount = count * TICKET_PRICE_FCFA;

      const agRemises = filteredRemises.filter((r) => r.agentId === ag.id);
      const remitted = agRemises.reduce((sum, r) => sum + r.amount, 0);

      return {
        id: ag.id,
        name: ag.fullName,
        detail: ag.sectorName,
        count,
        amount,
        remitted,
      };
    }).sort((a, b) => b.count - a.count);
  }, [activeAgents, filteredSales, filteredRemises]);

  // 4. Répartition du stock
  const stockBreakdown: StockBreakdown = useMemo(() => {
    const inStockCount = tickets.filter((t) => t.status === 'GENERATED').length;
    const inSectorCount = tickets.filter(
      (t) => t.status === 'ASSIGNED_TO_RESPONSIBLE' || t.status === 'AVAILABLE'
    ).length;
    const inAgentCount = tickets.filter((t) => t.status === 'ASSIGNED_TO_AGENT').length;
    const soldCount = allSoldTicketsCount;
    const cancelledCount = cancelledTickets.length;

    return {
      inStockCount,
      inSectorCount,
      inAgentCount,
      soldCount,
      cancelledCount,
      total: totalTickets,
    };
  }, [tickets, allSoldTicketsCount, cancelledTickets.length, totalTickets]);

  const handleExportAll = () => {
    exportFullAuditPackage({
      tickets,
      sales,
      remises,
      controls,
      auditLogs,
    });
  };

  const toggleSort = (field: 'name' | 'sold' | 'expected' | 'remitted' | 'remaining') => {
    if (agentSortField === field) {
      setAgentSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setAgentSortField(field);
      setAgentSortDirection('desc');
    }
  };

  const renderSortIndicator = (field: 'name' | 'sold' | 'expected' | 'remitted' | 'remaining') => {
    if (agentSortField !== field) return null;
    return agentSortDirection === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 ml-1 inline-block text-purple-400" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 ml-1 inline-block text-purple-400" />
    );
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
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 space-y-5">
      {/* Navigation Onglets (Tableau de bord / Analyses / Dépenses) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
            activeTab === 'dashboard'
              ? 'bg-linear-to-r from-orange-600 to-emerald-700 text-white shadow-md shadow-orange-950/40 border border-orange-400/30'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Tableau de Bord UJPAS</span>
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
          <span>📊 Analyses &amp; Performance</span>
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
          <span>💰 Dépenses</span>
        </button>
      </div>

      {activeTab === 'expenses' ? (
        <ExpensesModule />
      ) : activeTab === 'analytics' ? (
        <AdminAnalyticsView period={period} />
      ) : (
        <div className="space-y-5">
      {/* ========================================================================= */}
      {/* EN-TÊTE DU TABLEAU DE BORD ADMIN                                          */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/60 border border-slate-800 p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Filigrane discret carte Côte d'Ivoire */}
        <div className="absolute right-0 top-0 pointer-events-none opacity-5 overflow-hidden">
          <CoteDIvoireMap variant="watermark" className="w-64 h-64 -mr-16 -mt-16 text-emerald-400" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase font-black tracking-wider text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
              Supervision Générale UJPAS 🇨🇮
            </span>
            <span className="text-[11px] text-emerald-400 font-bold hidden sm:inline">
              Port Autonome d'Abidjan
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
            Tableau de Bord Direction &amp; Administration
          </h2>
          <p className="text-xs text-slate-400">
            Pilotage consolidé des carnets, des flux financiers, des effectifs et des contrôles sur le corridor.
          </p>
        </div>

        {/* Actions d'administration */}
        <div className="relative z-10 flex flex-wrap items-center gap-2 pt-1 md:pt-0">
          {/* Bouton Enregistrer Vente Directe */}
          <button
            onClick={() => setSaleModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-linear-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-orange-950/40 transition cursor-pointer border border-orange-400/30"
            title="Enregistrer directement une vente de ticket poids lourd"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Enregistrer Vente</span>
          </button>

          {/* Bouton Enregistrer Remise de Fonds */}
          <button
            onClick={() => {
              setSelectedAgentForRemise(undefined);
              setNewRemiseModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-950/40 transition cursor-pointer border border-emerald-400/30"
            title="Enregistrer un versement / remise de fonds (Agent ou Responsable)"
          >
            <HandCoins className="w-4 h-4" />
            <span>Enregistrer Remise</span>
          </button>

          <button
            onClick={() => setCarnetManagementModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <Layers className="w-4 h-4 text-orange-400" />
            <span>Carnets</span>
          </button>
          <button
            onClick={() => setCarnetModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-950 hover:bg-emerald-500 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Carnet</span>
          </button>
          <button
            onClick={() => setUsersModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <Users className="w-4 h-4 text-blue-400" />
            <span>Équipe ({activeAgents.length + activeResponsables.length})</span>
          </button>
          <button
            onClick={() => {
              setSelectedBadgeAgent(undefined);
              setBadgeModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600/20 border border-orange-500/40 px-3.5 py-2 text-xs font-bold text-orange-300 hover:bg-orange-600/30 transition cursor-pointer shadow-xs"
            title="Créer et imprimer les grands badges de cou professionnels (85 × 120 mm)"
          >
            <Printer className="w-4 h-4 text-orange-400" />
            <span>Badges Pro (85×120)</span>
          </button>
          <button
            onClick={() => setAdvancedSearchModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-amber-600/20 border border-amber-500/40 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-amber-600/30 transition cursor-pointer shadow-xs"
            title="Recherches multicritères et exports ciblés"
          >
            <Search className="w-4 h-4 text-amber-400" />
            <span>Recherches & Exports</span>
          </button>
          <button
            onClick={handleExportAll}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
            title="Exporter l'ensemble de la base en Excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
          <button
            onClick={() => setAdminSettingsModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-purple-600/20 border border-purple-500/40 px-3.5 py-2 text-xs font-bold text-purple-300 hover:bg-purple-600/30 transition cursor-pointer shadow-xs"
            title="Paramètres et tarification du ticket"
          >
            <Settings className="w-4 h-4 text-purple-400" />
            <span>Paramètres & Tarifs</span>
          </button>
          <button
            onClick={async () => {
              setSyncingCloud(true);
              const res = await syncAllToSupabase();
              setSyncingCloud(false);
              setSyncMessage(res.message);
              setTimeout(() => setSyncMessage(null), 6000);
            }}
            disabled={syncingCloud}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-900/80 transition cursor-pointer shadow-xs disabled:opacity-50"
            title="Synchroniser tous les carnets et données locales vers le cloud Supabase"
          >
            <CloudUpload className={`w-4 h-4 text-emerald-400 ${syncingCloud ? 'animate-spin' : ''}`} />
            <span>{syncingCloud ? 'Synchro en cours...' : 'Synchro Cloud'}</span>
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BARRE DE FILTRES TEMPORELS (AUJOURD'HUI / CETTE SEMAINE / CE MOIS / PERSO)*/}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-2xl border border-slate-800 bg-slate-900/90 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Filtre Période :
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodSelector period={period} onChange={setPeriod} />

          {/* Raccourcis exports ciblés sur la période filtrée */}
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
            <button
              onClick={() => {
                const salesByTicket = new Map<string, typeof sales[0]>();
                sales.forEach((s) => salesByTicket.set(s.ticketNumber, s));
                const remisesByTicketId = new Map<string, typeof remises[0]>();
                remises.forEach((r) => remisesByTicketId.set(r.id, r));
                const controlsByTicket = new Map<string, typeof controls[0]>();
                controls.forEach((c) => {
                  if (!controlsByTicket.has(c.ticketNumber) || new Date(c.controlledAt) > new Date(controlsByTicket.get(c.ticketNumber)!.controlledAt)) {
                    controlsByTicket.set(c.ticketNumber, c);
                  }
                });

                const filteredRows: EnrichedTicketRow[] = tickets
                  .filter((t) => filterItemByPeriod(t.soldAt || t.createdAt, period))
                  .map((t) => ({
                    ticket: t,
                    sale: salesByTicket.get(t.ticketNumber),
                    remise: t.coveredByRemiseId ? remisesByTicketId.get(t.coveredByRemiseId) : undefined,
                    lastControl: controlsByTicket.get(t.ticketNumber),
                  }));

                exportFilteredTicketsToExcel(
                  filteredRows,
                  period,
                  currentUser
                );
              }}
              className="flex items-center gap-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition cursor-pointer"
              title="Exporter les tickets de la période en XLSX"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>XLSX Période</span>
            </button>

            <button
              onClick={() => {
                const salesByTicket = new Map<string, typeof sales[0]>();
                sales.forEach((s) => salesByTicket.set(s.ticketNumber, s));
                const remisesByTicketId = new Map<string, typeof remises[0]>();
                remises.forEach((r) => remisesByTicketId.set(r.id, r));
                const controlsByTicket = new Map<string, typeof controls[0]>();
                controls.forEach((c) => {
                  if (!controlsByTicket.has(c.ticketNumber) || new Date(c.controlledAt) > new Date(controlsByTicket.get(c.ticketNumber)!.controlledAt)) {
                    controlsByTicket.set(c.ticketNumber, c);
                  }
                });

                const filteredRows: EnrichedTicketRow[] = tickets
                  .filter((t) => filterItemByPeriod(t.soldAt || t.createdAt, period))
                  .map((t) => ({
                    ticket: t,
                    sale: salesByTicket.get(t.ticketNumber),
                    remise: t.coveredByRemiseId ? remisesByTicketId.get(t.coveredByRemiseId) : undefined,
                    lastControl: controlsByTicket.get(t.ticketNumber),
                  }));

                generateManagementReportPDF(filteredRows, period, currentUser);
              }}
              className="flex items-center gap-1 rounded-lg bg-amber-600/20 border border-amber-500/30 px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-600/30 transition cursor-pointer"
              title="Générer le rapport PDF officiel pour la période"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>PDF Période</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ALERTES ET SIGNALEMENTS PRIORITAIRES                                      */}
      {/* ========================================================================= */}
      {(alerts.length > 0 || pendingFraudsCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {alerts.length > 0 && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Alertes de Remises ({alerts.length})</span>
                </div>
                <span className="text-[11px] text-amber-300/80">Seuil : dès 10 tickets non versés</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {alerts.slice(0, 3).map((al) => (
                  <div
                    key={al.id}
                    onClick={() => handleOpenRemiseForAgent(al.agentId)}
                    className="cursor-pointer rounded-xl border border-amber-500/30 bg-slate-900/90 px-3 py-1.5 text-xs flex items-center justify-between gap-3 hover:bg-slate-800 transition"
                  >
                    <div>
                      <span className="font-bold text-white">{al.agentName}</span>
                      <span className="text-[11px] text-amber-400 font-mono ml-2">
                        {al.unremittedTicketsCount} t. ({formatFCFA(al.unremittedAmount)})
                      </span>
                    </div>
                    <span className="text-[10px] rounded bg-amber-500/20 text-amber-300 px-1.5 py-0.5 font-bold">
                      Palier {al.thresholdPassed}+
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingFraudsCount > 0 && (
            <div
              onClick={() => {
                setFraudFilterStatus('ALL');
                setFraudManagementModalOpen(true);
              }}
              className="cursor-pointer rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-center justify-between hover:bg-rose-500/15 transition group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                    Signalements de Fraude en Attente
                  </h4>
                  <p className="text-xs text-rose-200/80 mt-0.5">
                    {pendingFraudsCount} infraction(s) ou faux ticket(s) à instruire
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-rose-400 flex items-center gap-1 group-hover:translate-x-1 transition">
                Examiner <ArrowUpRight className="w-4 h-4" />
              </span>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 12 KPIS OBLIGATOIRES ADMINISTRATEUR (ORGANISÉS ET LISIBLES SUR MOBILE)    */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Indicateurs Clés du Système
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            {period.type === 'today'
              ? "Vue Aujourd'hui"
              : period.type === 'week'
              ? 'Vue Semaine en cours'
              : period.type === 'month'
              ? 'Vue Mois en cours'
              : 'Vue Période Personnalisée'}
          </span>
        </div>

        {/* Ligne 1 : Tickets & Stocks */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {/* 1. Tickets Générés */}
          <StatCard
            title="Tickets Générés"
            value={totalTickets}
            subtitle={`${totalCarnets} carnets émis`}
            icon={<Layers className="w-4 h-4" />}
            variant="slate"
            onClick={() => setTicketModalOpen(true)}
          />

          {/* 2. Tickets Disponibles */}
          <StatCard
            title="Tickets Disponibles"
            value={availableTickets.length}
            subtitle="Magasin + Secteur + Agent"
            icon={<TicketIcon className="w-4 h-4" />}
            variant="blue"
            onClick={() => setTicketModalOpen(true)}
          />

          {/* 3. Valeur Potentielle Stock */}
          <StatCard
            title="Valeur Potentielle"
            value={formatFCFA(stockPotentialValue)}
            subtitle={`Dispo: ${formatFCFA(availableStockValue)}`}
            icon={<Banknote className="w-4 h-4" />}
            variant="slate"
          />

          {/* 4. Tickets Vendus */}
          <StatCard
            title="Tickets Vendus"
            value={periodSoldTicketsCount}
            subtitle={`Total absolu : ${allSoldTicketsCount}`}
            icon={<CheckCircle2 className="w-4 h-4" />}
            variant="emerald"
            onClick={() => setSalesModalOpen(true)}
          />

          {/* 5. Valeur Totale Ventes */}
          <StatCard
            title="Valeur des Ventes"
            value={formatFCFA(periodSalesAmount)}
            subtitle={`Cumul : ${formatFCFA(allSalesAmount)}`}
            icon={<Receipt className="w-4 h-4" />}
            variant="emerald"
            onClick={() => setSalesModalOpen(true)}
          />

          {/* 6. Tickets Annulés */}
          <StatCard
            title="Tickets Annulés"
            value={cancelledTickets.length}
            subtitle="Rejets / détruits"
            icon={<XCircle className="w-4 h-4" />}
            variant="rose"
            onClick={() => setTicketModalOpen(true)}
          />
        </div>

        {/* Ligne 2 : Finances & Effectifs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {/* 7. Total Remis */}
          <StatCard
            title="Total Remis"
            value={formatFCFA(periodRemittedAmount)}
            subtitle={`Cumul : ${formatFCFA(allRemittedAmount)}`}
            icon={<HandCoins className="w-4 h-4" />}
            variant="blue"
            onClick={() => setRemisesModalOpen(true)}
          />

          {/* 8. Total Restant à Remettre */}
          <StatCard
            title="Restant à Remettre"
            value={formatFCFA(periodRemainingBalance)}
            subtitle={`Cumul : ${formatFCFA(allRemainingBalance)}`}
            icon={<AlertTriangle className="w-4 h-4" />}
            variant={periodRemainingBalance > 0 ? 'amber' : 'slate'}
            onClick={() => {
              setSelectedAgentForVentes(undefined);
              setVentesARemettreOpen(true);
            }}
          />

          {/* 9. Nombre d'Agents */}
          <StatCard
            title="Agents Actifs"
            value={activeAgents.length}
            subtitle="Force de vente"
            icon={<Users className="w-4 h-4" />}
            variant="slate"
            onClick={() => setUsersModalOpen(true)}
          />

          {/* 10. Nombre de Responsables */}
          <StatCard
            title="Responsables"
            value={activeResponsables.length}
            subtitle={`${sectors.length} secteurs`}
            icon={<Building2 className="w-4 h-4" />}
            variant="slate"
            onClick={() => setUsersModalOpen(true)}
          />

          {/* 11. Alertes */}
          <StatCard
            title="Alertes Financières"
            value={alerts.length}
            subtitle="Agents en vigilance"
            icon={<AlertTriangle className="w-4 h-4" />}
            variant={alerts.length > 0 ? 'amber' : 'slate'}
            onClick={() => {
              setSelectedAgentForVentes(undefined);
              setVentesARemettreOpen(true);
            }}
          />

          {/* 12. Signalements Fraude */}
          <StatCard
            title="Fraudes Signalées"
            value={filteredFrauds.length}
            subtitle={`Total historique : ${totalFrauds}`}
            icon={<ShieldAlert className="w-4 h-4" />}
            variant={filteredFrauds.length > 0 ? 'rose' : 'slate'}
            onClick={() => {
              setFraudFilterStatus('ALL');
              setFraudManagementModalOpen(true);
            }}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUIVI DE LA TRÉSORERIE ET DES ENCAISSEMENTS MOBILES                       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Encaissements Mobiles vs Espèces */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h3 className="text-sm font-black text-white">Analyse des Modes d'Encaissement</h3>
              <p className="text-[11px] text-slate-400">Répartition des recettes entre espèces physiques et paiements Mobile Money.</p>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase font-mono bg-slate-950 px-2.5 py-1 rounded-md">Période Active</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* Jauge globale de répartition */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-emerald-400 font-bold flex items-center gap-1">💵 Espèces (Cash)</span>
                <span className="font-mono font-bold text-white">
                  {formatFCFA(periodSalesAmount - (filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY').length * TICKET_PRICE_FCFA))}
                  {' '}({periodSalesAmount > 0 ? (((periodSalesAmount - (filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY').length * TICKET_PRICE_FCFA)) / periodSalesAmount) * 100).toFixed(0) : 0}%)
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-blue-400 font-bold flex items-center gap-1">📱 Mobile Money (MoMo)</span>
                <span className="font-mono font-bold text-white">
                  {formatFCFA(filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY').length * TICKET_PRICE_FCFA)}
                  {' '}({periodSalesAmount > 0 ? (((filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY').length * TICKET_PRICE_FCFA) / periodSalesAmount) * 100).toFixed(0) : 0}%)
                </span>
              </div>

              {/* Barre de répartition visuelle */}
              <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden flex border border-slate-800">
                <div 
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: `${periodSalesAmount > 0 ? (((periodSalesAmount - (filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY').length * TICKET_PRICE_FCFA)) / periodSalesAmount) * 100) : 50}%` }}
                />
                <div 
                  className="bg-blue-500 h-full transition-all"
                  style={{ width: `${periodSalesAmount > 0 ? (((filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY').length * TICKET_PRICE_FCFA) / periodSalesAmount) * 100) : 50}%` }}
                />
              </div>
            </div>

            {/* Détails par opérateur Mobile Money */}
            <div className="rounded-xl bg-slate-950 p-3 space-y-2 border border-slate-850">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Détails Opérateurs MoMo</span>
              
              {/* Wave */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-sky-400 font-bold">Wave</span>
                <span className="font-mono font-bold text-slate-200">
                  {formatFCFA(filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY' && s.paymentReference?.startsWith('WAVE-')).length * TICKET_PRICE_FCFA)}
                </span>
              </div>
              
              {/* Orange */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-orange-400 font-bold">Orange Money</span>
                <span className="font-mono font-bold text-slate-200">
                  {formatFCFA(filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY' && s.paymentReference?.startsWith('ORANGE-')).length * TICKET_PRICE_FCFA)}
                </span>
              </div>

              {/* MTN */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-yellow-400 font-bold">MTN MoMo</span>
                <span className="font-mono font-bold text-slate-200">
                  {formatFCFA(filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY' && s.paymentReference?.startsWith('MTN-')).length * TICKET_PRICE_FCFA)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Trésorerie Nette Consolidée */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-white">Trésorerie Consolidée du Corridor</h3>
            <p className="text-[11px] text-slate-400">Bilan des encaissements sécurisés et des dépenses opérationnelles sur la période.</p>
          </div>

          <div className="space-y-2.5 my-3">
            {/* Espèces reçues en caisse (remises validées) */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Espèces Reçues (Remises)</span>
              <span className="font-mono font-bold text-emerald-400">+{formatFCFA(periodRemittedAmount)}</span>
            </div>

            {/* MoMo direct en banque */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">MoMo Encaissés (Banque)</span>
              <span className="font-mono font-bold text-blue-400">+{formatFCFA(filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY').length * TICKET_PRICE_FCFA)}</span>
            </div>

            {/* Dépenses approuvées */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Dépenses Approuvées</span>
              <span className="font-mono font-bold text-rose-400">-{formatFCFA(expenses?.filter(e => (e.status === 'VALIDATED' || e.status === 'VALIDEE') && filterItemByPeriod(e.expenseDate, period)).reduce((sum, e) => sum + e.amount, 0) || 0)}</span>
            </div>

            <div className="border-t border-slate-800 pt-2.5 flex justify-between items-center text-xs font-black">
              <span className="text-white">Solde Net Trésorerie</span>
              <span className="font-mono text-sm text-emerald-300">
                {formatFCFA(
                  periodRemittedAmount + 
                  (filteredSales.filter(s => s.paymentMethod === 'MOBILE_MONEY').length * TICKET_PRICE_FCFA) - 
                  (expenses?.filter(e => (e.status === 'VALIDATED' || e.status === 'VALIDEE') && filterItemByPeriod(e.expenseDate, period)).reduce((sum, e) => sum + e.amount, 0) || 0)
                )}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 italic bg-slate-950 p-2 rounded-xl text-center border border-slate-850">
            Trésorerie calculée en temps réel d'après les flux financiers validés
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* GRAPHIQUES ET STATISTIQUES REQUIS                                         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Ventes et Remises par Période */}
        <SalesTimelineChart
          data={timelineData}
          title="Ventes et Remises par Période"
          subtitle="Suivi comparatif des tickets vendus et des remises encaissées"
          showRemises={true}
        />

        {/* 2. Répartition du Stock (Tickets disponibles, en secteur, vendus...) */}
        <StockDistributionChart breakdown={stockBreakdown} pricePerTicket={TICKET_PRICE_FCFA} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 3. Ventes par Responsable */}
        <EntityRankingChart
          title="Ventes par Responsable & Secteur"
          items={salesByResponsable}
          emptyMessage="Aucune vente enregistrée pour les responsables sur cette période."
          showRemitted={true}
        />

        {/* 4. Ventes par Agent */}
        <EntityRankingChart
          title="Ventes par Agent de Terrain"
          items={salesByAgent}
          emptyMessage="Aucune vente enregistrée pour les agents sur cette période."
          showRemitted={true}
        />
      </div>

      {/* ========================================================================= */}
      {/* DÉCOMPOSITION FINANCIÈRE PAR AGENT AVEC ACTIONS RAPIDES                   */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 sm:p-5 shadow-sm space-y-3 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">
              Décomposition Individuelle par Agent ({processedAgents.length})
            </h3>
            <p className="text-xs text-slate-400">
              Montant attendu strict (5 000 FCFA × ventes), montant remis et régularisation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedAgentForVentes(undefined);
                setVentesARemettreOpen(true);
              }}
              className="rounded-xl bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition cursor-pointer"
            >
              Ventes non couvertes
            </button>
            <button
              onClick={() => {
                setSelectedAgentForRemise(undefined);
                setNewRemiseModalOpen(true);
              }}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition cursor-pointer shadow-sm"
            >
              + Encaisser Remise
            </button>
          </div>
        </div>

        {/* Barre de Recherche et de Filtrage Ergonomique (frontend-design guidelines compliant) */}
        <div className="flex flex-col sm:flex-row gap-3 items-center bg-slate-950 p-3 rounded-xl border border-slate-850 text-xs">
          {/* Recherche de l'agent */}
          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Rechercher un agent..."
              value={agentSearchQuery}
              onChange={(e) => setAgentSearchQuery(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-800 pl-9 pr-3 py-2 text-white text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-purple-500 transition"
            />
          </div>

          {/* Filtrage par secteur */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Secteur :</span>
            <select
              value={agentSectorFilter}
              onChange={(e) => setAgentSectorFilter(e.target.value)}
              className="rounded-lg bg-slate-900 border border-slate-800 text-white text-xs px-2.5 py-2 focus:outline-hidden focus:border-purple-500 transition cursor-pointer"
            >
              <option value="ALL">Tous les secteurs ({sectors.length})</option>
              {sectors.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>

          {/* Bouton de réinitialisation si filtré */}
          {(agentSearchQuery || agentSectorFilter !== 'ALL') && (
            <button
              onClick={() => {
                setAgentSearchQuery('');
                setAgentSectorFilter('ALL');
              }}
              className="text-xs font-semibold text-slate-400 hover:text-white transition py-1 px-2.5 hover:bg-slate-900 rounded-md shrink-0 cursor-pointer"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400 bg-slate-900/70 select-none">
              <tr>
                <th 
                  onClick={() => toggleSort('name')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white transition whitespace-nowrap"
                >
                  <span className="flex items-center">
                    Agent {renderSortIndicator('name')}
                  </span>
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap">Secteur</th>
                <th 
                  onClick={() => toggleSort('sold')}
                  className="py-2.5 px-3 text-center cursor-pointer hover:text-white transition whitespace-nowrap"
                >
                  <span className="flex items-center justify-center">
                    Tickets Vendus {renderSortIndicator('sold')}
                  </span>
                </th>
                <th 
                  onClick={() => toggleSort('expected')}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition whitespace-nowrap"
                >
                  <span className="flex items-center justify-end">
                    Montant Attendu {renderSortIndicator('expected')}
                  </span>
                </th>
                <th 
                  onClick={() => toggleSort('remitted')}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition whitespace-nowrap"
                >
                  <span className="flex items-center justify-end">
                    Montant Remis {renderSortIndicator('remitted')}
                  </span>
                </th>
                <th 
                  onClick={() => toggleSort('remaining')}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition whitespace-nowrap"
                >
                  <span className="flex items-center justify-end">
                    Solde Restant {renderSortIndicator('remaining')}
                  </span>
                </th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Statut</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {processedAgents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                    {activeAgents.length === 0 ? "Aucun agent actif répertorié." : "Aucun agent ne correspond aux critères de filtrage."}
                  </td>
                </tr>
              ) : (
                processedAgents.map((ag) => {
                  const expected = ag.expected;
                  const remitted = ag.remitted;
                  const remaining = ag.remaining;
                  const alertItem = ag.alertItem;

                  return (
                    <tr key={ag.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 font-sans font-bold text-white whitespace-nowrap">
                        {ag.fullName}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-400 whitespace-nowrap text-[11px]">
                        {ag.sectorName || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center text-emerald-400 font-bold whitespace-nowrap">
                        {ag.agentSold}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200 whitespace-nowrap">
                        {formatFCFA(expected)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 font-bold whitespace-nowrap">
                        {formatFCFA(remitted)}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold">
                        <span className={remaining > 0 ? 'text-amber-400' : 'text-slate-400'}>
                          {formatFCFA(remaining)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap font-sans">
                        {alertItem ? (
                          <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold">
                            ⚠️ Palier {alertItem.thresholdPassed}+
                          </span>
                        ) : remaining === 0 ? (
                          <span className="rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">
                            ✓ À jour
                          </span>
                        ) : (
                          <span className="rounded bg-slate-800 text-slate-300 px-2 py-0.5 text-[10px]">
                            {Math.ceil(remaining / TICKET_PRICE_FCFA)} en attente
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedBadgeAgent(ag);
                              setBadgeModalOpen(true);
                            }}
                            className="rounded-lg bg-orange-600/20 border border-orange-500/30 px-2 py-1 text-[11px] font-bold text-orange-300 hover:bg-orange-600/30 transition cursor-pointer"
                            title="Éditer et imprimer le badge professionnel 85×120 mm"
                          >
                            Badge
                          </button>
                          <button
                            onClick={() => handleOpenVentesForAgent(ag.id)}
                            className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                          >
                            Ventes
                          </button>
                          <button
                            onClick={() => handleOpenRemiseForAgent(ag.id)}
                            className="rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-600/30 transition cursor-pointer"
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

      {/* ========================================================================= */}
      {/* MODALS ADMINISTRATEUR                                                     */}
      {/* ========================================================================= */}
      <CarnetGeneratorModal
        isOpen={carnetModalOpen}
        onClose={() => setCarnetModalOpen(false)}
      />
      <CarnetManagementModal
        isOpen={carnetManagementModalOpen}
        onClose={() => setCarnetManagementModalOpen(false)}
      />
      <TicketListModal
        isOpen={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
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
      <ControlsListModal
        isOpen={controlsModalOpen}
        onClose={() => setControlsModalOpen(false)}
      />
      <AuditTrailModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      />
      <UserManagementModal
        isOpen={usersModalOpen}
        onClose={() => setUsersModalOpen(false)}
      />
      <SupabaseModal
        isOpen={supabaseModalOpen}
        onClose={() => setSupabaseModalOpen(false)}
      />
      <FraudManagementModal
        isOpen={fraudManagementModalOpen}
        onClose={() => setFraudManagementModalOpen(false)}
        initialFilterStatus={fraudFilterStatus}
      />
      <AdvancedSearchModal
        isOpen={advancedSearchModalOpen}
        onClose={() => setAdvancedSearchModalOpen(false)}
      />
      <AdminSettingsModal
        isOpen={adminSettingsModalOpen}
        onClose={() => setAdminSettingsModalOpen(false)}
      />
      <AgentBadgeModal
        isOpen={badgeModalOpen}
        onClose={() => {
          setBadgeModalOpen(false);
          setSelectedBadgeAgent(undefined);
        }}
        selectedAgent={selectedBadgeAgent}
      />
        </div>
      )}
    </div>
  );
};
