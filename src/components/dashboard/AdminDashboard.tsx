import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Ticket as TicketIcon,
  Banknote,
  AlertTriangle,
  Plus,
  Users,
  FileSpreadsheet,
  HandCoins,
  ShieldAlert,
  Receipt,
  CheckCircle2,
  XCircle,
  Building2,
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
  User as UserIcon,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { CoteDIvoireMap } from '../common/CoteDIvoireMap';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA } from '../../utils/normalization';
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
import type { User, FraudReport, Sale } from '../../types';

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

function isMobileMoneySale(s: Sale): boolean {
  const m = s.paymentMethod;
  return (
    m === 'WAVE' ||
    m === 'ORANGE_MONEY' ||
    m === 'MOOV' ||
    m === 'MTN_MOMO' ||
    m === 'MOBILE_MONEY'
  );
}

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
  const [agentSortField, setAgentSortField] = useState<
    'name' | 'sold' | 'expected' | 'remitted' | 'remaining'
  >('sold');
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
  const [fraudFilterStatus, setFraudFilterStatus] = useState<FraudReport['status'] | 'ALL'>('ALL');
  const [advancedSearchModalOpen, setAdvancedSearchModalOpen] = useState(false);
  const [adminSettingsModalOpen, setAdminSettingsModalOpen] = useState(false);
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);
  const [selectedBadgeAgent, setSelectedBadgeAgent] = useState<User | undefined>(undefined);

  useEffect(() => {
    const handleNotificationClicked = (e: Event) => {
      const customEvent = e as CustomEvent<{ type?: string }>;
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
    return () =>
      window.removeEventListener('portus-notification-clicked', handleNotificationClicked);
  }, []);

  // ---------------------------------------------------------------------------
  // DONNÉES GLOBALES ET FILTRÉES PAR PÉRIODE (SUPABASE / INDEXEDDB)
  // ---------------------------------------------------------------------------
  const totalCarnets = carnets.length;
  const totalTickets = tickets.length;

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

  const stockPotentialValue = totalTickets * TICKET_PRICE_FCFA;
  const availableStockValue = availableTickets.length * TICKET_PRICE_FCFA;

  const filteredSales = useMemo(() => {
    return sales.filter((s) => filterItemByPeriod(s.soldAt, period));
  }, [sales, period]);

  const filteredRemises = useMemo(() => {
    return remises.filter((r) => filterItemByPeriod(r.createdAt, period));
  }, [remises, period]);

  const filteredFrauds = useMemo(() => {
    return fraudReports.filter((f) => filterItemByPeriod(f.reportedAt, period));
  }, [fraudReports, period]);

  const periodSoldTicketsCount = filteredSales.length;
  const periodSalesAmount = periodSoldTicketsCount * TICKET_PRICE_FCFA;
  const periodRemittedAmount = filteredRemises.reduce((sum, r) => sum + r.amount, 0);
  const periodRemainingBalance = Math.max(0, periodSalesAmount - periodRemittedAmount);

  // Décomposition modes de paiement Mobile Money vs Espèces
  const periodMomoAmount = useMemo(() => {
    return filteredSales.filter(isMobileMoneySale).length * TICKET_PRICE_FCFA;
  }, [filteredSales]);

  const periodCashSalesAmount = Math.max(0, periodSalesAmount - periodMomoAmount);

  const waveSalesAmount = useMemo(() => {
    return (
      filteredSales.filter(
        (s) =>
          s.paymentMethod === 'WAVE' ||
          (s.paymentMethod === 'MOBILE_MONEY' && s.paymentReference?.startsWith('WAVE-'))
      ).length * TICKET_PRICE_FCFA
    );
  }, [filteredSales]);

  const orangeSalesAmount = useMemo(() => {
    return (
      filteredSales.filter(
        (s) =>
          s.paymentMethod === 'ORANGE_MONEY' ||
          (s.paymentMethod === 'MOBILE_MONEY' && s.paymentReference?.startsWith('ORANGE-'))
      ).length * TICKET_PRICE_FCFA
    );
  }, [filteredSales]);

  const moovSalesAmount = useMemo(() => {
    return (
      filteredSales.filter(
        (s) =>
          s.paymentMethod === 'MOOV' ||
          (s.paymentMethod === 'MOBILE_MONEY' && s.paymentReference?.startsWith('MOOV-'))
      ).length * TICKET_PRICE_FCFA
    );
  }, [filteredSales]);

  const mtnSalesAmount = useMemo(() => {
    return (
      filteredSales.filter(
        (s) =>
          s.paymentMethod === 'MTN_MOMO' ||
          (s.paymentMethod === 'MOBILE_MONEY' && s.paymentReference?.startsWith('MTN-'))
      ).length * TICKET_PRICE_FCFA
    );
  }, [filteredSales]);

  // Cumuls absolus
  const allSoldTicketsCount = tickets.filter(
    (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
  ).length;
  const allSalesAmount = allSoldTicketsCount * TICKET_PRICE_FCFA;
  const allRemittedAmount = remises.reduce((sum, r) => sum + r.amount, 0);
  const allRemainingBalance = Math.max(0, allSalesAmount - allRemittedAmount);

  const activeAgents = useMemo(() => {
    return users.filter((u) => u.role === 'AGENT' && u.isActive);
  }, [users]);

  const activeResponsables = useMemo(() => {
    return users.filter((u) => u.role === 'RESPONSABLE' && u.isActive);
  }, [users]);

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
      if (agentSortField === 'name') {
        const valA = a.fullName.toLowerCase();
        const valB = b.fullName.toLowerCase();
        if (valA < valB) return agentSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return agentSortDirection === 'asc' ? 1 : -1;
        return 0;
      }

      const numA =
        agentSortField === 'sold'
          ? a.agentSold
          : agentSortField === 'expected'
          ? a.expected
          : agentSortField === 'remitted'
          ? a.remitted
          : a.remaining;

      const numB =
        agentSortField === 'sold'
          ? b.agentSold
          : agentSortField === 'expected'
          ? b.expected
          : agentSortField === 'remitted'
          ? b.remitted
          : b.remaining;

      if (numA < numB) return agentSortDirection === 'asc' ? -1 : 1;
      if (numA > numB) return agentSortDirection === 'asc' ? 1 : -1;
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
  const timelineData = useMemo(() => {
    return buildTimelineData(filteredSales, filteredRemises, period);
  }, [filteredSales, filteredRemises, period]);

  const salesByResponsable: EntityRankItem[] = useMemo(() => {
    return activeResponsables
      .map((resp) => {
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
          detail: resp.sectorName || 'Superviseur Zone Portuaire',
          count,
          amount,
          remitted,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [activeResponsables, filteredSales, filteredRemises]);

  const salesByAgent: EntityRankItem[] = useMemo(() => {
    return activeAgents
      .map((ag) => {
        const agSales = filteredSales.filter((s) => s.agentId === ag.id);
        const count = agSales.length;
        const amount = count * TICKET_PRICE_FCFA;

        const agRemises = filteredRemises.filter((r) => r.agentId === ag.id);
        const remitted = agRemises.reduce((sum, r) => sum + r.amount, 0);

        return {
          id: ag.id,
          name: ag.fullName,
          detail: ag.sectorName || 'Pool Mobile U.J.P.A.S.',
          count,
          amount,
          remitted,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [activeAgents, filteredSales, filteredRemises]);

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

  const renderSortIndicator = (
    field: 'name' | 'sold' | 'expected' | 'remitted' | 'remaining'
  ) => {
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

  return (
    <div className="mx-auto max-w-7xl px-3 py-2.5 sm:px-6 space-y-3.5">
      {/* Navigation Onglets */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2.5">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
            activeTab === 'dashboard'
              ? 'bg-linear-to-r from-orange-600 to-emerald-700 text-white shadow-md shadow-orange-950/40 border border-orange-400/30'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Tableau de Bord U.J.P.A.S.</span>
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
        <div className="space-y-3.5">
          {/* ========================================================================= */}
          {/* EN-TÊTE DU TABLEAU DE BORD ADMIN                                          */}
          {/* ========================================================================= */}
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
                  Supervision Générale U.J.P.A.S. 🇨🇮
                </span>
                <span className="text-[11px] text-emerald-400 font-bold hidden sm:inline">
                  Zone Portuaire &amp; Industrielle d'Abidjan
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                Tableau de Bord Direction &amp; Administration
              </h2>
              <p className="text-xs text-slate-400">
                Pilotage consolidé des carnets, du flux financier direct (Agent → Superviseur → Admin) et des contrôles.
              </p>
            </div>

            <div className="relative z-10 flex items-center gap-2">
              <button
                onClick={handleExportAll}
                className="flex items-center gap-1.5 rounded-xl bg-slate-800/90 border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer shadow-xs"
                title="Exporter l'ensemble de la base en Excel"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Export Global Excel</span>
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
          {/* BLOC 2 : ACTIONS TERRAIN IMMÉDIATES (2 Grands Boutons Distincts)          */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-orange-400" />
                <span>Bloc 2 — Actions Terrain Immédiates</span>
              </h3>
              <span className="text-[11px] text-slate-500">Accès rapide 1-clic</span>
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
                      Saisie Vente Directe
                    </span>
                    <h4 className="text-lg sm:text-xl font-black text-white">Enregistrer Vente</h4>
                    <p className="text-xs text-orange-100/90 mt-0.5">
                      Émission immédiate de ticket poids lourd (2 500 FCFA) avec reçu QR Code
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
                      Versement d'Agent
                    </span>
                    <h4 className="text-lg sm:text-xl font-black text-white">Enregistrer Remise</h4>
                    <p className="text-xs text-emerald-100/90 mt-0.5">
                      Encaisser les fonds collectés par un agent (Espèces, Wave, Orange, Moov)
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
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Bloc 3 — Modules de Gestion Secondaire</span>
              </h3>
              <span className="text-[11px] text-slate-500">Grille structurée U.J.P.A.S.</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
                    Génération, attribution &amp; stock
                  </p>
                </div>
              </div>

              {/* 2. Équipe & Photos */}
              <div
                onClick={() => setUsersModalOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-blue-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 group-hover:scale-110 transition">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-300 px-2 py-0.5 border border-blue-500/30">
                    {activeAgents.length + activeResponsables.length} membre(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-blue-400 transition">
                    Équipe &amp; Photos
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Trombinoscope &amp; rôles actifs
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
                    Impression cartes de cou avec QR
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
                    Filtres avancés &amp; extractions
                  </p>
                </div>
              </div>

              {/* 5. Journal d'Audit */}
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
                    Audit &amp; Historique
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Traces inaltérables (Append-only)
                  </p>
                </div>
              </div>

              {/* 6. Signalements & Fraudes */}
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
                    {fraudReports.length} dossier(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-rose-400 transition">
                    Signalements &amp; Fraudes
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Contrôles routiers &amp; infractions
                  </p>
                </div>
              </div>

              {/* 7. Paramètres & Tarifs */}
              <div
                onClick={() => setAdminSettingsModalOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-slate-400/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-700/50 text-slate-300 border border-slate-600/40 group-hover:scale-110 transition">
                    <Settings className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-slate-700/40 text-slate-300 px-2 py-0.5 border border-slate-600/30">
                    Tarif 2.500 FCFA
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-slate-200 transition">
                    Paramètres &amp; Tarifs
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Configuration générale U.J.P.A.S.
                  </p>
                </div>
              </div>

              {/* 8. Synchronisation Cloud */}
              <div
                onClick={async () => {
                  if (syncingCloud) return;
                  setSyncingCloud(true);
                  const res = await syncAllToSupabase();
                  setSyncingCloud(false);
                  setSyncMessage(res.message);
                  setTimeout(() => setSyncMessage(null), 6000);
                }}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-teal-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 group-hover:scale-110 transition">
                    <CloudUpload className={`w-5 h-5 ${syncingCloud ? 'animate-spin' : ''}`} />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-teal-500/20 text-teal-300 px-2 py-0.5 border border-teal-500/30">
                    Supabase Cloud
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-teal-400 transition">
                    {syncingCloud ? 'Synchro en cours...' : 'Synchronisation Cloud'}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Sauvegarde intégrale PostgreSQL
                  </p>
                </div>
              </div>
            </div>
          </div>

          {syncMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{syncMessage}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* BARRE DE FILTRES TEMPORELS                                                */}
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

              <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
                <button
                  onClick={() => {
                    const salesByTicket = new Map<string, (typeof sales)[0]>();
                    sales.forEach((s) => salesByTicket.set(s.ticketNumber, s));
                    const remisesByTicketId = new Map<string, (typeof remises)[0]>();
                    remises.forEach((r) => remisesByTicketId.set(r.id, r));
                    const controlsByTicket = new Map<string, (typeof controls)[0]>();
                    controls.forEach((c) => {
                      if (
                        !controlsByTicket.has(c.ticketNumber) ||
                        new Date(c.controlledAt) >
                          new Date(controlsByTicket.get(c.ticketNumber)!.controlledAt)
                      ) {
                        controlsByTicket.set(c.ticketNumber, c);
                      }
                    });

                    const filteredRows: EnrichedTicketRow[] = tickets
                      .filter((t) => filterItemByPeriod(t.soldAt || t.createdAt, period))
                      .map((t) => ({
                        ticket: t,
                        sale: salesByTicket.get(t.ticketNumber),
                        remise: t.coveredByRemiseId
                          ? remisesByTicketId.get(t.coveredByRemiseId)
                          : undefined,
                        lastControl: controlsByTicket.get(t.ticketNumber),
                      }));

                    exportFilteredTicketsToExcel(filteredRows, period, currentUser);
                  }}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition cursor-pointer"
                  title="Exporter les tickets de la période en XLSX"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>XLSX Période</span>
                </button>

                <button
                  onClick={() => {
                    const salesByTicket = new Map<string, (typeof sales)[0]>();
                    sales.forEach((s) => salesByTicket.set(s.ticketNumber, s));
                    const remisesByTicketId = new Map<string, (typeof remises)[0]>();
                    remises.forEach((r) => remisesByTicketId.set(r.id, r));
                    const controlsByTicket = new Map<string, (typeof controls)[0]>();
                    controls.forEach((c) => {
                      if (
                        !controlsByTicket.has(c.ticketNumber) ||
                        new Date(c.controlledAt) >
                          new Date(controlsByTicket.get(c.ticketNumber)!.controlledAt)
                      ) {
                        controlsByTicket.set(c.ticketNumber, c);
                      }
                    });

                    const filteredRows: EnrichedTicketRow[] = tickets
                      .filter((t) => filterItemByPeriod(t.soldAt || t.createdAt, period))
                      .map((t) => ({
                        ticket: t,
                        sale: salesByTicket.get(t.ticketNumber),
                        remise: t.coveredByRemiseId
                          ? remisesByTicketId.get(t.coveredByRemiseId)
                          : undefined,
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
                    <span className="text-[11px] text-amber-300/80">
                      Seuil : dès 10 tickets non versés
                    </span>
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
          {/* 12 KPIS OBLIGATOIRES ADMINISTRATEUR                                       */}
          {/* ========================================================================= */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Indicateurs Clés du Système U.J.P.A.S.
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

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
              <StatCard
                title="Tickets Générés"
                value={totalTickets}
                subtitle={`${totalCarnets} carnets émis`}
                icon={<Layers className="w-4 h-4" />}
                variant="slate"
                onClick={() => setTicketModalOpen(true)}
              />
              <StatCard
                title="Tickets Disponibles"
                value={availableTickets.length}
                subtitle="Magasin + Superviseurs + Agents"
                icon={<TicketIcon className="w-4 h-4" />}
                variant="blue"
                onClick={() => setTicketModalOpen(true)}
              />
              <StatCard
                title="Valeur Potentielle"
                value={formatFCFA(stockPotentialValue)}
                subtitle={`Dispo: ${formatFCFA(availableStockValue)}`}
                icon={<Banknote className="w-4 h-4" />}
                variant="slate"
              />
              <StatCard
                title="Tickets Vendus"
                value={periodSoldTicketsCount}
                subtitle={`Total absolu : ${allSoldTicketsCount}`}
                icon={<CheckCircle2 className="w-4 h-4" />}
                variant="emerald"
                onClick={() => setSalesModalOpen(true)}
              />
              <StatCard
                title="Valeur des Ventes"
                value={formatFCFA(periodSalesAmount)}
                subtitle={`Cumul : ${formatFCFA(allSalesAmount)}`}
                icon={<Receipt className="w-4 h-4" />}
                variant="emerald"
                onClick={() => setSalesModalOpen(true)}
              />
              <StatCard
                title="Tickets Annulés"
                value={cancelledTickets.length}
                subtitle="Rejets / détruits"
                icon={<XCircle className="w-4 h-4" />}
                variant="rose"
                onClick={() => setTicketModalOpen(true)}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
              <StatCard
                title="Total Remis"
                value={formatFCFA(periodRemittedAmount)}
                subtitle={`Cumul : ${formatFCFA(allRemittedAmount)}`}
                icon={<HandCoins className="w-4 h-4" />}
                variant="blue"
                onClick={() => setRemisesModalOpen(true)}
              />
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
              <StatCard
                title="Agents Mobiles"
                value={activeAgents.length}
                subtitle="Pool global U.J.P.A.S."
                icon={<Users className="w-4 h-4" />}
                variant="slate"
                onClick={() => setUsersModalOpen(true)}
              />
              <StatCard
                title="Superviseurs"
                value={activeResponsables.length}
                subtitle={`${sectors.length} secteurs couverts`}
                icon={<Building2 className="w-4 h-4" />}
                variant="slate"
                onClick={() => setUsersModalOpen(true)}
              />
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
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <h3 className="text-sm font-black text-white">
                    Analyse des Modes d'Encaissement U.J.P.A.S.
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Répartition des recettes entre espèces physiques et paiements Mobile Money (Wave, Orange, Moov, MTN).
                  </p>
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase font-mono bg-slate-950 px-2.5 py-1 rounded-md">
                  Période Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      💵 Espèces (Cash)
                    </span>
                    <span className="font-mono font-bold text-white">
                      {formatFCFA(periodCashSalesAmount)} (
                      {periodSalesAmount > 0
                        ? ((periodCashSalesAmount / periodSalesAmount) * 100).toFixed(0)
                        : 0}
                      %)
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-blue-400 font-bold flex items-center gap-1">
                      📱 Mobile Money (Digital)
                    </span>
                    <span className="font-mono font-bold text-white">
                      {formatFCFA(periodMomoAmount)} (
                      {periodSalesAmount > 0
                        ? ((periodMomoAmount / periodSalesAmount) * 100).toFixed(0)
                        : 0}
                      %)
                    </span>
                  </div>

                  <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden flex border border-slate-800">
                    <div
                      className="bg-emerald-500 h-full transition-all"
                      style={{
                        width: `${
                          periodSalesAmount > 0
                            ? (periodCashSalesAmount / periodSalesAmount) * 100
                            : 50
                        }%`,
                      }}
                    />
                    <div
                      className="bg-blue-500 h-full transition-all"
                      style={{
                        width: `${
                          periodSalesAmount > 0 ? (periodMomoAmount / periodSalesAmount) * 100 : 50
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-slate-950 p-3 space-y-2 border border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                    Détails Opérateurs Mobile Money
                  </span>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-sky-400 font-bold">Wave</span>
                    <span className="font-mono font-bold text-slate-200">
                      {formatFCFA(waveSalesAmount)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-orange-400 font-bold">Orange Money</span>
                    <span className="font-mono font-bold text-slate-200">
                      {formatFCFA(orangeSalesAmount)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-indigo-400 font-bold">Moov Money</span>
                    <span className="font-mono font-bold text-slate-200">
                      {formatFCFA(moovSalesAmount)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-yellow-400 font-bold">MTN MoMo</span>
                    <span className="font-mono font-bold text-slate-200">
                      {formatFCFA(mtnSalesAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white">
                  Trésorerie Consolidée U.J.P.A.S.
                </h3>
                <p className="text-[11px] text-slate-400">
                  Circuit direct : Agent → Superviseur → Direction Générale.
                </p>
              </div>

              <div className="space-y-2.5 my-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Espèces Reçues (Remises)</span>
                  <span className="font-mono font-bold text-emerald-400">
                    +{formatFCFA(periodRemittedAmount)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Mobile Money Encaissés</span>
                  <span className="font-mono font-bold text-blue-400">
                    +{formatFCFA(periodMomoAmount)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Dépenses Approuvées</span>
                  <span className="font-mono font-bold text-rose-400">
                    -{formatFCFA(periodValidatedExpenses)}
                  </span>
                </div>

                <div className="border-t border-slate-800 pt-2.5 flex justify-between items-center text-xs font-black">
                  <span className="text-white">Solde Net Trésorerie</span>
                  <span className="font-mono text-sm text-emerald-300">
                    {formatFCFA(
                      periodRemittedAmount + periodMomoAmount - periodValidatedExpenses
                    )}
                  </span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 italic bg-slate-950 p-2 rounded-xl text-center border border-slate-800">
                Trésorerie calculée en temps réel d'après les flux financiers validés
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* GRAPHIQUES ET STATISTIQUES REQUIS                                         */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SalesTimelineChart
              data={timelineData}
              title="Ventes et Remises par Période"
              subtitle="Suivi comparatif des tickets vendus et des remises encaissées"
              showRemises={true}
            />
            <StockDistributionChart breakdown={stockBreakdown} pricePerTicket={TICKET_PRICE_FCFA} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EntityRankingChart
              title="Ventes par Superviseur"
              items={salesByResponsable}
              emptyMessage="Aucune vente enregistrée pour les superviseurs sur cette période."
              showRemitted={true}
            />
            <EntityRankingChart
              title="Ventes par Agent de Terrain"
              items={salesByAgent}
              emptyMessage="Aucune vente enregistrée pour les agents sur cette période."
              showRemitted={true}
            />
          </div>

          {/* ========================================================================= */}
          {/* DÉCOMPOSITION FINANCIÈRE PAR AGENT AVEC TROMBINOSCOPE & ACTIONS RAPIDES   */}
          {/* ========================================================================= */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-3.5 sm:p-4 shadow-sm space-y-2.5 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Décomposition Individuelle par Agent ({processedAgents.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Pool global d'agents mobiles U.J.P.A.S. • Montant attendu (5 000 FCFA × ventes) et remises.
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

            <div className="flex flex-col sm:flex-row gap-3 items-center bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
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

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  Filtre :
                </span>
                <select
                  value={agentSectorFilter}
                  onChange={(e) => setAgentSectorFilter(e.target.value)}
                  className="rounded-lg bg-slate-900 border border-slate-800 text-white text-xs px-2.5 py-2 focus:outline-hidden focus:border-purple-500 transition cursor-pointer"
                >
                  <option value="ALL">Pool Mobile Complet ({activeAgents.length})</option>
                  {sectors.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>

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
                        Agent &amp; Photo {renderSortIndicator('name')}
                      </span>
                    </th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Affectation</th>
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
                        {activeAgents.length === 0
                          ? 'Aucun agent actif répertorié.'
                          : 'Aucun agent ne correspond aux critères de filtrage.'}
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
                          <td className="py-2.5 px-3 font-sans text-slate-400 whitespace-nowrap text-[11px]">
                            Pool Mobile U.J.P.A.S.
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
                                title="Éditer la photo et imprimer le badge professionnel 85×120 mm"
                              >
                                Badge / Photo
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
          <TicketListModal isOpen={ticketModalOpen} onClose={() => setTicketModalOpen(false)} />
          <SalesListModal
            isOpen={salesModalOpen}
            onClose={() => setSalesModalOpen(false)}
            onOpenNewSale={() => {
              setSalesModalOpen(false);
              setSaleModalOpen(true);
            }}
          />
          <SaleFormModal isOpen={saleModalOpen} onClose={() => setSaleModalOpen(false)} />
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
          <AuditTrailModal isOpen={auditModalOpen} onClose={() => setAuditModalOpen(false)} />
          <UserManagementModal isOpen={usersModalOpen} onClose={() => setUsersModalOpen(false)} />
          <SupabaseModal isOpen={supabaseModalOpen} onClose={() => setSupabaseModalOpen(false)} />
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
