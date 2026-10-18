import { create } from 'zustand';
import type {
  User,
  Carnet,
  Ticket,
  Sale,
  Control,
  FraudReport,
  Remise,
  Expense,
  AuditLog,
  FinancialAlert,
  NotificationRecord,
  DailyClosing,
  Vehicle,
  TicketReprint,
  SOSAlert,
  LitigeChauffeur,
  BrigadeAssignment,
} from '../types';
import { DEFAULT_SECTORS, TICKET_PRICE_FCFA } from '../config/constants';
import { computeIndexes, type PrecomputedIndexes } from './indexCalculators';

export interface PortusState {
  // Données principales
  users: User[];
  carnets: Carnet[];
  tickets: Ticket[];
  sales: Sale[];
  controls: Control[];
  fraudReports: FraudReport[];
  remises: Remise[];
  expenses: Expense[];
  auditLogs: AuditLog[];
  alerts: FinancialAlert[];
  notifications: NotificationRecord[];
  dailyClosings: DailyClosing[];
  vehicles: Vehicle[];
  ticketReprints: TicketReprint[];
  sosAlerts: SOSAlert[];
  litigesChauffeurs: LitigeChauffeur[];
  brigadeAssignments: BrigadeAssignment[];
  sectors: typeof DEFAULT_SECTORS;
  ticketPrice: number;

  // Statuts réseau & synchro
  isLoading: boolean;
  isSyncing: boolean;
  pendingSyncCount: number;
  lastSyncedSaleNumber: string | null;
  isSimulatedOffline: boolean;
  isRlsPermissionIssue: boolean;
  lastRlsError: string;

  // Realtime & Sécurité
  latestRealtimeIncident: FraudReport | null;
  isRealtimeConnected: boolean;

  // Index précalculés
  indexes: PrecomputedIndexes;

  // Actions d'état (Mise à jour atomique de lecture)
  setAllData: (data: Partial<Omit<PortusState, 'indexes' | 'setAllData'>>) => void;
  setTicketPrice: (price: number) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsSyncing: (isSyncing: boolean) => void;
  setPendingSyncCount: (count: number) => void;
  setLastSyncedSaleNumber: (num: string | null) => void;
  setLatestRealtimeIncident: (incident: FraudReport | null) => void;
  setIsRealtimeConnected: (connected: boolean) => void;
  setIsSimulatedOffline: (offline: boolean) => void;
}

const emptyIndexes = computeIndexes([], []);

export const usePortusStore = create<PortusState>((set) => ({
  users: [],
  carnets: [],
  tickets: [],
  sales: [],
  controls: [],
  fraudReports: [],
  remises: [],
  expenses: [],
  auditLogs: [],
  alerts: [],
  notifications: [],
  dailyClosings: [],
  vehicles: [],
  ticketReprints: [],
  sosAlerts: [],
  litigesChauffeurs: [],
  brigadeAssignments: [],
  sectors: DEFAULT_SECTORS,
  ticketPrice: TICKET_PRICE_FCFA,

  isLoading: true,
  isSyncing: false,
  pendingSyncCount: 0,
  lastSyncedSaleNumber: null,
  isSimulatedOffline: false,
  isRlsPermissionIssue: false,
  lastRlsError: '',

  latestRealtimeIncident: null,
  isRealtimeConnected: false,

  indexes: emptyIndexes,

  setAllData: (data) =>
    set((state) => {
      const nextTickets = data.tickets !== undefined ? data.tickets : state.tickets;
      const nextSales = data.sales !== undefined ? data.sales : state.sales;

      const nextIndexes =
        data.tickets !== undefined || data.sales !== undefined
          ? computeIndexes(nextTickets, nextSales)
          : state.indexes;

      return {
        ...state,
        ...data,
        indexes: nextIndexes,
      };
    }),

  setTicketPrice: (price) => set({ ticketPrice: price }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setPendingSyncCount: (count) => set({ pendingSyncCount: count }),
  setLastSyncedSaleNumber: (num) => set({ lastSyncedSaleNumber: num }),
  setLatestRealtimeIncident: (incident) => set({ latestRealtimeIncident: incident }),
  setIsRealtimeConnected: (connected) => set({ isRealtimeConnected: connected }),
  setIsSimulatedOffline: (offline) => set({ isSimulatedOffline: offline }),
}));

// Sélecteurs modulaires à granularité fine pour éviter les re-renders inutiles
export const useUsers = () => usePortusStore((s) => s.users);
export const useCarnets = () => usePortusStore((s) => s.carnets);
export const useTickets = () => usePortusStore((s) => s.tickets);
export const useSales = () => usePortusStore((s) => s.sales);
export const useRemises = () => usePortusStore((s) => s.remises);
export const useExpenses = () => usePortusStore((s) => s.expenses);
export const useAuditLogs = () => usePortusStore((s) => s.auditLogs);
export const useVehicles = () => usePortusStore((s) => s.vehicles);
export const useIndexes = () => usePortusStore((s) => s.indexes);
