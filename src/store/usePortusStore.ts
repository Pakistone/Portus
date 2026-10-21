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
  Role,
} from '../types';
import { DEFAULT_SECTORS, TICKET_PRICE_FCFA } from '../config/constants';
import { computeIndexes, type PrecomputedIndexes } from './indexCalculators';
import { getDB } from '../db/indexedDb';
import { getSupabase } from '../db/supabaseClient';
import { SupabaseDataLayer } from '../db/supabaseService';
import { safeFetchJson } from '../utils/safeApi';

/**
 * Rôles opérationnels officiels U.J.P.A.S. (le rôle TRESORIER / CAISSIER est masqué dans l'UI).
 */
export const VISIBLE_UJPAS_ROLES: readonly Role[] = [
  'ADMINISTRATEUR',
  'RESPONSABLE',
  'AGENT',
  'CONTROLEUR',
] as const;

export interface PortusState {
  // Données principales du domaine U.J.P.A.S.
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

  // Statuts réseau & synchronisation
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

  // Index précalculés O(1)
  indexes: PrecomputedIndexes;

  // Actions d'état atomiques
  setAllData: (
    data: Partial<Omit<PortusState, 'indexes' | 'setAllData' | 'deleteCarnetPermanently'>>
  ) => void;
  deleteCarnetPermanently: (carnetId: string) => Promise<void>;
  setTicketPrice: (price: number) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsSyncing: (isSyncing: boolean) => void;
  setPendingSyncCount: (count: number) => void;
  setLastSyncedSaleNumber: (num: string | null) => void;
  setLatestRealtimeIncident: (incident: FraudReport | null) => void;
  setIsRealtimeConnected: (connected: boolean) => void;
  setIsSimulatedOffline: (offline: boolean) => void;
  setIsRlsPermissionIssue: (issue: boolean, error?: string) => void;
}

const emptyIndexes = computeIndexes([], [], [], []);

export const usePortusStore = create<PortusState>((set, get) => ({
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
      const nextUsers =
        data.users !== undefined
          ? data.users.filter((u) => (u.role as string) !== 'TRESORIER')
          : state.users;
      const nextTickets = data.tickets !== undefined ? data.tickets : state.tickets;
      const nextSales = data.sales !== undefined ? data.sales : state.sales;
      const nextVehicles = data.vehicles !== undefined ? data.vehicles : state.vehicles;

      const shouldRecomputeIndexes =
        data.tickets !== undefined ||
        data.sales !== undefined ||
        data.users !== undefined ||
        data.vehicles !== undefined;

      const nextIndexes = shouldRecomputeIndexes
        ? computeIndexes(nextTickets, nextSales, nextUsers, nextVehicles)
        : state.indexes;

      return {
        ...state,
        ...data,
        users: nextUsers,
        indexes: nextIndexes,
      };
    }),

  deleteCarnetPermanently: async (carnetId: string) => {
    const currentState = get();
    const targetCarnet = currentState.carnets.find(
      (c) => c.id === carnetId || c.carnetNumber === carnetId
    );
    const resolvedCarnetId = targetCarnet?.id || carnetId;
    const resolvedCarnetNumber = targetCarnet?.carnetNumber || carnetId;

    const removedTicketIds = new Set(
      currentState.tickets
        .filter(
          (t) => t.carnetId === resolvedCarnetId || t.carnetNumber === resolvedCarnetNumber
        )
        .map((t) => t.id)
    );

    const nextCarnets = currentState.carnets.filter(
      (c) => c.id !== resolvedCarnetId && c.carnetNumber !== resolvedCarnetNumber
    );
    const nextTickets = currentState.tickets.filter(
      (t) => t.carnetId !== resolvedCarnetId && t.carnetNumber !== resolvedCarnetNumber
    );
    const nextSales = currentState.sales.filter((s) => !removedTicketIds.has(s.ticketId));
    const nextControls = currentState.controls.filter(
      (ctrl) => !ctrl.ticketId || !removedTicketIds.has(ctrl.ticketId)
    );

    // 1. Mise à jour immédiate et atomique du store Zustand + recalcul des index O(1)
    set({
      carnets: nextCarnets,
      tickets: nextTickets,
      sales: nextSales,
      controls: nextControls,
      indexes: computeIndexes(
        nextTickets,
        nextSales,
        currentState.users,
        currentState.vehicles
      ),
    });

    // 2. Purge transactionnelle dans IndexedDB (Zéro contournement localStorage)
    try {
      const db = await getDB();
      const allDbTickets: Ticket[] = await db.getAll('tickets');
      const dbTicketsToDelete = allDbTickets.filter(
        (t) => t.carnetId === resolvedCarnetId || t.carnetNumber === resolvedCarnetNumber
      );
      const dbTicketIdSet = new Set<string>([
        ...Array.from(removedTicketIds),
        ...dbTicketsToDelete.map((t) => t.id),
      ]);

      if (dbTicketIdSet.size > 0) {
        const allDbSales: Sale[] = await db.getAll('sales');
        const salesIds = allDbSales
          .filter((s) => dbTicketIdSet.has(s.ticketId))
          .map((s) => s.id);
        if (salesIds.length > 0) {
          const txSales = db.transaction('sales', 'readwrite');
          await Promise.all([...salesIds.map((id) => txSales.store.delete(id)), txSales.done]);
        }

        const allDbControls: Control[] = await db.getAll('controls');
        const controlIds = allDbControls
          .filter((c) => c.ticketId && dbTicketIdSet.has(c.ticketId))
          .map((c) => c.id);
        if (controlIds.length > 0) {
          const txControls = db.transaction('controls', 'readwrite');
          await Promise.all([
            ...controlIds.map((id) => txControls.store.delete(id)),
            txControls.done,
          ]);
        }

        if (db.objectStoreNames.contains('ticket_assignments')) {
          const allAssignments = await db.getAll('ticket_assignments');
          const assignmentIds = allAssignments
            .filter(
              (a) =>
                a.carnetId === resolvedCarnetId ||
                (a.ticketId && dbTicketIdSet.has(a.ticketId))
            )
            .map((a) => a.id);
          if (assignmentIds.length > 0) {
            const txAsg = db.transaction('ticket_assignments', 'readwrite');
            await Promise.all([
              ...assignmentIds.map((id) => txAsg.store.delete(id)),
              txAsg.done,
            ]);
          }
        }

        const txTickets = db.transaction('tickets', 'readwrite');
        await Promise.all([
          ...Array.from(dbTicketIdSet).map((id) => txTickets.store.delete(id)),
          txTickets.done,
        ]);
      }

      await db.delete('carnets', resolvedCarnetId);
    } catch (dbErr) {
      console.error('[PORTUS Store] Erreur lors de la purge IndexedDB du carnet:', dbErr);
    }

    // 3. Suppression définitive sur Supabase (CASCADE) et via l'API backend
    if (SupabaseDataLayer.isAvailable()) {
      const supabase = getSupabase();
      let sessionToken: string | undefined;
      if (supabase) {
        try {
          const { data } = await supabase.auth.getSession();
          sessionToken = data.session?.access_token;
        } catch (authErr) {
          console.warn('[PORTUS Store] Lecture session Supabase impossible:', authErr);
        }
      }

      const headers: Record<string, string> = {};
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const apiRes = await safeFetchJson<{ success?: boolean; error?: string }>(
        `/api/carnets/${encodeURIComponent(resolvedCarnetId)}`,
        {
          method: 'DELETE',
          headers,
        }
      );

      if (!apiRes.ok && supabase) {
        const { error: tktErr } = await supabase
          .from('tickets')
          .delete()
          .eq('carnet_id', resolvedCarnetId);
        if (tktErr) {
          console.warn('[PORTUS Store] Avertissement suppression tickets Supabase:', tktErr.message);
        }
        const { error: carnetErr } = await supabase
          .from('carnets')
          .delete()
          .eq('id', resolvedCarnetId);
        if (carnetErr) {
          console.warn('[PORTUS Store] Avertissement suppression carnet Supabase:', carnetErr.message);
        }
      }
    }
  },

  setTicketPrice: (price) => set({ ticketPrice: price }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setPendingSyncCount: (count) => set({ pendingSyncCount: count }),
  setLastSyncedSaleNumber: (num) => set({ lastSyncedSaleNumber: num }),
  setLatestRealtimeIncident: (incident) => set({ latestRealtimeIncident: incident }),
  setIsRealtimeConnected: (connected) => set({ isRealtimeConnected: connected }),
  setIsSimulatedOffline: (offline) => set({ isSimulatedOffline: offline }),
  setIsRlsPermissionIssue: (issue, error = '') =>
    set({ isRlsPermissionIssue: issue, lastRlsError: error }),
}));

// Sélecteurs modulaires à granularité fine (masquant strictement le rôle TRESORIER)
export const useUsers = () =>
  usePortusStore((s) => s.users.filter((u) => (u.role as string) !== 'TRESORIER'));
export const useAvailableAgents = () => usePortusStore((s) => s.indexes.availableAgentsList);
export const useCarnets = () => usePortusStore((s) => s.carnets);
export const useTickets = () => usePortusStore((s) => s.tickets);
export const useSales = () => usePortusStore((s) => s.sales);
export const useRemises = () => usePortusStore((s) => s.remises);
export const useExpenses = () => usePortusStore((s) => s.expenses);
export const useAuditLogs = () => usePortusStore((s) => s.auditLogs);
export const useVehicles = () => usePortusStore((s) => s.vehicles);
export const useIndexes = () => usePortusStore((s) => s.indexes);
