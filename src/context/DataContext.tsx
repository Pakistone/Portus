/**
 * Contexte de Données Métier de PORTUS — U.J.S.R.V.
 * Gère le stockage IndexedDB, les règles métier, les rôles, la synchronisation hors ligne,
 * les contrôles de doublons à 7 jours, les alertes de remise, et l'audit trail complet.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type {
  User,
  Carnet,
  Ticket,
  Sale,
  Control,
  FraudReport,
  FraudProcessingHistoryEntry,
  Remise,
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  AuditLog,
  AuditAction,
  FinancialAlert,
  Role,
  TicketStatus,
  NotificationRecord,
  Vehicle,
  DailyClosing,
  TicketReprint,
} from '../types';
import {
  TICKET_PRICE_FCFA,
  ACTIVE_TICKET_VALIDITY_MS,
  REMISE_ALERT_START_THRESHOLD,
  REMISE_ALERT_STEP,
  CARNET_SIZE_MULTIPLE,
  DEFAULT_SECTORS,
} from '../config/constants';
import { getDB, initializeDatabase } from '../db/indexedDb';
import {
  normalizePlate,
  normalizePhone,
  normalizeName,
  normalizeText,
  formatDateTime,
  formatDate,
  formatFCFA,
  formatPlateDisplay,
} from '../utils/normalization';
import { getCurrentCoordinates } from '../utils/geolocation';
import { generateUUID, generateSecureToken } from '../utils/uuid';
import { useAuth } from './AuthContext';
import { useOnlineStatus } from '../components/pwa/usePWAInstall';
import { SupabaseDataLayer, isRlsPermissionIssueDetected, getLastRlsErrorMessage } from '../db/supabaseService';
import { safeFetchJson } from '../utils/safeApi';
import { playIncidentAlertSound } from '../utils/audioAlert';
import {
  buildTicketQRPayload,
  parseTicketQRPayload,
  verifyTicketSecurityToken,
  assertTicketStatusTransition,
} from '../utils/ticketSecurity';
import { recordTicketReprint as recordTicketReprintDomain } from '../services/ticketService';

export type VerificationStatus =
  | 'VALID'
  | 'INVALID'
  | 'CANCELLED'
  | 'INVALID_UNKNOWN'
  | 'SUSPICIOUS'
  | 'SUPERSEDED'
  | 'NOT_FOUND'
  | 'NOT_SOLD';

export interface VerifyTicketResult {
  status: VerificationStatus;
  bannerTitle: string;
  ticket: Ticket | null;
  agentName: string | null;
  agentPhone: string | null;
  verifiedVia: 'SERVER' | 'LOCAL_CACHE';
  message: string;
  isRepeatedControl: boolean;
  previousControlCount: number;
}

interface DuplicateCheckResult {
  hasActiveTicket: boolean;
  activeTicket: Ticket | null;
  daysRemaining: number;
}

interface DataContextType {
  // Données
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
  sectors: typeof DEFAULT_SECTORS;
  ticketPrice: number;
  updateTicketPrice: (newPrice: number) => Promise<void>;

  // Actions Dépenses
  createExpense: (params: {
    amount: number;
    category: ExpenseCategory;
    description: string;
    expenseDate: string;
    receiptUrl?: string | null;
    offlineId?: string;
  }) => Promise<Expense>;
  validateExpense: (expenseId: string) => Promise<Expense>;
  rejectExpense: (expenseId: string, reason: string) => Promise<Expense>;
  cancelExpense: (expenseId: string, reason: string) => Promise<Expense>;
  correctExpense: (expenseId: string, newAmount: number, reason: string) => Promise<Expense>;

  // Actions Clôture, Véhicules & Réimpressions
  submitDailyClosing: (params: {
    openingBalance: number;
    cashSalesAmount: number;
    digitalSalesAmount: number;
    refundsAmount: number;
    expensesAmount: number;
    expectedBalance: number;
    declaredBalance: number;
    notes?: string;
  }) => Promise<DailyClosing>;
  upsertVehicle: (vehicleData: Partial<Vehicle> & { plateNumber: string }) => Promise<Vehicle>;
  recordTicketReprint: (ticketId: string, reason: string) => Promise<{ reprint: TicketReprint; isSuspicious: boolean }>;

  // Notifications
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllNotificationsAsRead: (recipientId?: string) => Promise<void>;

  // Statuts réseau et synchronisation
  isOnline: boolean;
  isSimulatedOffline: boolean;
  toggleSimulatedOffline: () => void;
  isSyncing: boolean;
  pendingSyncCount: number;
  lastSyncedSaleNumber: string | null;
  syncOfflineQueue: () => Promise<void>;
  syncAllToSupabase: () => Promise<{ success: boolean; message: string; count: number }>;
  isRlsPermissionIssue: boolean;
  lastRlsError: string;

  // Alertes Realtime Sécurité Routière (Contrôleurs & Supervision)
  latestRealtimeIncident: FraudReport | null;
  dismissLatestIncident: () => void;
  isRealtimeConnected: boolean;
  simulateIncidentForTesting: (plateNumber?: string) => Promise<void>;

  // Actions ADMINISTRATEUR
  createUser: (userData: {
    username: string;
    fullName: string;
    role: Role;
    sectorId?: string;
    phone?: string;
    passwordRaw: string;
  }) => Promise<User>;
  updateUser: (
    userId: string,
    updates: {
      fullName?: string;
      phone?: string;
      sectorId?: string;
      role?: Role;
    }
  ) => Promise<User>;
  toggleUserActive: (userId: string) => Promise<void>;
  resetUserPassword: (userId: string, newPasswordRaw: string) => Promise<void>;
  changeOwnPassword: (newPasswordRaw: string) => Promise<void>;
  resetApplicationData: () => Promise<void>;
  createCarnet: (params: {
    seriesPrefix?: string;
    size: number;
    startPhysicalNumber?: number;
    assignedResponsableId?: string;
  }) => Promise<{ carnet: Carnet; tickets: Ticket[] }>;
  assignCarnetToResponsable: (carnetId: string, responsableId: string) => Promise<Carnet>;
  cancelCarnet: (carnetId: string, reason: string) => Promise<Carnet>;
  updateTicketStatus: (ticketId: string, newStatus: TicketStatus, reason?: string) => Promise<Ticket>;
  cancelTicket: (ticketId: string, reason: string) => Promise<void>;
  correctRemiseAdmin: (
    remiseId: string,
    newAmount: number,
    newNote: string,
    reason: string
  ) => Promise<void>;

  // Actions RESPONSABLE & ADMIN
  assignTicketsToAgent: (ticketIds: string[], agentId: string) => Promise<{ count: number; ticketNumbers: string[] }>;
  reassignUnsoldTickets: (ticketIds: string[], newAgentId: string) => Promise<{ count: number; ticketNumbers: string[] }>;
  correctPlateNumber: (ticketId: string, newPlate: string, reason: string) => Promise<void>;
  recordRemise: (params: {
    agentId: string;
    amount: number;
    note?: string;
  }) => Promise<Remise>;

  // Actions AGENT
  checkDuplicatePlate: (plate: string) => DuplicateCheckResult;
  sellTicket: (params: {
    ticketId: string;
    plateNumber: string;
    driverPhone?: string;
    driverName?: string;
    overrideOldTicketId?: string;
  }) => Promise<Sale>;
  getAgentStats: (agentId: string) => {
    assignedCount: number;
    availableCount: number;
    soldCount: number;
    ticketsSold: number;
    totalSalesAmount: number;
    expectedAmount: number;
    remittedAmount: number;
    remainingBalance: number;
    ecart: number;
    unremittedTicketsCount: number;
  };
  getRecentPlates: () => string[];

  // Actions CONTRÔLEUR
  verifyTicket: (identifier: string) => Promise<VerifyTicketResult>;
  searchTicketsByPlate: (plate: string) => Promise<Ticket[]>;
  recordControl: (
    ticketNumberOrParams: string | {
      ticketNumber: string;
      plateNumber: string;
      isValid: boolean;
      message: string;
      resultType?: Control['resultType'];
    },
    plateNumber?: string,
    isValid?: boolean,
    message?: string
  ) => Promise<Control>;
  reportFraud: (report: {
    ticketNumber?: string;
    plateNumber: string;
    type: FraudReport['type'];
    typeLabel: string;
    comment: string;
    photos?: string[];
    photoDataUrl?: string;
    reason?: string;
    reasonLabel?: string;
  }) => Promise<FraudReport>;
  updateFraudReportStatus: (
    fraudId: string,
    newStatus: FraudReport['status'],
    decisionNote: string
  ) => Promise<FraudReport>;

  // Rechargement manuel des données
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const rawIsOnline = useOnlineStatus();
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const isOnline = isSimulatedOffline ? false : rawIsOnline;

  const toggleSimulatedOffline = useCallback(() => {
    setIsSimulatedOffline((prev) => !prev);
  }, []);

  const [users, setUsers] = useState<User[]>([]);
  const [carnets, setCarnets] = useState<Carnet[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [fraudReports, setFraudReports] = useState<FraudReport[]>([]);
  const [remises, setRemises] = useState<Remise[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [alerts, setAlerts] = useState<FinancialAlert[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [dailyClosings, setDailyClosings] = useState<DailyClosing[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [ticketReprints, setTicketReprints] = useState<TicketReprint[]>([]);

  // Alertes Realtime Sécurité Routière
  const [latestRealtimeIncident, setLatestRealtimeIncident] = useState<FraudReport | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const dismissLatestIncident = useCallback(() => {
    setLatestRealtimeIncident(null);
  }, []);

  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncedSaleNumber, setLastSyncedSaleNumber] = useState<string | null>(null);
  const [ticketPrice, setTicketPrice] = useState<number>(TICKET_PRICE_FCFA);
  const [isRlsPermissionIssue, setIsRlsPermissionIssue] = useState(false);
  const [lastRlsError, setLastRlsError] = useState('');

  const updateTicketPrice = useCallback(
    async (newPrice: number) => {
      if (newPrice <= 0) {
        throw new Error('Le prix du ticket doit être strictement supérieur à zéro.');
      }
      const db = await getDB();
      await db.put('settings', newPrice, 'ticket_price');
      setTicketPrice(newPrice);

      await recordAudit(
        'CONFIG_UPDATE',
        'System',
        'ticket-price',
        `Modification du prix unitaire du ticket : ${formatFCFA(newPrice)}`,
        { price: ticketPrice },
        { price: newPrice }
      );
      await refreshData();
    },
    [ticketPrice]
  );

  // Charger toutes les données depuis IndexedDB
  const refreshData = useCallback(async () => {
    try {
      await initializeDatabase();
      const db = await getDB();

      // Synchroniser les données depuis Supabase
      if (SupabaseDataLayer.isAvailable()) {
        try {
          const [
            remoteProfiles,
            remoteCarnets,
            remoteTickets,
            remoteSales,
            remoteRemises,
            remoteExpenses,
            remoteClosings,
            remoteVehicles,
          ] = await Promise.all([
            SupabaseDataLayer.fetchProfiles(),
            SupabaseDataLayer.fetchCarnets(),
            SupabaseDataLayer.fetchTickets(),
            SupabaseDataLayer.fetchSales(),
            SupabaseDataLayer.fetchRemittances(),
            SupabaseDataLayer.fetchExpenses(),
            SupabaseDataLayer.fetchDailyClosings(),
            SupabaseDataLayer.fetchVehicles(),
          ]);

          if (isRlsPermissionIssueDetected()) {
            setIsRlsPermissionIssue(true);
            setLastRlsError(getLastRlsErrorMessage());
          } else {
            setIsRlsPermissionIssue(false);
            setLastRlsError('');
          }
          if (remoteProfiles && remoteProfiles.length > 0) {
            const tx = db.transaction('users', 'readwrite');
            for (const p of remoteProfiles) {
              await tx.store.put(p);
            }
            await tx.done;
          }
          if (remoteCarnets && remoteCarnets.length > 0) {
            // Dé-duplication stricte des carnets distants avant injection
            const uniqueRemoteCarnets: Carnet[] = [];
            const seenCarnetIds = new Set<string>();
            const seenCarnetNums = new Set<string>();
            for (const c of remoteCarnets) {
              if (c && c.id && !seenCarnetIds.has(c.id)) {
                seenCarnetIds.add(c.id);
                let safeNum = c.carnetNumber;
                if (!safeNum) {
                  safeNum = `C-REC-${c.id.slice(0, 6)}`;
                } else if (seenCarnetNums.has(safeNum)) {
                  safeNum = `${safeNum}-${c.id.slice(0, 4)}`;
                }
                seenCarnetNums.add(safeNum);
                uniqueRemoteCarnets.push({
                  ...c,
                  carnetNumber: safeNum,
                });
              }
            }

            const remoteCarnetIds = new Set(uniqueRemoteCarnets.map((c) => c.id));
            const currentLocalCarnets = await db.getAll('carnets');
            const tx = db.transaction('carnets', 'readwrite');
            for (const lc of currentLocalCarnets) {
              if (!remoteCarnetIds.has(lc.id)) {
                await tx.store.delete(lc.id);
              }
            }
            for (const c of uniqueRemoteCarnets) {
              await tx.store.put(c);
            }
            await tx.done;
          }
          if (remoteTickets && remoteTickets.length > 0) {
            const remoteTicketIds = new Set(remoteTickets.map((t) => t.id));
            const currentLocalTickets = await db.getAll('tickets');
            const tx = db.transaction('tickets', 'readwrite');
            for (const lt of currentLocalTickets) {
              if (!remoteTicketIds.has(lt.id)) {
                await tx.store.delete(lt.id);
              }
            }
            for (const t of remoteTickets) {
              await tx.store.put(t);
            }
            await tx.done;
          }

          if (remoteExpenses && remoteExpenses.length > 0) {
            const tx = db.transaction('expenses', 'readwrite');
            for (const exp of remoteExpenses) {
              await tx.store.put(exp);
            }
            await tx.done;
          }

          if (remoteClosings && remoteClosings.length > 0 && db.objectStoreNames.contains('daily_closings')) {
            const tx = db.transaction('daily_closings', 'readwrite');
            for (const cl of remoteClosings) {
              await tx.store.put(cl);
            }
            await tx.done;
          }

          if (remoteVehicles && remoteVehicles.length > 0 && db.objectStoreNames.contains('vehicles')) {
            const tx = db.transaction('vehicles', 'readwrite');
            for (const v of remoteVehicles) {
              await tx.store.put(v);
            }
            await tx.done;
          }

          // Nettoyage de sécurité : retirer tout ticket de test synthétique (f0000000-...)
          // ou ticket anormal (> 3) accidentellement associé au carnet démo initial
          const allLocalTicketsBefore = await db.getAll('tickets');
          const txClean = db.transaction('tickets', 'readwrite');
          for (const lt of allLocalTicketsBefore) {
            if (
              lt.id?.startsWith('f0000000-') ||
              (lt.carnetId === 'c0000000-0000-0000-0000-000000000001' &&
               lt.ticketNumber &&
               !['VRD-000001', 'VRD-000002', 'VRD-000003'].includes(lt.ticketNumber))
            ) {
              await txClean.store.delete(lt.id);
            }
          }
          await txClean.done;

          // Synchronisation automatique des tickets locaux réels vers Supabase
          // (permet de propager immédiatement les carnets créés localement vers l'app publiée)
          const allLocalTktsAfter = await db.getAll('tickets');
          const remoteTicketIds = new Set((remoteTickets || []).map((t) => t.id));
          const unsyncedTkts = allLocalTktsAfter.filter((t) => !remoteTicketIds.has(t.id));
          if (unsyncedTkts.length > 0) {
            const allLocalCarnets = await db.getAll('carnets');
            console.log(`[PORTUS AutoSync] Synchronisation de ${unsyncedTkts.length} tickets locaux vers Supabase...`);
            await SupabaseDataLayer.syncCarnetsBatch(allLocalCarnets, unsyncedTkts).catch((e) =>
              console.warn('[PORTUS AutoSync] Erreur synchro tickets:', e)
            );
          }

          if (remoteSales && remoteSales.length > 0) {
            const tx = db.transaction('sales', 'readwrite');
            for (const s of remoteSales) {
              await tx.store.put(s);
            }
            await tx.done;
          }
          if (remoteRemises && remoteRemises.length > 0) {
            const tx = db.transaction('remises', 'readwrite');
            for (const r of remoteRemises) {
              await tx.store.put(r);
            }
            await tx.done;
          }
        } catch (syncErr) {
          console.warn('[PORTUS DataContext] Erreur synchro distante:', syncErr);
        }
      }

      const [
        allUsers,
        allCarnets,
        allTickets,
        allSales,
        allControls,
        allFrauds,
        allRemises,
        allExpenses,
        allAudits,
      ] = await Promise.all([
        db.getAll('users'),
        db.getAll('carnets'),
        db.getAll('tickets'),
        db.getAll('sales'),
        db.getAll('controls'),
        db.getAll('fraud_reports'),
        db.getAll('remises'),
        db.getAll('expenses'),
        db.getAll('audit_logs'),
      ]);

      // ====================================================================
      // CONTRÔLE D'ACCÈS & ISOLATION STRICTE (HORIZONTALE & VERTICALE)
      // RÈGLE CRITIQUE : NE JAMAIS FAIRE CONFIANCE AU CLIENT
      // - Un agent ne doit jamais lire les ventes d'un autre agent
      // - Un responsable ne doit jamais accéder aux données d'un autre secteur
      // - Les journaux d'audit et la gestion système sont réservés à l'admin
      // ====================================================================
      const activeSessionUserId = sessionStorage.getItem('portus_session_user_id') || sessionStorage.getItem('portus_current_user_id');
      const activeUser = currentUser || allUsers.find((u) => u.id === activeSessionUserId) || null;

      let visibleUsers = allUsers;
      let visibleCarnets = allCarnets;
      let visibleTickets = allTickets;
      let visibleSales = allSales;
      let visibleControls = allControls;
      let visibleFrauds = allFrauds;
      let visibleRemises = allRemises;
      let visibleExpenses = allExpenses;
      let visibleAudits: AuditLog[] = [];

      if (activeUser) {
        if (activeUser.role === 'ADMINISTRATEUR') {
          // Administrateur : vue globale sur l'ensemble de l'organisation
          visibleAudits = allAudits;
        } else if (activeUser.role === 'RESPONSABLE') {
          // Responsable : cloisonnement strict au secteur attribué
          const secId = activeUser.sectorId;
          visibleUsers = allUsers.filter((u) => u.sectorId === secId || u.id === activeUser.id);
          visibleCarnets = allCarnets.filter((c) => c.sectorId === secId || c.assignedToResponsableId === activeUser.id);
          visibleTickets = allTickets.filter((t) => t.sectorId === secId || t.assignedResponsableId === activeUser.id);
          visibleSales = allSales.filter((s) => s.sectorId === secId);
          visibleRemises = allRemises.filter((r) => r.sectorId === secId || r.responsableId === activeUser.id);
          visibleExpenses = allExpenses.filter((e) => e.sectorId === secId || e.responsibleId === activeUser.id || e.createdBy === activeUser.id);
          visibleFrauds = allFrauds.filter((f) => !f.sectorId || f.sectorId === secId);
          visibleControls = allControls.filter((c) => {
            const tkt = allTickets.find((t) => t.id === c.ticketId || t.ticketNumber === c.ticketNumber);
            return !tkt || tkt.sectorId === secId;
          });
          visibleAudits = []; // Strictement réservé à l'administrateur
        } else if (activeUser.role === 'AGENT') {
          // Agent : isolation totale de ses propres ventes, tickets et remises
          visibleUsers = allUsers.filter((u) => u.id === activeUser.id);
          visibleCarnets = []; // Les agents ne manipulent jamais de carnets
          visibleTickets = allTickets.filter((t) => t.assignedAgentId === activeUser.id);
          visibleSales = allSales.filter((s) => s.agentId === activeUser.id); // Ne jamais voir les ventes d'un autre agent !
          visibleRemises = allRemises.filter((r) => r.agentId === activeUser.id);
          visibleExpenses = allExpenses.filter((e) => e.createdBy === activeUser.id);
          visibleFrauds = [];
          visibleControls = allControls.filter((c) => {
            const tkt = allTickets.find((t) => t.id === c.ticketId || t.ticketNumber === c.ticketNumber);
            return tkt && tkt.assignedAgentId === activeUser.id;
          });
          visibleAudits = []; // Aucune visibilité sur l'audit d'entreprise
        } else if (activeUser.role === 'CONTROLEUR') {
          // Contrôleur : uniquement ses vérifications et fraudes signalées
          visibleUsers = allUsers.filter((u) => u.id === activeUser.id);
          visibleCarnets = [];
          visibleTickets = []; // Les contrôles s'effectuent par scan / recherche unitaire sécurisée
          visibleSales = [];
          visibleRemises = [];
          visibleExpenses = [];
          visibleControls = allControls.filter((c) => c.controleurId === activeUser.id);
          visibleFrauds = allFrauds.filter((f) => f.controleurId === activeUser.id);
          visibleAudits = [];
        }
      }

      setUsers(visibleUsers);
      setCarnets(visibleCarnets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setTickets(visibleTickets.sort((a, b) => a.ticketNumber.localeCompare(b.ticketNumber)));
      setSales(visibleSales.sort((a, b) => b.soldAt.localeCompare(a.soldAt)));
      setControls(visibleControls.sort((a, b) => b.controlledAt.localeCompare(a.controlledAt)));
      setFraudReports(visibleFrauds.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)));
      setRemises(visibleRemises.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setExpenses(visibleExpenses.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setAuditLogs(visibleAudits.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));

      let allNotifications: NotificationRecord[] = [];
      if (db.objectStoreNames.contains('notifications')) {
        allNotifications = await db.getAll('notifications');
      }
      setNotifications(allNotifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

      let allClosings: DailyClosing[] = [];
      if (db.objectStoreNames.contains('daily_closings')) {
        allClosings = await db.getAll('daily_closings');
      }
      setDailyClosings(allClosings.sort((a, b) => (b.closingDate || b.date || '').localeCompare(a.closingDate || a.date || '')));

      let allVehicles: Vehicle[] = [];
      if (db.objectStoreNames.contains('vehicles')) {
        allVehicles = await db.getAll('vehicles');
      }
      setVehicles(allVehicles);

      let allReprints: TicketReprint[] = [];
      if (db.objectStoreNames.contains('ticket_reprints')) {
        allReprints = await db.getAll('ticket_reprints');
      }
      setTicketReprints(allReprints);

      // Compter les ventes, contrôles et signalements de fraude en attente de synchro
      const pendingSales = allSales.filter((s) => s.syncStatus === 'PENDING_SYNC');
      const pendingControls = allControls.filter((c) => c.syncStatus === 'PENDING_SYNC');
      const pendingFrauds = allFrauds.filter((f) => f.syncStatus === 'PENDING_SYNC');
      setPendingSyncCount(pendingSales.length + pendingControls.length + pendingFrauds.length);

      if (db.objectStoreNames.contains('settings')) {
        const savedPrice = await db.get('settings', 'ticket_price');
        if (typeof savedPrice === 'number' && savedPrice > 0) {
          setTicketPrice(savedPrice);
        }
      }

      // Calculer les alertes financières par agent
      calculateFinancialAlerts(allUsers, allTickets, allRemises);
    } catch (err) {
      console.error('Erreur chargement données', err);
    }
  }, [currentUser, ticketPrice]);

  // Calcul dynamique des alertes financières (10, 15, 20... tickets sans remise)
  const calculateFinancialAlerts = (
    allUsers: User[],
    allTickets: Ticket[],
    allRemises: Remise[]
  ) => {
    const calculatedAlerts: FinancialAlert[] = [];
    const agents = allUsers.filter((u) => u.role === 'AGENT' && u.isActive);

    agents.forEach((agent) => {
      // Tickets vendus par cet agent
      const agentSoldTickets = allTickets.filter(
        (t) => t.assignedAgentId === agent.id && (t.status === 'SOLD' || t.status === 'CONTROLLED')
      );
      const totalSoldAmount = agentSoldTickets.length * ticketPrice;

      // Montant total remis par cet agent
      const agentRemises = allRemises.filter((r) => r.agentId === agent.id);
      const totalRemittedAmount = agentRemises.reduce((sum, r) => sum + r.amount, 0);

      // Solde restant à verser
      const remainingBalance = Math.max(0, totalSoldAmount - totalRemittedAmount);
      const unremittedTicketsCount = Math.ceil(remainingBalance / ticketPrice);

      // Vérifier les seuils d'alerte (10, 15, 20...)
      if (unremittedTicketsCount >= REMISE_ALERT_START_THRESHOLD) {
        // Trouver le plus haut palier franchi
        const stepsAbove = Math.floor(
          (unremittedTicketsCount - REMISE_ALERT_START_THRESHOLD) / REMISE_ALERT_STEP
        );
        const highestThreshold = REMISE_ALERT_START_THRESHOLD + stepsAbove * REMISE_ALERT_STEP;

        calculatedAlerts.push({
          id: `alert-${agent.id}-${highestThreshold}`,
          agentId: agent.id,
          agentName: agent.fullName,
          sectorId: agent.sectorId,
          sectorName: agent.sectorName,
          unremittedTicketsCount,
          unremittedAmount: remainingBalance,
          thresholdPassed: highestThreshold,
          level: unremittedTicketsCount >= 20 ? 'CRITICAL' : 'WARNING',
          createdAt: new Date().toISOString(),
        });
      }
    });

    setAlerts(calculatedAlerts);
  };

  useEffect(() => {
    refreshData();
  }, [currentUser, refreshData]);

  // Notification obligatoire Responsables et Administrateurs après synchronisation d'une vente
  const notifySaleSynced = useCallback(async (sale: Sale, database: any) => {
    try {
      const allUsers: User[] = await database.getAll('users');
      // Destinataires : Administrateurs et Responsables (secteur ou tous)
      const recipients = allUsers.filter(
        (u) =>
          u.isActive &&
          (u.role === 'ADMINISTRATEUR' ||
            (u.role === 'RESPONSABLE' && (!sale.sectorId || !u.sectorId || u.sectorId === sale.sectorId)))
      );

      const nowIso = new Date().toISOString();
      const notifTitle = `TICKET ${sale.ticketNumber} VENDU`;
      const notifMessage = `Agent : ${sale.agentName} | Immatriculation : ${sale.plateNumber} | Date/heure : ${formatDateTime(sale.soldAt)}`;

      for (const recipient of recipients) {
        const notifId = `notif-sale-${sale.id}-${recipient.id}`;
        const notif: NotificationRecord = {
          id: notifId,
          recipientId: recipient.id,
          senderId: sale.agentId,
          title: notifTitle,
          message: notifMessage,
          level: 'INFO',
          type: 'SALE',
          metadata: {
            saleId: sale.id,
            ticketNumber: sale.ticketNumber,
            agentId: sale.agentId,
            agentName: sale.agentName,
            plateNumber: sale.plateNumber,
            soldAt: sale.soldAt,
            sectorId: sale.sectorId,
          },
          isRead: false,
          createdAt: nowIso,
        };

        if (database.objectStoreNames.contains('notifications')) {
          await database.put('notifications', notif);
        }

        if (SupabaseDataLayer.isAvailable()) {
          SupabaseDataLayer.insertNotification(notif).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Erreur création notification de vente synchronisée:', err);
    }
  }, []);

  // Synchronisation idempotente de la file d'attente hors ligne lors du retour réseau
  const syncOfflineQueue = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);

    try {
      const db = await getDB();
      const allSales = await db.getAll('sales');
      const allControls = await db.getAll('controls');
      const allFrauds = await db.getAll('fraud_reports');
      const pendingSales = allSales.filter((s) => s.syncStatus === 'PENDING_SYNC');
      const pendingControls = allControls.filter((c) => c.syncStatus === 'PENDING_SYNC');
      const pendingFrauds = allFrauds.filter((f) => f.syncStatus === 'PENDING_SYNC');

      if (pendingSales.length === 0 && pendingControls.length === 0 && pendingFrauds.length === 0) {
        setPendingSyncCount(0);
        setIsSyncing(false);
        return;
      }

      const syncTimestamp = new Date().toISOString();
      let lastSyncedNumber = '';

      // 1. Mettre à jour IndexedDB d'abord (transaction rapide sans appels réseau)
      const tx = db.transaction(['sales', 'controls', 'fraud_reports', 'audit_logs'], 'readwrite');
      
      const updatedSales = pendingSales.map(sale => {
        const updated = { ...sale, syncedAt: syncTimestamp, syncStatus: 'SYNCED' as const };
        return updated;
      });
      for (const sale of updatedSales) {
        await tx.objectStore('sales').put(sale);
        lastSyncedNumber = sale.ticketNumber;

        const audit: AuditLog = {
          id: `aud-sync-${sale.id}-${Date.now()}`,
          actorId: sale.agentId,
          actorName: sale.agentName,
          actorRole: 'AGENT',
          action: 'SALE_SYNCED',
          timestamp: syncTimestamp,
          targetEntity: 'Sale',
          targetId: sale.id,
          details: `Synchronisation de la vente hors ligne pour le ticket ${sale.ticketNumber} (Immat: ${sale.plateNumber}). Date originale conservée: ${sale.soldAt}`,
        };
        await tx.objectStore('audit_logs').put(audit);
      }

      const updatedControls = pendingControls.map(ctrl => {
        const updated = { ...ctrl, syncedAt: syncTimestamp, syncStatus: 'SYNCED' as const };
        return updated;
      });
      for (const ctrl of updatedControls) {
        await tx.objectStore('controls').put(ctrl);

        const audit: AuditLog = {
          id: `aud-sync-ctrl-${ctrl.id}-${Date.now()}`,
          actorId: ctrl.controleurId,
          actorName: ctrl.controleurName,
          actorRole: 'CONTROLEUR',
          action: 'CONTROL_SYNCED',
          timestamp: syncTimestamp,
          targetEntity: 'Control',
          targetId: ctrl.id,
          details: `Synchronisation du contrôle routier hors ligne pour le ticket ${ctrl.ticketNumber} (Immat: ${ctrl.plateNumber}).`,
        };
        await tx.objectStore('audit_logs').put(audit);
      }

      const updatedFrauds = pendingFrauds.map(fraud => {
        const updated = { ...fraud, syncedAt: syncTimestamp, syncStatus: 'SYNCED' as const };
        return updated;
      });
      for (const fraud of updatedFrauds) {
        await tx.objectStore('fraud_reports').put(fraud);

        const audit: AuditLog = {
          id: `aud-sync-frd-${fraud.id}-${Date.now()}`,
          actorId: fraud.controleurId,
          actorName: fraud.controleurName,
          actorRole: 'CONTROLEUR',
          action: 'FRAUD_SYNCED',
          timestamp: syncTimestamp,
          targetEntity: 'FraudReport',
          targetId: fraud.id,
          details: `Synchronisation du signalement de fraude pour le véhicule ${fraud.plateNumber} (Type: ${fraud.typeLabel}). ${fraud.photos?.length || 0} photo(s) transmise(s).`,
        };
        await tx.objectStore('audit_logs').put(audit);
      }

      await tx.done;

      // 2. Effectuer les appels réseau Supabase en dehors de toute transaction IndexedDB
      if (SupabaseDataLayer.isAvailable()) {
        for (const sale of updatedSales) {
          try {
            await SupabaseDataLayer.insertSaleIdempotent(sale);
            await SupabaseDataLayer.pushToSyncQueue({
              clientMutationId: sale.id,
              agentId: sale.agentId,
              entityType: 'SALE',
              operation: 'INSERT',
              payload: sale as any,
              clientTimestamp: sale.soldAt,
            });
          } catch (syncErr) {
            console.warn('Erreur réplication Supabase vente:', syncErr);
          }
        }

        for (const ctrl of updatedControls) {
          try {
            await SupabaseDataLayer.insertControl(ctrl);
          } catch (ctrlErr) {
            console.warn('Erreur réplication Supabase contrôle:', ctrlErr);
          }
        }

        for (const fraud of updatedFrauds) {
          try {
            await SupabaseDataLayer.insertFraudReport(fraud);
            await SupabaseDataLayer.pushToSyncQueue({
              clientMutationId: fraud.id,
              agentId: fraud.controleurId,
              entityType: 'FRAUD_REPORT',
              operation: 'INSERT',
              payload: fraud as any,
              clientTimestamp: fraud.reportedAt,
            });
          } catch (frdErr) {
            console.warn('Erreur réplication Supabase fraude:', frdErr);
          }
        }
      }

      // Déclencher les notifications obligatoires après synchronisation réussie
      for (const sale of updatedSales) {
        await notifySaleSynced(sale, db);
      }

      setLastSyncedSaleNumber(lastSyncedNumber);
      await refreshData();

      // Effacer le message vert après 5 secondes
      setTimeout(() => {
        setLastSyncedSaleNumber(null);
      }, 5000);
    } catch (err) {
      console.error('Erreur lors de la synchronisation', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, refreshData, notifySaleSynced]);

  // Synchronisation automatique lors de la reconnexion
  useEffect(() => {
    if (isOnline && pendingSyncCount > 0 && !isSyncing) {
      syncOfflineQueue();
    }
  }, [isOnline, pendingSyncCount, isSyncing, syncOfflineQueue]);

  // Synchronisation globale locale -> Supabase (Utile pour amorçage ou restauration)
  const syncAllToSupabase = useCallback(async (): Promise<{ success: boolean; message: string; count: number }> => {
    if (!SupabaseDataLayer.isAvailable()) {
      return {
        success: false,
        message: 'Supabase n’est pas configuré. Veuillez renseigner l’URL et la clé ANON.',
        count: 0,
      };
    }

    try {
      const db = await getDB();
      const [allUsers, allCarnets, allTickets, allSales, allRemises] = await Promise.all([
        db.getAll('users'),
        db.getAll('carnets'),
        db.getAll('tickets'),
        db.getAll('sales'),
        db.getAll('remises'),
      ]);

      let syncedCount = 0;

      // 1. Profiles
      for (const u of allUsers) {
        await SupabaseDataLayer.upsertProfile(u);
        syncedCount++;
      }

      // 2. Carnets et Tickets vers Supabase Cloud
      if (allCarnets.length > 0 || allTickets.length > 0) {
        const carnetRes = await SupabaseDataLayer.syncCarnetsBatch(allCarnets, allTickets);
        syncedCount += (carnetRes.syncedCarnets + carnetRes.syncedTickets);
      }

      // 4. Ventes (Idempotentes)
      for (const s of allSales) {
        await SupabaseDataLayer.insertSaleIdempotent(s);
        syncedCount++;
      }

      // 5. Remises
      for (const r of allRemises) {
        await SupabaseDataLayer.insertRemittance(r);
        syncedCount++;
      }

      return {
        success: true,
        message: `Synchronisation complète réussie ! ${syncedCount} enregistrements répliqués dans Supabase PostgreSQL.`,
        count: syncedCount,
      };
    } catch (err: any) {
      console.error('Erreur synchronisation globale Supabase:', err);
      return {
        success: false,
        message: `Erreur lors de la synchronisation vers Supabase: ${err.message || 'Erreur inconnue'}`,
        count: 0,
      };
    }
  }, []);

  // Auto-sync quand le réseau revient
  useEffect(() => {
    if (isOnline) {
      syncOfflineQueue();
    }
  }, [isOnline, syncOfflineQueue]);

  // =========================================================================
  // ABONNEMENT SUPABASE REALTIME : INCIDENTS DE SÉCURITÉ ROUTIÈRE EN DIRECT
  // Notifie instantanément les Contrôleurs lors d'un nouveau signalement
  // =========================================================================
  useEffect(() => {
    if (!currentUser || !isOnline || !SupabaseDataLayer.isAvailable()) {
      setIsRealtimeConnected(false);
      return;
    }

    setIsRealtimeConnected(true);

    const unsubscribe = SupabaseDataLayer.subscribeToRoadSafetyIncidents(async (incident) => {
      console.log('[PORTUS Realtime] Réception d’un incident de sécurité en direct:', incident);

      try {
        const db = await getDB();

        // 1. Idempotence : Ne pas dupliquer si déjà présent
        const existing = await db.get('fraud_reports', incident.id);
        if (existing) {
          return;
        }

        // 2. Sauvegarde immédiate dans IndexedDB
        await db.put('fraud_reports', incident);

        // 3. Mise à jour de l'état réactif
        setFraudReports((prev) => {
          if (prev.some((f) => f.id === incident.id)) return prev;
          return [incident, ...prev];
        });

        // 4. Création de notification prioritaire pour le Contrôleur / Responsable / Admin
        const notifId = `notif-inc-${incident.id}-${Date.now()}`;
        const newNotif: NotificationRecord = {
          id: notifId,
          recipientId: currentUser.id,
          title: `🚨 ALERTE INCIDENT : ${formatPlateDisplay(incident.plateNumber)}`,
          message: `Type: ${incident.typeLabel || incident.reason || 'Incident'} | Agent: ${incident.controleurName || 'Équipe Contrôle'}.${incident.comment ? ` Note: "${incident.comment}"` : ''}`,
          level: 'CRITICAL',
          type: 'FRAUD_ALERT',
          metadata: {
            incidentId: incident.id,
            plateNumber: incident.plateNumber,
            ticketNumber: incident.ticketNumber,
            gpsLatitude: incident.gpsLatitude,
            gpsLongitude: incident.gpsLongitude,
          },
          createdAt: new Date().toISOString(),
          isRead: false,
        };

        if (db.objectStoreNames.contains('notifications')) {
          await db.put('notifications', newNotif);
        }

        setNotifications((prev) => [newNotif, ...prev]);

        // 5. Déclenchement de l'alerte sonore et haptique
        playIncidentAlertSound();

        // 6. Affichage du bandeau d'alerte en direct
        setLatestRealtimeIncident(incident);

        // 7. Émission d'événements système pour notification globale et vibration
        window.dispatchEvent(new CustomEvent('portus-road-safety-alert', { detail: incident }));
        window.dispatchEvent(new CustomEvent('portus-notification-received', { detail: newNotif }));
      } catch (err) {
        console.warn('[PORTUS Realtime] Erreur traitement incident:', err);
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      setIsRealtimeConnected(false);
    };
  }, [currentUser, isOnline]);

  const simulateIncidentForTesting = useCallback(
    async (plateNumber = '1234HZ01') => {
      const now = new Date();
      const testIncident: FraudReport = {
        id: `frd-test-${Date.now()}`,
        ticketNumber: 'VRD-TEST-99',
        plateNumber,
        controleurId: currentUser?.id || 'ctrl-sim',
        controleurName: currentUser?.fullName || 'Contrôle Corridor Vridi',
        type: 'TICKET_FALSIFIE',
        typeLabel: 'Ticket Falsifié / Contrefait',
        comment: 'Véhicule suspect détecté au poste de contrôle Vridi Terminal (Test Realtime)',
        photos: [],
        reportedAt: now.toISOString(),
        reportedDate: now.toISOString().slice(0, 10),
        reportedTime: now.toLocaleTimeString('fr-FR', { hour12: false }),
        gpsLatitude: 5.2647,
        gpsLongitude: -4.0089,
        status: 'NOUVEAU',
        syncStatus: 'SYNCED',
        syncedAt: now.toISOString(),
      };

      // Déclencher instantanément l'alerte sonore et le bandeau d'alerte visuel en local
      playIncidentAlertSound();
      setLatestRealtimeIncident(testIncident);
      window.dispatchEvent(new CustomEvent('portus-road-safety-alert', { detail: testIncident }));

      if (SupabaseDataLayer.isAvailable()) {
        await SupabaseDataLayer.broadcastIncident(testIncident);
        await SupabaseDataLayer.insertFraudReport(testIncident);
      }
    },
    [currentUser]
  );

  // Helper pour journaliser l'audit
  const recordAudit = async (
    action: AuditLog['action'],
    targetEntity: string,
    targetId: string,
    details?: string,
    oldValue?: any,
    newValue?: any
  ) => {
    try {
      const db = await getDB();
      const log: AuditLog = {
        id: generateSecureToken('aud', 12),
        actorId: currentUser?.id || 'system',
        actorName: currentUser?.fullName || 'SYSTÈME',
        actorRole: currentUser?.role || 'ADMINISTRATEUR',
        action,
        timestamp: new Date().toISOString(),
        targetEntity,
        targetId,
        oldValue,
        newValue,
        details,
      };
      await db.put('audit_logs', log);
      setAuditLogs((prev) => [log, ...prev]);

      // Enregistrer dans Supabase si connecté (Append-only)
      if (SupabaseDataLayer.isAvailable()) {
        SupabaseDataLayer.insertAuditLog(log).catch((e) => console.warn('Supabase audit sync warning:', e));
      }
    } catch (err) {
      console.error('Erreur écriture audit log', err);
    }
  };

  // ----------------------------------------------------
  // ACTIONS ADMINISTRATEUR
  // ----------------------------------------------------
  const createUser = async (userData: {
    username: string;
    fullName: string;
    role: Role;
    sectorId?: string;
    phone?: string;
    passwordRaw: string;
  }): Promise<User> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à créer un compte.');
    }

    const db = await getDB();
    const cleanUsername = userData.username.trim().toLowerCase();
    const normalizedFullName = normalizeName(userData.fullName);
    const normalizedPhone = normalizePhone(userData.phone || '');

    // Vérifier si l'utilisateur existe déjà
    const existing = await db.getFromIndex('users', 'by-username', cleanUsername);
    if (existing) {
      throw new Error(`Le nom d'utilisateur "${cleanUsername}" est déjà utilisé.`);
    }

    let newUser: User;

    if (SupabaseDataLayer.isAvailable()) {
      // Création officielle dans Supabase Auth + public.profiles
      newUser = await SupabaseDataLayer.createAdminUser({
        username: cleanUsername,
        fullName: normalizedFullName,
        role: userData.role,
        sectorId: (userData.role === 'AGENT' || userData.role === 'RESPONSABLE') ? userData.sectorId : undefined,
        phone: normalizedPhone,
        passwordRaw: userData.passwordRaw,
      });
      await db.put('users', newUser);
    } else {
      const sector = DEFAULT_SECTORS.find((s) => s.id === userData.sectorId);
      newUser = {
        id: `usr-${Date.now()}`,
        username: cleanUsername,
        fullName: normalizedFullName,
        role: userData.role,
        sectorId: (userData.role === 'AGENT' || userData.role === 'RESPONSABLE') ? userData.sectorId : undefined,
        sectorName: (userData.role === 'AGENT' || userData.role === 'RESPONSABLE') ? sector?.name : undefined,
        phone: normalizedPhone,
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.put('users', newUser);
    }

    await recordAudit(
      'USER_CREATED',
      'User',
      newUser.id,
      `Création du compte "${newUser.username}" avec le rôle ${newUser.role}`
    );

    await refreshData();
    return newUser;
  };

  const updateUser = async (
    userId: string,
    updates: {
      fullName?: string;
      phone?: string;
      sectorId?: string;
      role?: Role;
    }
  ): Promise<User> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à modifier les informations des comptes.');
    }

    const db = await getDB();
    const user = await db.get('users', userId);
    if (!user) throw new Error('Utilisateur introuvable');

    const oldValues = {
      fullName: user.fullName,
      phone: user.phone,
      sectorId: user.sectorId,
      role: user.role,
    };

    if (updates.fullName !== undefined) {
      user.fullName = normalizeName(updates.fullName);
    }
    if (updates.phone !== undefined) {
      user.phone = normalizePhone(updates.phone);
    }
    if (updates.role !== undefined) {
      user.role = updates.role;
    }
    if (updates.sectorId !== undefined) {
      user.sectorId = updates.sectorId;
      const sector = DEFAULT_SECTORS.find((s) => s.id === updates.sectorId);
      user.sectorName = sector?.name;
    }

    user.updatedAt = new Date().toISOString();
    await db.put('users', user);

    if (SupabaseDataLayer.isAvailable()) {
      try {
        const remoteUpdated = await SupabaseDataLayer.updateAdminUser(user.id, {
          username: user.username,
          fullName: user.fullName,
          phone: user.phone,
          sectorId: user.sectorId,
          role: user.role,
        });
        if (remoteUpdated) {
          user.role = remoteUpdated.role;
          user.fullName = remoteUpdated.fullName;
          user.phone = remoteUpdated.phone;
          user.sectorId = remoteUpdated.sectorId;
          user.sectorName = remoteUpdated.sectorName;
          await db.put('users', user);
        }
      } catch (e) {
        console.warn('[PORTUS DataContext] Supabase updateAdminUser warning:', e);
      }
    }

    await recordAudit(
      'USER_UPDATED',
      'User',
      user.id,
      `Mise à jour des informations pour ${user.fullName} (${user.username})`,
      oldValues,
      updates
    );

    await refreshData();
    return user;
  };

  const toggleUserActive = async (userId: string): Promise<void> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à modifier le statut d’un compte.');
    }

    const db = await getDB();
    const user = await db.get('users', userId);
    if (!user) throw new Error('Utilisateur introuvable');

    const previousStatus = user.isActive;
    const willBeActive = !previousStatus;

    if (!willBeActive) {
      // ----------------------------------------------------
      // DÉSACTIVATION : APPLICATION DES RÈGLES MÉTIER CRITIQUES
      // ----------------------------------------------------

      // RÈGLE 1 : Lorsqu'un AGENT est désactivé :
      // - ses tickets non vendus retournent automatiquement à son responsable
      // - ses ventes historiques restent liées à cet agent
      // - ses données d'audit restent conservées
      if (user.role === 'AGENT') {
        const allTickets = await db.getAll('tickets');
        const agentUnsoldTickets = allTickets.filter(
          (t) =>
            t.assignedAgentId === user.id &&
            t.status !== 'SOLD' &&
            t.status !== 'CONTROLLED' &&
            t.status !== 'CANCELLED'
        );

        // Trouver le responsable auquel retourner les tickets
        const allUsers = await db.getAll('users');
        let destinationResp = allUsers.find(
          (u) => u.role === 'RESPONSABLE' && u.isActive && (u.sectorId === user.sectorId || !user.sectorId)
        );
        if (!destinationResp) {
          destinationResp = allUsers.find((u) => u.role === 'RESPONSABLE' && u.isActive);
        }
        if (!destinationResp) {
          destinationResp = allUsers.find((u) => u.role === 'ADMINISTRATEUR' && u.isActive) || (currentUser ?? undefined);
        }

        for (const tkt of agentUnsoldTickets) {
          const respId = tkt.assignedResponsableId || destinationResp?.id || 'usr-resp-01';
          const respName = tkt.assignedResponsableName || destinationResp?.fullName || 'RESPONSABLE';

          tkt.status = 'ASSIGNED_TO_RESPONSIBLE';
          tkt.assignedResponsableId = respId;
          tkt.assignedResponsableName = respName;
          tkt.assignedAgentId = undefined;
          tkt.assignedAgentName = undefined;

          await db.put('tickets', tkt);

          if (db.objectStoreNames.contains('ticket_assignments')) {
            await db.put('ticket_assignments', {
              id: generateSecureToken('asg', 12),
              ticketId: tkt.id,
              carnetId: tkt.carnetId,
              fromProfileId: user.id,
              toProfileId: respId,
              assignedBy: currentUser?.id || 'admin',
              assignmentType: 'RETURN',
              notes: `Retour automatique au responsable suite à la désactivation de l'agent ${user.fullName}`,
              assignedAt: new Date().toISOString(),
            });
          }

          if (SupabaseDataLayer.isAvailable()) {
            SupabaseDataLayer.updateTicketStatus({
              ticketId: tkt.id,
              status: 'ASSIGNED_TO_RESPONSIBLE',
              assignedResponsableId: respId,
              assignedAgentId: null,
            }).catch(() => {});
          }
        }

        await recordAudit(
          'USER_DEACTIVATED',
          'User',
          user.id,
          `Désactivation de l’agent ${user.fullName}. ${agentUnsoldTickets.length} ticket(s) non vendu(s) retourné(s) au responsable. Ventes historiques et audit préservés.`,
          { isActive: true, unsoldTicketsReturned: agentUnsoldTickets.length },
          { isActive: false }
        );
      }

      // RÈGLE 2 : Lorsqu'un RESPONSABLE est désactivé :
      // - ses tickets non vendus sont transférés automatiquement à l'administrateur
      // - l'historique reste conservé
      else if (user.role === 'RESPONSABLE') {
        const allUsers = await db.getAll('users');
        const adminUser =
          allUsers.find((u) => u.role === 'ADMINISTRATEUR' && u.isActive) ||
          currentUser || { id: 'usr-admin-01', fullName: 'YAO KOFFI ALEXIS' };

        const allTickets = await db.getAll('tickets');
        const respUnsoldTickets = allTickets.filter(
          (t) => t.assignedResponsableId === user.id && t.status !== 'SOLD' && t.status !== 'CANCELLED'
        );

        for (const tkt of respUnsoldTickets) {
          tkt.assignedResponsableId = adminUser.id;
          tkt.assignedResponsableName = adminUser.fullName;
          // S'il était sous la garde directe du responsable, il redevient stock central
          if (tkt.status === 'ASSIGNED_TO_RESPONSIBLE') {
            tkt.status = 'AVAILABLE';
          }
          await db.put('tickets', tkt);

          if (db.objectStoreNames.contains('ticket_assignments')) {
            await db.put('ticket_assignments', {
              id: generateSecureToken('asg', 12),
              ticketId: tkt.id,
              carnetId: tkt.carnetId,
              fromProfileId: user.id,
              toProfileId: adminUser.id,
              assignedBy: currentUser?.id || adminUser.id,
              assignmentType: 'RETURN',
              notes: `Transfert automatique à l'administrateur suite à la désactivation du responsable ${user.fullName}`,
              assignedAt: new Date().toISOString(),
            });
          }

          if (SupabaseDataLayer.isAvailable()) {
            SupabaseDataLayer.updateTicketStatus({
              ticketId: tkt.id,
              status: tkt.status,
              assignedResponsableId: adminUser.id,
            }).catch(() => {});
          }
        }

        // Transférer également les carnets attribués à ce responsable vers l'administrateur
        const allCarnets = await db.getAll('carnets');
        const respCarnets = allCarnets.filter((c) => c.assignedToResponsableId === user.id);
        for (const carnet of respCarnets) {
          carnet.assignedToResponsableId = adminUser.id;
          carnet.assignedToResponsableName = adminUser.fullName;
          await db.put('carnets', carnet);
        }

        await recordAudit(
          'USER_DEACTIVATED',
          'User',
          user.id,
          `Désactivation du responsable ${user.fullName}. ${respUnsoldTickets.length} ticket(s) non vendu(s) et ${respCarnets.length} carnet(s) transféré(s) à l’administrateur. Historique conservé.`,
          { isActive: true, unsoldTicketsTransferred: respUnsoldTickets.length },
          { isActive: false }
        );
      } else {
        // Autre rôle (ADMINISTRATEUR, CONTRÔLEUR)
        await recordAudit(
          'USER_DEACTIVATED',
          'User',
          user.id,
          `Désactivation du compte pour ${user.fullName} (${user.role}). Historique conservé.`,
          { isActive: true },
          { isActive: false }
        );
      }

      user.isActive = false;
    } else {
      // ----------------------------------------------------
      // RÉACTIVATION DU COMPTE
      // ----------------------------------------------------
      user.isActive = true;
      user.failedAttempts = 0;
      user.lockedUntil = null;

      await recordAudit(
        'USER_ACTIVATED',
        'User',
        user.id,
        `Réactivation du compte pour ${user.fullName} (${user.role})`,
        { isActive: false },
        { isActive: true }
      );
    }

    user.updatedAt = new Date().toISOString();
    await db.put('users', user);

    if (SupabaseDataLayer.isAvailable()) {
      try {
        await SupabaseDataLayer.updateAdminUser(user.id, {
          username: user.username,
          isActive: willBeActive,
        });
      } catch (e) {
        console.warn('[PORTUS DataContext] Supabase toggle active warning:', e);
      }
    }

    await refreshData();
  };

  const resetUserPassword = async (userId: string, newPasswordRaw: string): Promise<void> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à réinitialiser le mot de passe.');
    }

    const db = await getDB();
    const user = await db.get('users', userId);
    if (!user) throw new Error('Utilisateur introuvable');

    // Débloquer également en cas de tentatives précédentes ou verrouillage 15 min
    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.updatedAt = new Date().toISOString();
    await db.put('users', user);

    if (SupabaseDataLayer.isAvailable()) {
      await SupabaseDataLayer.resetAdminUserPassword(userId, newPasswordRaw);
    }

    await recordAudit(
      'PASSWORD_RESET',
      'User',
      user.id,
      `Réinitialisation du mot de passe pour ${user.fullName} (${user.username})`
    );

    await refreshData();
  };

  const changeOwnPassword = async (newPasswordRaw: string): Promise<void> => {
    if (!currentUser) {
      throw new Error('Vous devez être connecté pour changer votre mot de passe.');
    }

    const db = await getDB();
    const user = await db.get('users', currentUser.id);
    if (!user) throw new Error('Utilisateur introuvable');

    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.updatedAt = new Date().toISOString();
    await db.put('users', user);

    if (SupabaseDataLayer.isAvailable()) {
      await SupabaseDataLayer.resetAdminUserPassword(currentUser.id, newPasswordRaw);
    }

    await recordAudit(
      'PASSWORD_CHANGED',
      'User',
      user.id,
      `Changement de mot de passe par l'utilisateur lui-même : ${user.fullName} (${user.username})`
    );

    await refreshData();
  };

  const resetApplicationData = async (): Promise<void> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à réinitialiser l’application.');
    }

    const db = await getDB();
    
    const stores = [
      'carnets',
      'tickets',
      'sales',
      'controls',
      'fraud_reports',
      'remises',
      'expenses',
      'audit_logs',
      'ticket_assignments',
      'notifications',
      'login_attempts',
    ];
    
    const tx = db.transaction(stores as any, 'readwrite');
    for (const store of stores) {
      if (db.objectStoreNames.contains(store as any)) {
        await tx.objectStore(store as any).clear();
      }
    }
    await tx.done;

    await db.put('settings', false, 'is_initialized');

    if (SupabaseDataLayer.isAvailable()) {
      try {
        const supabase = (await import('../db/supabaseClient')).getSupabase();
        if (supabase) {
          await supabase.from('controls').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('fraud_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('remittance_adjustments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('ticket_assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('carnets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('login_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }
      } catch (err) {
        console.warn('Erreur lors de la purge distante Supabase (Triggers ou RLS) :', err);
      }
    }

    await recordAudit(
      'DATABASE_RESET',
      'System',
      'all',
      `Réinitialisation complète de l'application et de la base de données par l'administrateur.`
    );
  };

  const createCarnet = async (params: {
    seriesPrefix?: string;
    size: number;
    startPhysicalNumber?: number;
    assignedResponsableId?: string;
  }): Promise<{ carnet: Carnet; tickets: Ticket[] }> => {
    // 1. RÈGLE MÉTIER : Seul ADMINISTRATEUR peut générer un carnet
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à générer un carnet.');
    }

    // 2. RÈGLE MÉTIER : Le nombre doit obligatoirement être un multiple de 3 :
    // 3, 6, 9, 12, 15... jusqu'à 150, 153, etc. Refuser toute autre valeur.
    if (!params.size || params.size <= 0 || params.size % CARNET_SIZE_MULTIPLE !== 0) {
      throw new Error(
        `Le nombre de tickets doit obligatoirement être un multiple de 3 (ex: 3, 6, 9, 12, 15... 150, 153). Valeur reçue: ${params.size}. Toute autre valeur est refusée.`
      );
    }

    const db = await getDB();
    const cleanPrefix = normalizeText(params.seriesPrefix || '') || 'VRD';

    // Référence unique du carnet : C-YYYY-XXX (Exemple explicite utilisateur: C-2026-001)
    const allCarnets = await db.getAll('carnets');
    const currentYear = new Date().getFullYear();
    let maxIdx = 0;
    const pattern = new RegExp(`^C-${currentYear}-(\\d+)$`);
    for (const c of allCarnets) {
      if (c.carnetNumber) {
        const match = c.carnetNumber.match(pattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxIdx) maxIdx = num;
        }
      }
    }
    let carnetIndex = Math.max(maxIdx + 1, allCarnets.length + 1);
    let carnetNumber = `C-${currentYear}-${String(carnetIndex).padStart(3, '0')}`;
    const existingCarnetNumbers = new Set(allCarnets.map((c) => c.carnetNumber));
    while (existingCarnetNumbers.has(carnetNumber)) {
      carnetIndex++;
      carnetNumber = `C-${currentYear}-${String(carnetIndex).padStart(3, '0')}`;
    }
    
    // Identifiant UUID du carnet (cryptographiquement sécurisé)
    const carnetId = generateUUID();

    let responsableName: string | undefined = undefined;
    let sectorId: string | undefined = undefined;
    let sectorName: string | undefined = undefined;

    if (params.assignedResponsableId) {
      const resp = await db.get('users', params.assignedResponsableId);
      if (resp) {
        responsableName = resp.fullName;
        sectorId = resp.sectorId;
        sectorName = resp.sectorName;
      }
    }

    // Règle de numérotation physique :
    // "Chaque ticket possède : UUID interne unique, numéro physique du ticket, identifiant du carnet, QR Code unique.
    // Une même numérotation physique peut exister dans plusieurs générations différentes, mais jamais deux fois dans le même carnet."
    const startNum = params.startPhysicalNumber && params.startPhysicalNumber > 0 ? params.startPhysicalNumber : 1;
    const endNum = startNum + params.size - 1;

    const carnetStatus = params.assignedResponsableId ? 'ASSIGNED_TO_RESPONSIBLE' : 'GENERATED';

    const now = new Date();
    const nowIso = now.toISOString();

    const carnet: Carnet = {
      id: carnetId,
      carnetNumber,
      seriesPrefix: cleanPrefix,
      size: params.size,
      startNumber: startNum,
      endNumber: endNum,
      createdById: currentUser?.id || 'admin',
      createdByName: currentUser?.fullName || 'ADMINISTRATEUR',
      assignedToResponsableId: params.assignedResponsableId,
      assignedToResponsableName: responsableName,
      assignedAt: params.assignedResponsableId ? nowIso : undefined,
      assignedById: params.assignedResponsableId ? (currentUser?.id || 'admin') : undefined,
      assignedByName: params.assignedResponsableId ? (currentUser?.fullName || 'ADMINISTRATEUR') : undefined,
      sectorId,
      sectorName,
      createdAt: nowIso,
      status: carnetStatus,
    };

    await db.put('carnets', carnet);

    // Génération des tickets
    const tx = db.transaction('tickets', 'readwrite');
    const createdTickets: Ticket[] = [];

    for (let i = startNum; i <= endNum; i++) {
      // UUID interne unique cryptographiquement sécurisé
      const ticketId = generateUUID();

      // Numéro physique clairement visible (ex: VRD-000001 ou VRD-001)
      const ticketPhysicalNumber = `${cleanPrefix}-${String(i).padStart(6, '0')}`;

      // QR Code unique avec payload sécurisé (tid, cid, ref, num, token cryptographique, signature)
      const qrPayload = buildTicketQRPayload({
        ticketId,
        carnetId,
        carnetNumber,
        ticketNumber: ticketPhysicalNumber,
      });

      const ticketStatus = params.assignedResponsableId ? 'ASSIGNED_TO_RESPONSIBLE' : 'GENERATED';

      const tkt: Ticket = {
        id: ticketId,
        ticketNumber: ticketPhysicalNumber,
        carnetId,
        carnetNumber,
        qrPayload,
        status: ticketStatus,
        price: ticketPrice,
        assignedResponsableId: params.assignedResponsableId,
        assignedResponsableName: responsableName,
        sectorId,
        sectorName,
        controlCount: 0,
        createdAt: nowIso,
      };

      await tx.store.put(tkt);
      createdTickets.push(tkt);
    }
    await tx.done;

    // Si attribué immédiatement au responsable, enregistrer dans l'historique d'attribution
    if (params.assignedResponsableId && responsableName) {
      if (db.objectStoreNames.contains('ticket_assignments')) {
        await db.put('ticket_assignments', {
          id: `asg-carnet-${carnetId}-${Date.now()}`,
          ticketId: carnetId,
          carnetId: carnetId,
          fromProfileId: currentUser?.id || 'admin',
          toProfileId: params.assignedResponsableId,
          assignedBy: currentUser?.id || 'admin',
          assignmentType: 'RESPONSABLE_ASSIGNMENT',
          notes: `Attribution automatique du carnet ${carnetNumber} (${params.size} tickets) au responsable ${responsableName}`,
          assignedAt: nowIso,
        });
      }
    }

    // Journal d'audit
    await recordAudit(
      'CARNET_GENERATED',
      'Carnet',
      carnetId,
      `Génération du carnet ${carnetNumber} (${params.size} tickets de ${cleanPrefix}-${String(startNum).padStart(6, '0')} à ${cleanPrefix}-${String(endNum).padStart(6, '0')})${responsableName ? ` - Attribué au responsable ${responsableName}` : ''}`
    );

    if (params.assignedResponsableId && responsableName) {
      await recordAudit(
        'CARNET_ASSIGNED_RESPONSABLE',
        'Carnet',
        carnetId,
        `Attribution du carnet ${carnetNumber} (${params.size} tickets) au responsable ${responsableName} par ${currentUser?.fullName || 'ADMINISTRATEUR'} le ${nowIso.slice(0, 10)} à ${now.toTimeString().slice(0, 8)}.`
      );
    }

    // Réplication autoritaire Supabase Cloud
    if (SupabaseDataLayer.isAvailable()) {
      await SupabaseDataLayer.insertCarnet(carnet, createdTickets).catch((err) => {
        console.warn('Erreur insertion carnet Supabase:', err);
      });
    }

    await refreshData();
    return { carnet, tickets: createdTickets };
  };

  /**
   * ATTRIBUTION D'UN CARNET À UN RESPONSABLE
   * Enregistre automatiquement : carnet, responsable, administrateur, date, heure
   * Aucun bouton de confirmation de réception nécessaire.
   */
  const assignCarnetToResponsable = async (
    carnetId: string,
    responsableId: string
  ): Promise<Carnet> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à attribuer un carnet.');
    }

    const db = await getDB();
    const carnet = await db.get('carnets', carnetId);
    if (!carnet) throw new Error('Carnet introuvable.');

    const responsable = await db.get('users', responsableId);
    if (!responsable) throw new Error('Responsable introuvable.');
    if (responsable.role !== 'RESPONSABLE') {
      throw new Error('L’utilisateur sélectionné doit posséder le rôle RESPONSABLE.');
    }
    if (!responsable.isActive) {
      throw new Error(`Le responsable ${responsable.fullName} est actuellement désactivé.`);
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8);
    const nowIso = now.toISOString();

    carnet.assignedToResponsableId = responsable.id;
    carnet.assignedToResponsableName = responsable.fullName;
    carnet.assignedAt = nowIso;
    carnet.assignedById = currentUser?.id || 'admin';
    carnet.assignedByName = currentUser?.fullName || 'ADMINISTRATEUR';
    carnet.sectorId = responsable.sectorId;
    carnet.sectorName = responsable.sectorName;
    carnet.status = 'ASSIGNED_TO_RESPONSIBLE';
    await db.put('carnets', carnet);

    // Mettre à jour tous les tickets non vendus de ce carnet
    const allTickets = await db.getAll('tickets');
    const carnetTickets = allTickets.filter((t) => t.carnetId === carnet.id);

    const tx = db.transaction('tickets', 'readwrite');
    let updatedCount = 0;
    for (const t of carnetTickets) {
      // Uniquement les tickets vierges ou disponibles (ne pas altérer ceux déjà vendus)
      if (t.status === 'GENERATED' || t.status === 'AVAILABLE') {
        t.status = 'ASSIGNED_TO_RESPONSIBLE';
        t.assignedResponsableId = responsable.id;
        t.assignedResponsableName = responsable.fullName;
        t.sectorId = responsable.sectorId;
        t.sectorName = responsable.sectorName;
        await tx.store.put(t);
        updatedCount++;
      }
    }
    await tx.done;

    // Enregistrer l'attribution dans ticket_assignments
    if (db.objectStoreNames.contains('ticket_assignments')) {
      await db.put('ticket_assignments', {
        id: `asg-${carnet.id}-${Date.now()}`,
        ticketId: carnet.id,
        carnetId: carnet.id,
        fromProfileId: currentUser?.id || 'admin',
        toProfileId: responsable.id,
        assignedBy: currentUser?.id || 'admin',
        assignmentType: 'RESPONSABLE_ASSIGNMENT',
        notes: `Attribution du carnet ${carnet.carnetNumber} (${carnet.size} tickets) au responsable ${responsable.fullName}`,
        assignedAt: nowIso,
      });
    }

    // Enregistrer automatiquement l'audit obligatoire :
    // carnet, responsable, administrateur, date, heure
    await recordAudit(
      'CARNET_ASSIGNED_RESPONSABLE',
      'Carnet',
      carnet.id,
      `Attribution du carnet ${carnet.carnetNumber} (${carnet.size} tickets, dont ${updatedCount} transférés) au responsable ${responsable.fullName} par l'administrateur ${currentUser?.fullName || 'ADMINISTRATEUR'} le ${dateStr} à ${timeStr}.`
    );

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.assignCarnet(carnet.id, responsable.id, responsable.sectorId || '').catch((err) => {
        console.warn('Erreur synchro attribution carnet Supabase:', err);
      });
    }

    await refreshData();
    return carnet;
  };

  /**
   * ANNULATION D'UN CARNET PAR L'ADMINISTRATEUR (SYNCHRONISÉE SUPABASE)
   */
  const cancelCarnet = async (carnetId: string, reason: string): Promise<Carnet> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à annuler un carnet.');
    }
    const cleanReason = normalizeText(reason);
    if (!cleanReason) {
      throw new Error('Un motif d’annulation est obligatoire.');
    }

    // 1. Appel du backend synchronisé (qui met à jour Supabase avec les bons rôles/règles)
    try {
      const supabase = (await import('../db/supabaseClient')).getSupabase();
      const session = (await supabase?.auth.getSession())?.data.session;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await safeFetchJson<{ error?: string }>(`/api/carnets/${encodeURIComponent(carnetId)}/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: cleanReason }),
      });

      if (!res.ok) {
        // Repli direct Supabase si l'API backend n'est pas déployée
        try {
          await supabase?.from('carnets').update({ status: 'CANCELLED' }).eq('id', carnetId);
        } catch (dbErr) {
          console.warn('[DataContext] cancelCarnet direct Supabase fallback warning:', dbErr);
        }
      }
    } catch (err: any) {
      console.warn('[DataContext] cancelCarnet notice:', err?.message);
    }

    // 2. Mise à jour de la base de données locale après succès de la mise à jour serveur
    const db = await getDB();
    const carnet = await db.get('carnets', carnetId);
    if (!carnet) throw new Error('Carnet introuvable localement.');

    carnet.status = 'CANCELLED';
    await db.put('carnets', carnet);

    const allTickets = await db.getAll('tickets');
    const carnetTickets = allTickets.filter((t) => t.carnetId === carnet.id);

    const tx = db.transaction('tickets', 'readwrite');
    let cancelledCount = 0;
    const nowIso = new Date().toISOString();
    for (const t of carnetTickets) {
      if (t.status !== 'SOLD' && t.status !== 'CONTROLLED') {
        t.status = 'CANCELLED';
        t.cancelledAt = nowIso;
        t.cancelledBy = currentUser?.fullName;
        t.cancellationReason = cleanReason;
        await tx.store.put(t);
        cancelledCount++;
      }
    }
    await tx.done;

    await recordAudit(
      'CARNET_CANCELLED',
      'Carnet',
      carnet.id,
      `Annulation du carnet ${carnet.carnetNumber} (${cancelledCount} tickets non vendus annulés). Motif : ${cleanReason}`
    );

    await refreshData();
    return carnet;
  };

  /**
   * TRANSITION EXPLICITE DE STATUT D'UN TICKET AVEC CONTRÔLE MACHINE À ÉTATS
   */
  const updateTicketStatus = async (
    ticketId: string,
    newStatus: TicketStatus,
    reason?: string
  ): Promise<Ticket> => {
    const db = await getDB();
    const ticket = await db.get('tickets', ticketId);
    if (!ticket) throw new Error('Ticket introuvable.');

    // Contrôle strict de la transition de statut
    assertTicketStatusTransition(ticket.ticketNumber, ticket.status, newStatus);

    const oldStatus = ticket.status;
    ticket.status = newStatus;

    if (newStatus === 'CANCELLED') {
      ticket.cancelledAt = new Date().toISOString();
      ticket.cancelledBy = currentUser?.fullName;
      ticket.cancellationReason = reason ? normalizeText(reason) : 'Annulation administrative';
    }

    await db.put('tickets', ticket);

    await recordAudit(
      'TICKET_CANCELLED',
      'Ticket',
      ticket.id,
      `Transition de statut du ticket ${ticket.ticketNumber} : [${oldStatus}] -> [${newStatus}]${reason ? ` (Motif : ${reason})` : ''}`,
      { status: oldStatus },
      { status: newStatus }
    );

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.updateTicketStatus({
        ticketId: ticket.id,
        status: newStatus,
      }).catch(() => {});
    }

    await refreshData();
    return ticket;
  };

  const cancelTicket = async (ticketId: string, reason: string): Promise<void> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Violation de privilège : Un responsable ou agent ne peut jamais annuler un ticket. Seul l’administrateur général est habilité.');
    }
    const cleanReason = normalizeText(reason);
    if (!cleanReason) {
      throw new Error('Un motif d’annulation est obligatoire.');
    }

    // 1. Appel du backend synchronisé (qui met à jour Supabase avec les bons rôles/règles)
    try {
      const supabase = (await import('../db/supabaseClient')).getSupabase();
      const session = (await supabase?.auth.getSession())?.data.session;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await safeFetchJson<{ error?: string }>(`/api/tickets/${encodeURIComponent(ticketId)}/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: cleanReason }),
      });

      if (!res.ok) {
        // Repli direct Supabase
        try {
          await supabase?.from('tickets').update({
            status: 'CANCELLED',
            cancelled_at: new Date().toISOString(),
            cancelled_by: currentUser?.id,
            cancellation_reason: cleanReason,
          }).eq('id', ticketId);
        } catch (dbErr) {
          console.warn('[DataContext] cancelTicket direct Supabase fallback warning:', dbErr);
        }
      }
    } catch (err: any) {
      console.warn('[DataContext] cancelTicket notice:', err?.message);
    }

    // 2. Mise à jour de la base de données locale
    const db = await getDB();
    const ticket = await db.get('tickets', ticketId);
    if (!ticket) throw new Error('Ticket introuvable localement');

    const previousStatus = ticket.status;
    ticket.status = 'CANCELLED';
    ticket.cancelledAt = new Date().toISOString();
    ticket.cancelledBy = currentUser?.fullName;
    ticket.cancellationReason = cleanReason;
    await db.put('tickets', ticket);

    await recordAudit(
      'TICKET_CANCELLED',
      'Ticket',
      ticket.id,
      `Annulation du ticket ${ticket.ticketNumber}. Raison: ${reason}`,
      { status: previousStatus },
      { status: 'CANCELLED' }
    );

    await refreshData();
  };

  const correctRemiseAdmin = async (
    remiseId: string,
    newAmount: number,
    newNote: string,
    reason: string
  ): Promise<void> => {
    if (currentUser?.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est habilité à effectuer une correction exceptionnelle de remise.');
    }
    if (!reason || reason.trim().length === 0) {
      throw new Error('Le motif de correction est strictement obligatoire.');
    }
    if (newAmount < 0) {
      throw new Error('Le montant de la remise ne peut pas être négatif.');
    }

    const db = await getDB();
    const remise = await db.get('remises', remiseId);
    if (!remise) throw new Error('Remise introuvable');

    const oldAmount = remise.amount;
    const oldNote = remise.note;
    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = nowIso.slice(0, 10);
    const timeStr = now.toLocaleTimeString('fr-FR', { hour12: false }) || now.toTimeString().slice(0, 8);

    remise.history.push({
      id: `hist-${Date.now()}`,
      modifiedAt: nowIso,
      modifiedById: currentUser?.id || 'admin',
      modifiedByName: currentUser?.fullName || 'ADMINISTRATEUR',
      date: dateStr,
      time: timeStr,
      reason: normalizeText(reason),
      oldAmount,
      newAmount,
      oldNote,
      newNote: normalizeText(newNote),
    });

    remise.amount = newAmount;
    remise.note = normalizeText(newNote);
    remise.ticketsCount = Math.floor(newAmount / ticketPrice);
    remise.isCorrected = true;

    await db.put('remises', remise);

    await recordAudit(
      'REMISE_EXCEPTIONAL_CORRECTION',
      'Remise',
      remise.id,
      `Correction exceptionnelle de la remise ${remise.reference} : Ancien montant ${formatFCFA(oldAmount)} -> Nouveau montant ${formatFCFA(newAmount)}. Motif: ${reason}`,
      { amount: oldAmount, note: oldNote },
      { amount: newAmount, note: newNote }
    );

    // Notification traçable de rectification pour l'agent
    const notifCorrection: NotificationRecord = {
      id: `notif-remise-corr-${remise.id}-${Date.now()}`,
      recipientId: remise.agentId,
      senderId: currentUser?.id || 'admin',
      title: `CORRECTION DE REMISE : ${remise.reference}`,
      message: `La remise ${remise.reference} a été rectifiée par l'Administration : ${formatFCFA(oldAmount)} -> ${formatFCFA(newAmount)}. Motif : ${reason}.`,
      level: 'WARNING',
      type: 'REMITTANCE',
      metadata: {
        remiseId: remise.id,
        reference: remise.reference,
        oldAmount,
        newAmount,
        reason,
        correctedBy: currentUser?.fullName,
      },
      isRead: false,
      createdAt: nowIso,
    };
    if (db.objectStoreNames.contains('notifications')) {
      await db.put('notifications', notifCorrection);
    }
    if (isOnline && SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertNotification(notifCorrection).catch(() => {});
    }

    await refreshData();
  };

  // ----------------------------------------------------
  // ACTIONS RESPONSABLE ET ADMIN
  // ----------------------------------------------------
  const assignTicketsToAgent = async (
    ticketIds: string[],
    agentId: string
  ): Promise<{ count: number; ticketNumbers: string[] }> => {
    if (!ticketIds || ticketIds.length === 0) {
      throw new Error('Aucun ticket sélectionné pour l\'attribution.');
    }

    if (currentUser && (currentUser.role === 'AGENT' || currentUser.role === 'CONTROLEUR')) {
      throw new Error("Violation de privilège : Les agents et contrôleurs ne peuvent pas attribuer de tickets.");
    }

    const db = await getDB();
    const agent = await db.get('users', agentId);
    if (!agent) throw new Error('Agent introuvable');
    if (!agent.isActive) {
      throw new Error(`Impossible d'attribuer des tickets à un agent inactif (${agent.fullName}).`);
    }
    if (agent.role !== 'AGENT') {
      throw new Error(`L'utilisateur sélectionné (${agent.fullName}) n'a pas le rôle AGENT.`);
    }

    if (currentUser && currentUser.role === 'RESPONSABLE') {
      // Relaxed to allow ticket distribution to any agent regardless of their sector as requested
    }

    // Contrôles préalables stricts de sécurité :
    // - Seuls les tickets non vendus peuvent être attribués ou réattribués.
    // - Un ticket vendu ne peut JAMAIS être réattribué.
    // - Un ticket annulé ne peut pas être attribué.
    for (const tId of ticketIds) {
      const ticket = await db.get('tickets', tId);
      if (!ticket) throw new Error(`Ticket introuvable (ID: ${tId}).`);

      if (currentUser && currentUser.role === 'RESPONSABLE' && currentUser.sectorId) {
        // Relaxed sector restriction so any assigned booklet's tickets can be distributed regardless of sector
      }

      if (ticket.status === 'SOLD' || ticket.status === 'CONTROLLED') {
        throw new Error(
          `Règle de sécurité violée : Le ticket ${ticket.ticketNumber} est déjà VENDU et ne peut jamais être réattribué.`
        );
      }

      if (ticket.status === 'CANCELLED') {
        throw new Error(
          `Règle de sécurité violée : Le ticket ${ticket.ticketNumber} est ANNULÉ et ne peut pas être attribué.`
        );
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = nowIso.slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8);
    const responsableName = currentUser?.fullName || 'RESPONSABLE';
    const actorName = currentUser?.fullName || currentUser?.username || 'RESPONSABLE';

    const updatedTickets: Ticket[] = [];
    const previousAgentsSet = new Set<string>();

    const tx = db.transaction(['tickets', 'ticket_assignments'], 'readwrite');
    for (const tId of ticketIds) {
      const ticket = await tx.objectStore('tickets').get(tId);
      if (!ticket) continue;

      const oldAgentId = ticket.assignedAgentId;
      const oldAgentName = ticket.assignedAgentName;
      if (oldAgentName && oldAgentId !== agent.id) {
        previousAgentsSet.add(oldAgentName);
      }

      ticket.assignedAgentId = agent.id;
      ticket.assignedAgentName = agent.fullName;
      if (currentUser?.role === 'RESPONSABLE') {
        ticket.assignedResponsableId = currentUser.id;
        ticket.assignedResponsableName = currentUser.fullName;
      }
      ticket.sectorId = agent.sectorId || ticket.sectorId;
      ticket.sectorName = agent.sectorName || ticket.sectorName;
      ticket.status = 'ASSIGNED_TO_AGENT';

      await tx.objectStore('tickets').put(ticket);
      updatedTickets.push(ticket);

      const assignmentRecord: any = {
        id: generateSecureToken('asg', 12),
        ticketId: ticket.id,
        carnetId: ticket.carnetId,
        fromProfileId: oldAgentId || currentUser?.id,
        toProfileId: agent.id,
        assignedBy: currentUser?.id || 'resp',
        assignmentType: oldAgentId ? 'REASSIGNMENT' : 'AGENT_ASSIGNMENT',
        notes: oldAgentId
          ? `Réattribution du ticket ${ticket.ticketNumber} de ${oldAgentName} vers ${agent.fullName}`
          : `Attribution initiale du ticket ${ticket.ticketNumber} à ${agent.fullName}`,
        assignedAt: nowIso,
      };
      await tx.objectStore('ticket_assignments').put(assignmentRecord);
    }
    await tx.done;

    const count = updatedTickets.length;
    const isReassignment = previousAgentsSet.size > 0;
    const oldAgentsSummary = isReassignment
      ? Array.from(previousAgentsSet).join(', ')
      : 'Aucun (Stock Responsable)';
    const ticketNumbers = updatedTickets.map((t) => t.ticketNumber);

    // AUDIT COMPLET OBLIGATOIRE :
    // Chaque attribution/réattribution doit enregistrer :
    // - ticket
    // - ancien agent
    // - nouvel agent
    // - responsable
    // - date
    // - heure
    // - acteur
    await recordAudit(
      isReassignment ? 'TICKETS_REASSIGNED' : 'TICKETS_ASSIGNED_AGENT',
      'Tickets',
      agent.id,
      `Attribution de ${count} ticket(s) à l'agent ${agent.fullName}. Tickets: ${ticketNumbers.slice(0, 20).join(', ')}${count > 20 ? '...' : ''}. Ancien agent: ${oldAgentsSummary}. Responsable: ${responsableName}. Date: ${dateStr}, Heure: ${timeStr}. Acteur: ${actorName}.`,
      { previousAgents: oldAgentsSummary, status: isReassignment ? 'ASSIGNED_TO_AGENT' : 'AVAILABLE' },
      { newAgentId: agent.id, newAgentName: agent.fullName, status: 'ASSIGNED_TO_AGENT', count }
    );

    // NOTIFICATION OBLIGATOIRE :
    // Lorsqu'un agent reçoit des tickets :
    // Créer une notification :
    // "${count} NOUVEAUX TICKETS VOUS ONT ÉTÉ ATTRIBUÉS"
    // La notification doit être persistante et synchronisable.
    const notifMessage = `${count} NOUVEAUX TICKETS VOUS ONT ÉTÉ ATTRIBUÉS`;
    const notif: NotificationRecord = {
      id: generateSecureToken('notif', 12),
      recipientId: agent.id,
      senderId: currentUser?.id,
      title: 'ATTRIBUTION DE TICKETS',
      message: notifMessage,
      level: 'INFO',
      type: 'ASSIGNMENT',
      metadata: {
        ticketCount: count,
        ticketNumbers,
        carnets: Array.from(new Set(updatedTickets.map((t) => t.carnetNumber))),
        assignedBy: responsableName,
        date: dateStr,
        time: timeStr,
      },
      isRead: false,
      createdAt: nowIso,
    };

    if (db.objectStoreNames.contains('notifications')) {
      await db.put('notifications', notif);
    }

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertNotification(notif).catch(() => {});
      try {
        const supabase = (await import('../db/supabaseClient')).getSupabase();
        const session = (await supabase?.auth.getSession())?.data.session;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        await safeFetchJson('/api/tickets/assign', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ticketIds,
            agentId: agent.id,
            responsibleId: currentUser?.id,
          }),
        });
      } catch (err) {
        console.warn('[DataContext] Erreur réseau lors de l’attribution:', err);
      }
    }

    await refreshData();
    return { count, ticketNumbers };
  };

  const reassignUnsoldTickets = async (
    ticketIds: string[],
    newAgentId: string
  ): Promise<{ count: number; ticketNumbers: string[] }> => {
    return assignTicketsToAgent(ticketIds, newAgentId);
  };

  const markNotificationAsRead = async (notificationId: string): Promise<void> => {
    const db = await getDB();
    if (db.objectStoreNames.contains('notifications')) {
      const notif = await db.get('notifications', notificationId);
      if (notif) {
        notif.isRead = true;
        notif.readAt = new Date().toISOString();
        await db.put('notifications', notif);
        await refreshData();
      }
    }
  };

  const markAllNotificationsAsRead = async (recipientId?: string): Promise<void> => {
    const targetId = recipientId || currentUser?.id;
    const db = await getDB();
    if (db.objectStoreNames.contains('notifications')) {
      const allNotifs = await db.getAll('notifications');
      const tx = db.transaction('notifications', 'readwrite');
      const nowIso = new Date().toISOString();
      for (const notif of allNotifs) {
        if ((!targetId || notif.recipientId === targetId) && !notif.isRead) {
          notif.isRead = true;
          notif.readAt = nowIso;
          await tx.store.put(notif);
        }
      }
      await tx.done;
      await refreshData();
    }
  };

  const correctPlateNumber = async (
    ticketId: string,
    newPlate: string,
    reason: string
  ): Promise<void> => {
    const db = await getDB();
    const ticket = await db.get('tickets', ticketId);
    if (!ticket) throw new Error('Ticket introuvable');

    const normalizedNewPlate = normalizePlate(newPlate);
    const oldPlate = ticket.plateNumber;
    ticket.plateNumber = normalizedNewPlate;
    await db.put('tickets', ticket);

    // Mettre également à jour la vente associée
    if (ticket.saleId) {
      const sale = await db.get('sales', ticket.saleId);
      if (sale) {
        sale.plateNumber = normalizedNewPlate;
        await db.put('sales', sale);
      }
    }

    await recordAudit(
      'PLATE_CORRECTED',
      'Ticket',
      ticket.id,
      `Correction d'immatriculation pour le ticket ${ticket.ticketNumber} : ${oldPlate} -> ${normalizedNewPlate}. Motif: ${reason}`,
      { plateNumber: oldPlate },
      { plateNumber: normalizedNewPlate }
    );

    await refreshData();
  };

  const recordRemise = async (params: {
    agentId: string;
    amount: number;
    note?: string;
  }): Promise<Remise> => {
    if (params.amount <= 0) {
      throw new Error('Le montant de la remise doit être strictement supérieur à zéro.');
    }

    if (currentUser && currentUser.role !== 'RESPONSABLE' && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error("Violation de privilège : Seul un responsable de secteur ou l'administrateur peut enregistrer une remise.");
    }

    const db = await getDB();
    const agent = await db.get('users', params.agentId);
    if (!agent) throw new Error('Utilisateur (Agent ou Responsable) introuvable');

    if (currentUser && currentUser.role === 'RESPONSABLE') {
      if (currentUser.sectorId && agent.sectorId && agent.sectorId !== currentUser.sectorId) {
        throw new Error("Accès refusé : Vous ne pouvez pas enregistrer une remise pour un agent d'un autre secteur.");
      }
    }

    const allRemises = await db.getAll('remises');
    const ref = `REM-2026-${String(allRemises.length + 1).padStart(4, '0')}`;
    const remiseId = `rem-${Date.now()}`;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString('fr-FR', { hour12: false }) || now.toTimeString().slice(0, 8);

    const ticketsCount = Math.floor(params.amount / ticketPrice);

    // Récupérer les tickets vendus par cet agent ou ce responsable non encore couverts par une remise
    const allTickets = await db.getAll('tickets');
    const uncoveredSoldTickets = allTickets
      .filter((t) => {
        const matchesPayer =
          t.assignedAgentId === params.agentId ||
          (agent.role === 'RESPONSABLE' && (t.assignedResponsableId === params.agentId || (agent.sectorId && t.sectorId === agent.sectorId)));
        return matchesPayer && (t.status === 'SOLD' || t.status === 'CONTROLLED') && !t.coveredByRemiseId;
      })
      .sort((a, b) => (a.soldAt || '').localeCompare(b.soldAt || ''));

    // Couvrir les N plus anciens tickets correspondants au montant
    const ticketsToCover = uncoveredSoldTickets.slice(0, ticketsCount);
    const ticketIdsCovered = ticketsToCover.map((t) => t.id);

    const responsableName = currentUser?.fullName || (currentUser?.role === 'ADMINISTRATEUR' ? 'ADMINISTRATEUR GÉNÉRAL' : 'RESPONSABLE');
    const remise: Remise = {
      id: remiseId,
      reference: ref,
      agentId: agent.id,
      agentName: agent.fullName,
      responsableId: currentUser?.id || 'admin',
      responsableName,
      sectorId: agent.sectorId || currentUser?.sectorId || 'sec-vridi-port',
      sectorName: agent.sectorName || currentUser?.sectorName || 'VRIDI PORT',
      amount: params.amount,
      date: dateStr,
      time: timeStr,
      createdAt: now.toISOString(),
      note: params.note ? normalizeText(params.note) : undefined,
      ticketIdsCovered,
      ticketsCount,
      history: [],
    };

    await db.put('remises', remise);

    // Marquer les tickets comme couverts
    const tx = db.transaction('tickets', 'readwrite');
    for (const t of ticketsToCover) {
      t.coveredByRemiseId = remiseId;
      await tx.store.put(t);
    }
    await tx.done;

    // Marquer les ventes correspondantes comme couvertes
    const allSales = await db.getAll('sales');
    const salesTx = db.transaction('sales', 'readwrite');
    for (const s of allSales) {
      if (ticketIdsCovered.includes(s.ticketId)) {
        s.coveredByRemiseId = remiseId;
        await salesTx.store.put(s);
      }
    }
    await salesTx.done;

    // NOTIFICATION AGENT :
    // notifier l'agent avec : montant, date, heure, responsable, référence
    const notifAgent: NotificationRecord = {
      id: `notif-remise-${remiseId}-${Date.now()}`,
      recipientId: agent.id,
      senderId: currentUser?.id || 'resp',
      title: `REMISE ENREGISTRÉE : ${ref}`,
      message: `Versement de ${formatFCFA(params.amount)} reçu par ${responsableName} le ${formatDate(dateStr)} à ${timeStr}. Référence : ${ref}.`,
      level: 'INFO',
      type: 'REMITTANCE',
      metadata: {
        remiseId,
        reference: ref,
        amount: params.amount,
        date: dateStr,
        time: timeStr,
        responsableId: currentUser?.id,
        responsableName,
      },
      isRead: false,
      createdAt: now.toISOString(),
    };
    if (db.objectStoreNames.contains('notifications')) {
      await db.put('notifications', notifAgent);
    }
    if (isOnline && SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertNotification(notifAgent).catch(() => {});
    }

    await recordAudit(
      'REMISE_RECORDED',
      'Remise',
      remiseId,
      `Enregistrement de la remise ${ref} de ${formatFCFA(params.amount)} pour l'agent ${agent.fullName} (${ticketsCount} tickets couverts)`
    );

    await refreshData();
    return remise;
  };

  // ----------------------------------------------------
  // ACTIONS DÉPENSES
  // ----------------------------------------------------
  const createExpense = async (params: {
    amount: number;
    category: ExpenseCategory;
    description: string;
    expenseDate: string;
    receiptUrl?: string | null;
    offlineId?: string;
  }): Promise<Expense> => {
    if (!currentUser || (currentUser.role !== 'ADMINISTRATEUR' && currentUser.role !== 'RESPONSABLE')) {
      throw new Error("Privilège insuffisant : Seul un administrateur ou un responsable peut enregistrer une dépense.");
    }
    if (params.amount <= 0) {
      throw new Error('Le montant de la dépense doit être strictement positif.');
    }
    if (!params.description.trim()) {
      throw new Error('Le motif ou la description de la dépense est obligatoire.');
    }

    const db = await getDB();
    const allExpenses = await db.getAll('expenses');
    const expenseNumber = `EXP-2026-${String(allExpenses.length + 1).padStart(6, '0')}`;
    const expenseId = generateUUID();
    const nowIso = new Date().toISOString();

    const expense: Expense = {
      id: expenseId,
      expenseNumber,
      amount: params.amount,
      category: params.category,
      description: normalizeText(params.description),
      expenseDate: params.expenseDate,
      receiptUrl: params.receiptUrl || null,
      status: 'PENDING',
      createdBy: currentUser.id,
      createdByName: currentUser.fullName,
      createdByRole: currentUser.role,
      responsibleId: currentUser.role === 'RESPONSABLE' ? currentUser.id : null,
      responsibleName: currentUser.role === 'RESPONSABLE' ? currentUser.fullName : null,
      sectorId: currentUser.sectorId || null,
      sectorName: currentUser.sectorName || null,
      createdAt: nowIso,
      updatedAt: nowIso,
      offlineId: params.offlineId || null,
    };

    await db.put('expenses', expense);

    // Persistance dans Supabase si connecté
    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertExpense(expense).catch((err) =>
        console.warn('Supabase insertExpense warning:', err)
      );
    }

    // Notifier l'administrateur
    const admins = (await db.getAll('users')).filter((u) => u.role === 'ADMINISTRATEUR' && u.isActive);
    for (const admin of admins) {
      const notif: NotificationRecord = {
        id: `notif-exp-${expenseId}-${admin.id}`,
        recipientId: admin.id,
        senderId: currentUser.id,
        title: `NOUVELLE DÉPENSE À VALIDER : ${expenseNumber}`,
        message: `${currentUser.fullName} (${currentUser.role}) a soumis une dépense de ${formatFCFA(params.amount)} (${params.category}).`,
        level: 'WARNING',
        type: 'FINANCIAL_ALERT',
        metadata: { expenseId, expenseNumber, amount: params.amount },
        isRead: false,
        createdAt: nowIso,
      };
      if (db.objectStoreNames.contains('notifications')) {
        await db.put('notifications', notif);
      }
    }

    await recordAudit(
      'EXPENSE_CREATED',
      'Expense',
      expenseId,
      `Création de la dépense ${expenseNumber} (${params.category}) d'un montant de ${formatFCFA(params.amount)}`
    );

    await refreshData();
    return expense;
  };

  const validateExpense = async (expenseId: string): Promise<Expense> => {
    if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error("Privilège insuffisant : Seul l'administrateur peut valider une dépense.");
    }
    const db = await getDB();
    const expense = await db.get('expenses', expenseId);
    if (!expense) throw new Error('Dépense introuvable.');
    if (expense.status !== 'PENDING') {
      throw new Error('Cette dépense a déjà été traitée.');
    }

    const nowIso = new Date().toISOString();
    expense.status = 'VALIDATED';
    expense.approvedBy = currentUser.id;
    expense.approvedByName = currentUser.fullName;
    expense.approvedAt = nowIso;
    expense.updatedAt = nowIso;

    await db.put('expenses', expense);

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.updateExpenseStatus({
        expenseId: expense.id,
        status: 'VALIDATED',
        approvedBy: currentUser.id,
      }).catch((err) => console.warn('Supabase validateExpense warning:', err));
    }

    if (expense.createdBy && expense.createdBy !== currentUser.id) {
      const notif: NotificationRecord = {
        id: `notif-exp-val-${expenseId}-${Date.now()}`,
        recipientId: expense.createdBy,
        senderId: currentUser.id,
        title: `DÉPENSE VALIDÉE : ${expense.expenseNumber}`,
        message: `Votre dépense de ${formatFCFA(expense.amount)} (${expense.category}) a été validée par l'administrateur.`,
        level: 'INFO',
        type: 'FINANCIAL_ALERT',
        metadata: { expenseId, expenseNumber: expense.expenseNumber },
        isRead: false,
        createdAt: nowIso,
      };
      if (db.objectStoreNames.contains('notifications')) {
        await db.put('notifications', notif);
      }
    }

    await recordAudit(
      'EXPENSE_VALIDATED',
      'Expense',
      expenseId,
      `Validation de la dépense ${expense.expenseNumber} d'un montant de ${formatFCFA(expense.amount)}`
    );

    await refreshData();
    return expense;
  };

  const rejectExpense = async (expenseId: string, reason: string): Promise<Expense> => {
    if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error("Privilège insuffisant : Seul l'administrateur peut rejeter une dépense.");
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error('Veuillez fournir un motif de rejet valide (minimum 5 caractères).');
    }
    const db = await getDB();
    const expense = await db.get('expenses', expenseId);
    if (!expense) throw new Error('Dépense introuvable.');
    if (expense.status !== 'PENDING') {
      throw new Error('Cette dépense a déjà été traitée.');
    }

    const nowIso = new Date().toISOString();
    expense.status = 'REJECTED';
    expense.rejectionReason = normalizeText(reason);
    expense.approvedBy = currentUser.id;
    expense.approvedByName = currentUser.fullName;
    expense.approvedAt = nowIso;
    expense.updatedAt = nowIso;

    await db.put('expenses', expense);

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.updateExpenseStatus({
        expenseId: expense.id,
        status: 'REJECTED',
        approvedBy: currentUser.id,
        reason: normalizeText(reason),
      }).catch((err) => console.warn('Supabase rejectExpense warning:', err));
    }

    if (expense.createdBy && expense.createdBy !== currentUser.id) {
      const notif: NotificationRecord = {
        id: `notif-exp-rej-${expenseId}-${Date.now()}`,
        recipientId: expense.createdBy,
        senderId: currentUser.id,
        title: `DÉPENSE REJETÉE : ${expense.expenseNumber}`,
        message: `Votre dépense de ${formatFCFA(expense.amount)} a été rejetée. Motif : ${reason}`,
        level: 'WARNING',
        type: 'FINANCIAL_ALERT',
        metadata: { expenseId, expenseNumber: expense.expenseNumber, reason },
        isRead: false,
        createdAt: nowIso,
      };
      if (db.objectStoreNames.contains('notifications')) {
        await db.put('notifications', notif);
      }
    }

    await recordAudit(
      'EXPENSE_REJECTED',
      'Expense',
      expenseId,
      `Rejet de la dépense ${expense.expenseNumber}. Motif : ${reason}`
    );

    await refreshData();
    return expense;
  };

  const cancelExpense = async (expenseId: string, reason: string): Promise<Expense> => {
    if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error("Privilège insuffisant : Seul l'administrateur peut annuler une dépense validée.");
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error("Veuillez fournir un motif d'annulation valide.");
    }
    const db = await getDB();
    const expense = await db.get('expenses', expenseId);
    if (!expense) throw new Error('Dépense introuvable.');

    const nowIso = new Date().toISOString();
    expense.status = 'CANCELLED';
    expense.cancellationReason = normalizeText(reason);
    expense.updatedAt = nowIso;

    await db.put('expenses', expense);

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.updateExpenseStatus({
        expenseId: expense.id,
        status: 'CANCELLED',
        approvedBy: currentUser.id,
        reason: normalizeText(reason),
      }).catch((err) => console.warn('Supabase cancelExpense warning:', err));
    }

    await recordAudit(
      'EXPENSE_CANCELLED',
      'Expense',
      expenseId,
      `Annulation de la dépense validée ${expense.expenseNumber} (${formatFCFA(expense.amount)}). Motif : ${reason}`
    );

    await refreshData();
    return expense;
  };

  const correctExpense = async (expenseId: string, newAmount: number, reason: string): Promise<Expense> => {
    if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error("Privilège insuffisant : Seul l'administrateur peut corriger une dépense.");
    }
    if (newAmount <= 0) {
      throw new Error('Le montant corrigé doit être strictement positif.');
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error('Veuillez fournir un motif de correction valide.');
    }
    const db = await getDB();
    const expense = await db.get('expenses', expenseId);
    if (!expense) throw new Error('Dépense introuvable.');

    const oldAmount = expense.amount;
    const nowIso = new Date().toISOString();
    expense.amount = newAmount;
    expense.correctionReason = normalizeText(reason);
    expense.updatedAt = nowIso;

    await db.put('expenses', expense);

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertExpense(expense).catch((err) =>
        console.warn('Supabase correctExpense warning:', err)
      );
    }

    await recordAudit(
      'EXPENSE_CORRECTED',
      'Expense',
      expenseId,
      `Correction administrative de la dépense ${expense.expenseNumber} : ${formatFCFA(oldAmount)} -> ${formatFCFA(newAmount)}. Motif : ${reason}`
    );

    await refreshData();
    return expense;
  };

  // ----------------------------------------------------
  // ACTIONS CLÔTURES DE CAISSE, VÉHICULES & RÉIMPRESSIONS
  // ----------------------------------------------------
  const submitDailyClosing = async (params: {
    openingBalance: number;
    cashSalesAmount: number;
    digitalSalesAmount: number;
    refundsAmount: number;
    expensesAmount: number;
    expectedBalance: number;
    declaredBalance: number;
    notes?: string;
  }): Promise<DailyClosing> => {
    if (!currentUser) throw new Error('Authentification requise');
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    const difference = params.declaredBalance - params.expectedBalance;

    const closing: DailyClosing = {
      id: generateUUID(),
      closingReference: `CLO-${today.replace(/-/g, '')}`,
      closingDate: today,
      date: today,
      cashierId: currentUser.id,
      cashierName: currentUser.fullName,
      sectorId: currentUser.sectorId,
      sectorName: currentUser.sectorName,
      openingBalance: params.openingBalance,
      cashSalesAmount: params.cashSalesAmount,
      digitalSalesAmount: params.digitalSalesAmount,
      refundsAmount: params.refundsAmount,
      expensesAmount: params.expensesAmount,
      expectedBalance: params.expectedBalance,
      declaredBalance: params.declaredBalance,
      declaredCash: params.declaredBalance,
      discrepancy: difference,
      difference,
      notes: params.notes,
      status: 'CONFIRMED',
      confirmedBy: currentUser.id,
      confirmedByName: currentUser.fullName,
      confirmedAt: nowIso,
      closedById: currentUser.id,
      closedByName: currentUser.fullName,
      closedAt: nowIso,
      isLocked: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const db = await getDB();
    if (db.objectStoreNames.contains('daily_closings')) {
      await db.put('daily_closings', closing);
    }

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertDailyClosing(closing).catch((err: any) =>
        console.warn('Supabase submitDailyClosing error:', err)
      );
    }

    await recordAudit(
      'DAILY_CLOSING_SUBMITTED',
      'DailyClosing',
      closing.id,
      `Clôture de caisse du ${today} validée par ${currentUser.fullName} (Écart: ${formatFCFA(difference)})`
    );

    await refreshData();
    return closing;
  };

  const upsertVehicle = async (
    vehicleData: Partial<Vehicle> & { plateNumber: string }
  ): Promise<Vehicle> => {
    const cleanPlate = normalizePlate(vehicleData.plateNumber);
    const nowIso = new Date().toISOString();
    const db = await getDB();

    let existing: Vehicle | undefined;
    if (db.objectStoreNames.contains('vehicles')) {
      const all = await db.getAll('vehicles');
      existing = all.find((v) => v.plateNumber === cleanPlate);
    }

    const vehicle: Vehicle = {
      id: existing?.id || generateUUID(),
      plateNumber: cleanPlate,
      vehicleType: vehicleData.vehicleType || existing?.vehicleType || 'CAMION_CITERNE',
      makeModel: vehicleData.makeModel || existing?.makeModel,
      driverName: vehicleData.driverName || existing?.driverName,
      driverPhone: vehicleData.driverPhone || existing?.driverPhone,
      companyName: vehicleData.companyName || existing?.companyName,
      isFlaggedFraud: vehicleData.isFlaggedFraud ?? existing?.isFlaggedFraud ?? false,
      flagReason: vehicleData.flagReason || existing?.flagReason,
      lastSeenAt: nowIso,
      totalTicketsCount:
        (existing?.totalTicketsCount || 0) + (vehicleData.totalTicketsCount ? 1 : 0),
      totalControlsCount:
        (existing?.totalControlsCount || 0) + (vehicleData.totalControlsCount ? 1 : 0),
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (db.objectStoreNames.contains('vehicles')) {
      await db.put('vehicles', vehicle);
    }

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.upsertVehicle(vehicle).catch((err) =>
        console.warn('Supabase upsertVehicle error:', err)
      );
    }

    await refreshData();
    return vehicle;
  };

  const recordTicketReprint = async (
    ticketId: string,
    reason: string
  ): Promise<{ reprint: TicketReprint; isSuspicious: boolean }> => {
    if (!currentUser) throw new Error('Authentification requise');
    const db = await getDB();
    const ticket = await db.get('tickets', ticketId);
    if (!ticket) throw new Error('Ticket introuvable');

    const updated = await recordTicketReprintDomain({
      ticket,
      actor: currentUser,
      reason,
    });

    const reprint: TicketReprint = {
      id: generateUUID(),
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      requestedBy: currentUser.id,
      requestedByName: currentUser.fullName,
      reason,
      reprintCount: updated.reprintCount || 1,
      isSuspicious: (updated.reprintCount || 1) > 2,
      reprintedAt: new Date().toISOString(),
    };

    await refreshData();
    return { reprint, isSuspicious: reprint.isSuspicious };
  };

  // ----------------------------------------------------
  // ACTIONS AGENT
  // ----------------------------------------------------
  /**
   * RÈGLE MÉTIER CRITIQUE :
   * Lorsqu'une nouvelle vente concerne une immatriculation qui possède déjà
   * un ticket actif vendu depuis moins de 7 jours :
   * afficher un avertissement avant validation. L'agent doit confirmer explicitement.
   */
  const checkDuplicatePlate = (plateRaw: string): DuplicateCheckResult => {
    const cleanPlate = normalizePlate(plateRaw);
    if (!cleanPlate) {
      return { hasActiveTicket: false, activeTicket: null, daysRemaining: 0 };
    }

    const now = Date.now();
    // Rechercher parmi tous les tickets vendus, valides et non annulés
    const activeMatch = tickets.find((t) => {
      if (t.status !== 'SOLD' || t.isSuperseded) return false;
      if (normalizePlate(t.plateNumber || '') !== cleanPlate) return false;
      if (!t.soldAt) return false;

      const saleTime = new Date(t.soldAt).getTime();
      const diffMs = now - saleTime;
      return diffMs < ACTIVE_TICKET_VALIDITY_MS;
    });

    if (activeMatch && activeMatch.soldAt) {
      const saleTime = new Date(activeMatch.soldAt).getTime();
      const diffMs = now - saleTime;
      const daysLeft = Math.ceil((ACTIVE_TICKET_VALIDITY_MS - diffMs) / (24 * 60 * 60 * 1000));
      return {
        hasActiveTicket: true,
        activeTicket: activeMatch,
        daysRemaining: Math.max(1, daysLeft),
      };
    }

    return { hasActiveTicket: false, activeTicket: null, daysRemaining: 0 };
  };

  const sellTicket = async (params: {
    ticketId: string;
    plateNumber: string;
    driverPhone?: string;
    driverName?: string;
    overrideOldTicketId?: string;
  }): Promise<Sale> => {
    const db = await getDB();
    const ticket = await db.get('tickets', params.ticketId);
    if (!ticket) throw new Error('Ticket introuvable');

    const isAdmin = currentUser?.role === 'ADMINISTRATEUR';
    if (!isAdmin && ticket.status !== 'ASSIGNED_TO_AGENT') {
      throw new Error(`Ce ticket n'est pas disponible pour la vente (Statut: ${ticket.status})`);
    }
    if (ticket.status === 'SOLD') {
      throw new Error('Ce ticket a déjà été vendu.');
    }
    if (ticket.status === 'CANCELLED') {
      throw new Error('Ce ticket a été annulé par l’administration.');
    }

    if (currentUser && currentUser.role === 'AGENT') {
      if (ticket.assignedAgentId && ticket.assignedAgentId !== currentUser.id) {
        throw new Error("Violation de sécurité : Ce ticket ne vous est pas attribué.");
      }
    }
    if (currentUser && currentUser.role === 'CONTROLEUR') {
      throw new Error("Violation d'accès : Un contrôleur ne peut pas enregistrer de ventes.");
    }

    const cleanPlate = normalizePlate(params.plateNumber);
    if (!cleanPlate) throw new Error('L’immatriculation est obligatoire.');

    const cleanPhone = params.driverPhone ? normalizePhone(params.driverPhone) : undefined;

    // Récupérer le GPS terrain (ne jamais bloquer si indisponible)
    const gps = await getCurrentCoordinates();
    const resolvedGpsStatus = gps.status === 'AVAILABLE' ? 'AVAILABLE' : 'GPS_UNAVAILABLE';

    // RÈGLE MÉTIER OBLIGATOIRE : sale_id UUID immédiat pour l'idempotence
    const saleId = generateUUID();
    const originalSoldAt = new Date().toISOString(); // DATE ORIGINALE (NE JAMAIS ÉCRASER)

    // RÈGLE MÉTIER CRITIQUE :
    // L'ancien ticket actif de la même immatriculation devient inactif lorsqu'une nouvelle vente est confirmée.
    const allExistingTickets = await db.getAll('tickets');
    for (const oldTkt of allExistingTickets) {
      if (
        oldTkt.id !== ticket.id &&
        oldTkt.status === 'SOLD' &&
        !oldTkt.isSuperseded &&
        normalizePlate(oldTkt.plateNumber || '') === cleanPlate
      ) {
        oldTkt.isSuperseded = true;
        oldTkt.supersededByTicketNumber = ticket.ticketNumber;
        await db.put('tickets', oldTkt);

        if (SupabaseDataLayer.isAvailable()) {
          SupabaseDataLayer.updateTicketStatus({
            ticketId: oldTkt.id,
            isSuperseded: true,
            supersededByTicketNumber: ticket.ticketNumber,
          }).catch(() => {});
        }
      }
    }

    // Mettre à jour le ticket
    ticket.status = 'SOLD';
    ticket.saleId = saleId;
    ticket.soldAt = originalSoldAt;
    ticket.plateNumber = cleanPlate;
    ticket.driverPhone = cleanPhone;
    ticket.driverName = params.driverName;
    ticket.isSuperseded = false;
    await db.put('tickets', ticket);

    // Créer la vente
    const sale: Sale = {
      id: saleId,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      agentId: ticket.assignedAgentId || currentUser?.id || 'admin',
      agentName: ticket.assignedAgentName || (isAdmin ? `${currentUser?.fullName || 'ADMINISTRATEUR'} (Admin)` : currentUser?.fullName || 'AGENT'),
      sectorId: ticket.sectorId,
      sectorName: ticket.sectorName,
      plateNumber: cleanPlate,
      driverPhone: cleanPhone,
      driverName: params.driverName,
      soldAt: originalSoldAt, // Date originale (immuable)
      gpsLatitude: gps.latitude,
      gpsLongitude: gps.longitude,
      gpsAccuracy: gps.accuracy,
      gpsStatus: resolvedGpsStatus,
      syncStatus: isOnline ? 'SYNCED' : 'PENDING_SYNC',
      syncedAt: isOnline ? originalSoldAt : undefined,
      price: ticketPrice,
    };

    await db.put('sales', sale);

    // Mettre à jour le registre des véhicules de façon transparente et asynchrone
    upsertVehicle({
      plateNumber: cleanPlate,
      driverName: params.driverName,
      driverPhone: cleanPhone,
      totalTicketsCount: 1,
    }).catch((err) => console.warn('[PORTUS DataContext] Erreur upsert véhicule vente:', err));

    // Si en ligne, réplication atomique et sécurisée via la RPC PostgreSQL
    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        const secureSale = await SupabaseDataLayer.sellTicketSecureRPC({
          ticketId: ticket.id,
          plateNumber: cleanPlate,
          driverPhone: cleanPhone,
          syncIdempotencyKey: saleId,
          latitude: gps.latitude ?? undefined,
          longitude: gps.longitude ?? undefined,
          accuracy: gps.accuracy ?? undefined,
          soldAt: originalSoldAt,
        });
        if (secureSale && secureSale.sale_id) {
          sale.id = secureSale.sale_id;
          sale.syncStatus = 'SYNCED';
        }
      } catch (sbErr: any) {
        if (sbErr.message && sbErr.message.includes('déjà été vendu')) {
          throw sbErr;
        }
        console.warn('Synchro directe Supabase RPC différée, repli sur insertion idempotente:', sbErr);
        try {
          await SupabaseDataLayer.insertSaleIdempotent(sale);
        } catch {
          // Reste en local pour synchronisation différée
        }
      }
    }

    // Notification Responsable et Administrateur si synchronisé immédiatement
    if (isOnline) {
      await notifySaleSynced(sale, db);
    }

    // Audit
    await recordAudit(
      'TICKET_SOLD',
      'Ticket',
      ticket.id,
      `Vente du ticket ${ticket.ticketNumber} pour l'immatriculation ${cleanPlate} (${isOnline ? 'En ligne' : 'Hors ligne'})`
    );

    if (isOnline) {
      setLastSyncedSaleNumber(ticket.ticketNumber);
      setTimeout(() => setLastSyncedSaleNumber(null), 4000);
    }

    await refreshData();
    return sale;
  };

  const getAgentStats = (agentId: string) => {
    const userObj = users.find((u) => u.id === agentId);
    let agentTickets = tickets.filter((t) => t.assignedAgentId === agentId);
    if (userObj?.role === 'RESPONSABLE') {
      agentTickets = tickets.filter(
        (t) => t.assignedResponsableId === agentId || (userObj.sectorId && t.sectorId === userObj.sectorId)
      );
    }
    const assignedCount = agentTickets.length;
    const availableCount = agentTickets.filter(
      (t) => t.status === 'ASSIGNED_TO_AGENT' || t.status === 'ASSIGNED_TO_RESPONSIBLE' || t.status === 'AVAILABLE'
    ).length;
    const soldCount = agentTickets.filter((t) => t.status === 'SOLD' || t.status === 'CONTROLLED').length;
    const expectedAmount = soldCount * ticketPrice;

    const agentRemises = remises.filter((r) => r.agentId === agentId || (userObj?.role === 'RESPONSABLE' && r.responsableId === agentId));
    const remittedAmount = agentRemises.reduce((sum, r) => sum + r.amount, 0);
    const remainingBalance = Math.max(0, expectedAmount - remittedAmount);
    const ecart = Math.max(0, remittedAmount - expectedAmount);
    const unremittedTicketsCount = Math.ceil(remainingBalance / ticketPrice);

    return {
      assignedCount,
      availableCount,
      soldCount,
      ticketsSold: soldCount,
      totalSalesAmount: expectedAmount,
      expectedAmount,
      remittedAmount,
      remainingBalance,
      ecart,
      unremittedTicketsCount,
    };
  };

  const getRecentPlates = (): string[] => {
    const plateSet = new Set<string>();
    sales.forEach((s) => {
      if (s.plateNumber) plateSet.add(s.plateNumber);
    });
    return Array.from(plateSet).slice(0, 8);
  };

  // ----------------------------------------------------
  // ACTIONS CONTRÔLEUR
  // ----------------------------------------------------
  const verifyTicket = async (identifierRaw: string): Promise<VerifyTicketResult> => {
    let targetTicketNumber: string = '';
    let targetTicketId: string = '';

    // Décodage si QR JSON
    const parsedQR = parseTicketQRPayload(identifierRaw);
    if (parsedQR && (parsedQR.num || parsedQR.tid)) {
      targetTicketNumber = parsedQR.num ? parsedQR.num.trim().toUpperCase() : '';
      targetTicketId = parsedQR.tid || '';
    } else {
      const rawTrimmed = identifierRaw.trim();
      targetTicketNumber = rawTrimmed.toUpperCase();
      targetTicketId = rawTrimmed;
    }

    let foundTicket: Ticket | null = null;
    let verifiedVia: 'SERVER' | 'LOCAL_CACHE' = 'LOCAL_CACHE';

    // 1. Essai de vérification serveur via RPC sécurisée (HMAC-SHA256 autoritaire)
    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        const secureResult = await SupabaseDataLayer.verifyTicketSecureRPC({
          identifier: targetTicketNumber || targetTicketId || identifierRaw,
          scannedToken: parsedQR?.sig || parsedQR?.tok,
        });

        if (secureResult) {
          if (!secureResult.valid && (secureResult.status === 'FORGED_SIGNATURE' || secureResult.status === 'FORGED_TOKEN')) {
            return {
              status: 'INVALID_UNKNOWN',
              bannerTitle: '🚨 FALSIFICATION DÉTECTÉE — SIGNATURE NON CONFORME',
              ticket: null,
              agentName: secureResult.agent_name || null,
              agentPhone: secureResult.agent_phone || null,
              verifiedVia: 'SERVER',
              message: secureResult.message || 'Signature cryptographique non authentique. Faux ticket détecté !',
              isRepeatedControl: false,
              previousControlCount: secureResult.control_count || 0,
            };
          }

          if (secureResult.ticket_id) {
            const serverTicket = await SupabaseDataLayer.fetchTicketForVerification(
              secureResult.ticket_number || targetTicketNumber || targetTicketId || identifierRaw
            );
            if (serverTicket) {
              foundTicket = serverTicket;
              verifiedVia = 'SERVER';
              const db = await getDB();
              await db.put('tickets', serverTicket);
            }
          }
        } else {
          const serverTicket = await SupabaseDataLayer.fetchTicketForVerification(
            targetTicketNumber || targetTicketId || identifierRaw
          );
          if (serverTicket) {
            foundTicket = serverTicket;
            verifiedVia = 'SERVER';
            const db = await getDB();
            await db.put('tickets', serverTicket);
          }
        }
      } catch (err) {
        console.warn('Erreur vérification serveur Supabase, repli sur le cache local:', err);
      }
    }

    // 2. Repli sur le cache local IndexedDB si non trouvé sur le serveur ou hors ligne
    if (!foundTicket) {
      const cleanNum = targetTicketNumber;
      const cleanPlate = normalizePlate(identifierRaw);

      foundTicket =
        tickets.find((t) => {
          if (cleanNum && t.ticketNumber.toUpperCase() === cleanNum) return true;
          if (targetTicketId && t.id === targetTicketId) return true;
          if (t.id === identifierRaw) return true;
          if (t.qrPayload && t.qrPayload === identifierRaw) return true;
          if (cleanPlate && normalizePlate(t.plateNumber || '') === cleanPlate) return true;
          return false;
        }) || null;

      verifiedVia = 'LOCAL_CACHE';
    }

    // Cas 1: QR inconnu ou introuvable
    if (!foundTicket) {
      return {
        status: 'INVALID_UNKNOWN',
        bannerTitle: '🔴 TICKET INVALIDE — QR CODE NON RECONNU',
        ticket: null,
        agentName: null,
        agentPhone: null,
        verifiedVia,
        message: 'Ce code ne correspond à aucun ticket enregistré dans la base officielle de l’U.J.S.R.V.',
        isRepeatedControl: false,
        previousControlCount: 0,
      };
    }

    // ====================================================================
    // CONTRÔLE DE SÉCURITÉ DU JETON CRYPTOGRAPHIQUE INTERNE (ANTI-FALSIFICATION)
    // RÈGLE MÉTIER : Ne jamais faire confiance au seul numéro physique visible !
    // Si le QR contient un numéro physique valide mais que le jeton interne est absent ou non conforme,
    // il s'agit d'une contrefaçon / tentative de falsification.
    // ====================================================================
    if (parsedQR && foundTicket) {
      const scannedToken = parsedQR.sig || parsedQR.signature || parsedQR.tok;
      const tokenVerification = verifyTicketSecurityToken(foundTicket.qrPayload, scannedToken);
      if (!tokenVerification.isAuthentic && tokenVerification.forgeryDetected) {
        return {
          status: 'INVALID_UNKNOWN',
          bannerTitle: '🚨 FALSIFICATION DÉTECTÉE — SIGNATURE OU JETON NON AUTHENTIQUE',
          ticket: foundTicket,
          agentName: null,
          agentPhone: null,
          verifiedVia,
          message: `ALERTE SÉCURITÉ : Le numéro physique [${foundTicket.ticketNumber}] existe, mais la signature ou le jeton cryptographique est non conforme. Ticket contrefait. (${tokenVerification.reason})`,
          isRepeatedControl: false,
          previousControlCount: foundTicket.controlCount || 0,
        };
      }
    }

    // Récupérer les coordonnées de l'agent vendeur
    const agentUser = users.find((u) => u.id === foundTicket?.assignedAgentId);
    const agentName =
      foundTicket.assignedAgentName || agentUser?.fullName || 'Agent U.J.S.R.V.';
    const agentPhone =
      foundTicket.assignedAgentPhone || agentUser?.phone || 'Téléphone non renseigné';

    const previousControlCount = foundTicket.controlCount || 0;
    const isRepeatedControl = previousControlCount > 0;

    // Cas 2: Ticket Annulé
    if (foundTicket.status === 'CANCELLED') {
      return {
        status: 'CANCELLED',
        bannerTitle: '❌ TICKET ANNULÉ — NON VALIDE',
        ticket: foundTicket,
        agentName,
        agentPhone,
        verifiedVia,
        message: `Ce ticket a été annulé par l’administration.${
          foundTicket.cancellationReason ? ' Motif : ' + foundTicket.cancellationReason : ''
        }`,
        isRepeatedControl,
        previousControlCount,
      };
    }

    // Cas 3: Ticket Remplacé / Inactif
    if (foundTicket.isSuperseded) {
      return {
        status: 'SUPERSEDED',
        bannerTitle: '⚠️ TICKET INACTIF — REMPLACÉ PAR UN NOUVEAU TICKET',
        ticket: foundTicket,
        agentName,
        agentPhone,
        verifiedVia,
        message: `Un nouveau ticket actif a été émis pour ce véhicule (${
          foundTicket.supersededByTicketNumber || 'Nouveau ticket'
        }).`,
        isRepeatedControl,
        previousControlCount,
      };
    }

    // Cas 4: Non encore vendu
    if (foundTicket.status !== 'SOLD' && foundTicket.status !== 'CONTROLLED') {
      return {
        status: 'NOT_SOLD',
        bannerTitle: '🔴 TICKET INVALIDE — NON ENCORE VENDU',
        ticket: foundTicket,
        agentName,
        agentPhone,
        verifiedVia,
        message: `Ce ticket figure dans un carnet non vendu (statut actuel : ${foundTicket.status}). Circuler avec ce ticket est non conforme.`,
        isRepeatedControl,
        previousControlCount,
      };
    }

    // Cas 5: Ticket Valide et Autorisé (IMPORTANT: ne pas afficher "DÉJÀ CONTRÔLÉ" même si rescanné !)
    return {
      status: 'VALID',
      bannerTitle: '🟢 TICKET VALIDE — AUTORISÉ',
      ticket: foundTicket,
      agentName,
      agentPhone,
      verifiedVia,
      message: `Ticket régulier et conforme pour le véhicule ${foundTicket.plateNumber || 'Enregistré'}.`,
      isRepeatedControl,
      previousControlCount,
    };
  };

  const searchTicketsByPlate = async (plateRaw: string): Promise<Ticket[]> => {
    const cleanPlate = normalizePlate(plateRaw);
    if (!cleanPlate) return [];

    // Recherche en ligne sur le serveur si connecté
    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        const serverResults = await SupabaseDataLayer.fetchTicketsByPlate(cleanPlate);
        if (serverResults.length > 0) {
          const db = await getDB();
          for (const st of serverResults) {
            await db.put('tickets', st);
          }
          return serverResults;
        }
      } catch (err) {
        console.warn('Erreur recherche serveur par immatriculation:', err);
      }
    }

    // Recherche dans le cache local IndexedDB
    return tickets
      .filter((t) => normalizePlate(t.plateNumber || '') === cleanPlate)
      .sort((a, b) => {
        // Mettre les tickets vendus/actifs en premier, puis par date décroissante
        if (a.status === 'SOLD' && b.status !== 'SOLD') return -1;
        if (b.status === 'SOLD' && a.status !== 'SOLD') return 1;
        return (b.soldAt || '').localeCompare(a.soldAt || '');
      });
  };

  const recordControl = async (
    ticketNumberOrParams:
      | string
      | {
          ticketNumber: string;
          plateNumber: string;
          isValid: boolean;
          message: string;
          resultType?: Control['resultType'];
        },
    plateNumberArg?: string,
    isValidArg?: boolean,
    messageArg?: string
  ): Promise<Control> => {
    const db = await getDB();

    let ticketNum: string;
    let plateNum: string;
    let isValid: boolean;
    let validationMessage: string;
    let resultType: Control['resultType'];

    if (typeof ticketNumberOrParams === 'object') {
      ticketNum = ticketNumberOrParams.ticketNumber;
      plateNum = ticketNumberOrParams.plateNumber;
      isValid = ticketNumberOrParams.isValid;
      validationMessage = ticketNumberOrParams.message;
      resultType = ticketNumberOrParams.resultType;
    } else {
      ticketNum = ticketNumberOrParams;
      plateNum = plateNumberArg || '';
      isValid = isValidArg ?? false;
      validationMessage = messageArg || '';
      resultType = isValid ? 'VALID' : 'INVALID_UNKNOWN';
    }

    const cleanPlate = normalizePlate(plateNum);
    const cleanNum = normalizeText(ticketNum);
    const gps = await getCurrentCoordinates();

    const controlId = `ctrl-${Date.now()}-${generateUUID().slice(0, 4)}`;
    const now = new Date().toISOString();

    // Mettre à jour le compteur de contrôles sur le ticket dans la base locale
    const t = tickets.find((tkt) => tkt.ticketNumber === cleanNum);
    if (t) {
      t.controlCount = (t.controlCount || 0) + 1;
      t.lastControlledAt = now;
      t.lastControlledBy = currentUser?.fullName;
      if (t.status === 'SOLD') {
        t.status = 'CONTROLLED';
      }
      await db.put('tickets', t);
    }

    const control: Control = {
      id: controlId,
      ticketId: t?.id,
      ticketNumber: cleanNum,
      plateNumber: cleanPlate || (t?.plateNumber ? normalizePlate(t.plateNumber) : 'NON_RENSEIGNEE'),
      controleurId: currentUser?.id || 'ctrl',
      controleurName: currentUser?.fullName || 'CONTRÔLEUR',
      controlledAt: now,
      isValid,
      validationMessage: normalizeText(validationMessage),
      resultType: resultType || (isValid ? 'VALID' : 'INVALID_UNKNOWN'),
      isOnline,
      gpsLatitude: gps.latitude,
      gpsLongitude: gps.longitude,
      gpsAccuracy: gps.accuracy,
      gpsStatus: gps.status,
      syncStatus: isOnline ? 'SYNCED' : 'PENDING_SYNC',
      syncedAt: isOnline ? now : undefined,
    };

    // Sauvegarde locale IndexedDB
    await db.put('controls', control);

    // Envoi immédiat au serveur Supabase si en ligne via la RPC officielle sécurisée
    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        const secureControl = await SupabaseDataLayer.recordControlSecureRPC({
          identifier: cleanNum,
          plateNumber: cleanPlate,
          location: 'Vridi',
          notes: validationMessage,
        });
        if (secureControl) {
          control.isValid = secureControl.valid;
          if (secureControl.control_id) control.id = secureControl.control_id;
          control.syncStatus = 'SYNCED';
        }
      } catch (err) {
        console.warn('Erreur envoi direct contrôle Supabase via RPC, bascule sur insertion/file:', err);
        try {
          await SupabaseDataLayer.insertControl(control);
        } catch {
          control.syncStatus = 'PENDING_SYNC';
          await db.put('controls', control);
        }
      }
    }

    await recordAudit(
      'TICKET_CONTROLLED',
      'Control',
      controlId,
      `Contrôle routier ${isOnline ? '[EN LIGNE]' : '[HORS LIGNE]'} pour le ticket ${cleanNum} (Immat: ${
        control.plateNumber
      }) — Résultat : ${isValid ? '🟢 VALIDE' : '🔴 NON CONFORME'}`
    );

    await refreshData();
    return control;
  };

  const reportFraud = async (report: {
    ticketNumber?: string;
    plateNumber: string;
    type: FraudReport['type'];
    typeLabel: string;
    comment: string;
    photos?: string[];
    photoDataUrl?: string;
    reason?: string;
    reasonLabel?: string;
  }): Promise<FraudReport> => {
    const db = await getDB();
    const gps = await getCurrentCoordinates();
    const cleanPlate = normalizePlate(report.plateNumber);

    const now = new Date();
    const nowIso = now.toISOString();
    const reportedDate = nowIso.split('T')[0];
    const reportedTime = now.toLocaleTimeString('fr-FR', { hour12: false });

    // Conserver toutes les photos (support tableau de base64 data URLs)
    const photosList = report.photos && report.photos.length > 0
      ? report.photos
      : (report.photoDataUrl ? [report.photoDataUrl] : []);

    const fraudId = `frd-${Date.now()}`;
    const fraud: FraudReport = {
      id: fraudId,
      ticketNumber: report.ticketNumber ? normalizeText(report.ticketNumber) : undefined,
      plateNumber: cleanPlate,
      controleurId: currentUser?.id || 'ctrl',
      controleurName: currentUser?.fullName || 'CONTRÔLEUR ROUTIER',
      type: report.type,
      typeLabel: report.typeLabel,
      reason: report.reason || report.type,
      reasonLabel: report.reasonLabel || report.typeLabel,
      comment: normalizeText(report.comment),
      photos: photosList,
      photoDataUrl: photosList[0] || report.photoDataUrl,
      reportedAt: nowIso,
      reportedDate,
      reportedTime,
      gpsLatitude: gps.latitude,
      gpsLongitude: gps.longitude,
      gpsStatus: gps.latitude != null ? 'AVAILABLE' : 'UNAVAILABLE',
      // RÈGLE MÉTIER CRITIQUE : Un signalement NE doit PAS annuler automatiquement le ticket. Il est soumis à analyse.
      status: 'NOUVEAU',
      processingHistory: [],
      isOnline,
      syncStatus: isOnline ? 'SYNCED' : 'PENDING_SYNC',
      syncedAt: isOnline ? nowIso : undefined,
    };

    // 1. Stockage local IndexedDB offline-first (la photo reste stockée localement)
    await db.put('fraud_reports', fraud);

    // 2. Synchronisation immédiate si en ligne
    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        await SupabaseDataLayer.insertFraudReport(fraud);
      } catch (err) {
        console.warn('Erreur envoi direct signalement fraude Supabase, bascule en file d’attente:', err);
        fraud.syncStatus = 'PENDING_SYNC';
        await db.put('fraud_reports', fraud);
      }
    }

    // 3. Audit Trail horodaté et inaltérable
    await recordAudit(
      'FRAUD_REPORTED',
      'FraudReport',
      fraudId,
      `Signalement de fraude [${report.typeLabel}] pour le véhicule ${cleanPlate}${
        report.ticketNumber ? ` (Ticket ${report.ticketNumber})` : ''
      } par ${fraud.controleurName}. ${photosList.length} photo(s) jointe(s). Statut: NOUVEAU (Soumis à analyse administrative). Mode: ${isOnline ? 'EN LIGNE' : 'HORS LIGNE (Stocké localement)'}`
    );

    // 4. NOTIFICATIONS : Notifier immédiatement l'Administrateur et le Responsable concerné
    try {
      const allUsers: User[] = await db.getAll('users');
      // Trouver le ticket correspondant si mentionné pour cibler le responsable de secteur
      let targetSectorId: string | undefined;
      if (report.ticketNumber) {
        const matchingTicket = tickets.find((t) => t.ticketNumber === report.ticketNumber);
        targetSectorId = matchingTicket?.sectorId;
      }

      // Destinataires : tous les administrateurs + responsables de secteur concernés
      const alertRecipients = allUsers.filter(
        (u) =>
          u.isActive &&
          (u.role === 'ADMINISTRATEUR' ||
            (u.role === 'RESPONSABLE' && (!targetSectorId || !u.sectorId || u.sectorId === targetSectorId)))
      );

      const notifTitle = `🚨 SIGNALEMENT FRAUDE : ${report.typeLabel}`;
      const notifMessage = `Véhicule ${cleanPlate} | Ticket : ${report.ticketNumber || 'Non renseigné'} | Contrôleur : ${fraud.controleurName} | ${photosList.length} photo(s). En attente d'arbitrage.`;

      for (const rec of alertRecipients) {
        const notif: NotificationRecord = {
          id: `notif-fraud-${fraud.id}-${rec.id}`,
          recipientId: rec.id,
          senderId: fraud.controleurId,
          title: notifTitle,
          message: notifMessage,
          level: 'CRITICAL',
          type: 'FRAUD_ALERT',
          metadata: {
            fraudId: fraud.id,
            plateNumber: cleanPlate,
            ticketNumber: report.ticketNumber,
            fraudType: report.type,
            controleurName: fraud.controleurName,
            photosCount: photosList.length,
          },
          isRead: false,
          createdAt: nowIso,
        };

        if (db.objectStoreNames.contains('notifications')) {
          await db.put('notifications', notif);
        }
        if (isOnline && SupabaseDataLayer.isAvailable()) {
          SupabaseDataLayer.insertNotification(notif).catch(() => {});
        }
      }
    } catch (notifErr) {
      console.warn('Erreur génération notification fraude:', notifErr);
    }

    await refreshData();
    return fraud;
  };

  // Traitement et arbitrage administratif d'un signalement de fraude avec historique et audit
  const updateFraudReportStatus = async (
    fraudId: string,
    newStatus: FraudReport['status'],
    decisionNote: string
  ): Promise<FraudReport> => {
    const db = await getDB();
    const existing = await db.get('fraud_reports', fraudId);
    if (!existing) {
      throw new Error(`Signalement de fraude #${fraudId} introuvable.`);
    }

    const previousStatus = existing.status;
    const nowIso = new Date().toISOString();

    const historyEntry: FraudProcessingHistoryEntry = {
      id: `fph-${Date.now()}`,
      processedAt: nowIso,
      adminId: currentUser?.id || 'admin',
      adminName: currentUser?.fullName || 'ADMINISTRATEUR',
      fromStatus: previousStatus,
      toStatus: newStatus,
      decisionNote: decisionNote.trim(),
    };

    const updatedHistory = [...(existing.processingHistory || []), historyEntry];

    const updatedFraud: FraudReport = {
      ...existing,
      status: newStatus,
      adminDecisionNote: decisionNote.trim(),
      adminDecisionBy: currentUser?.id,
      adminDecisionByName: currentUser?.fullName,
      adminDecisionAt: nowIso,
      processingHistory: updatedHistory,
    };

    // Si le statut est confirmé et qu'un ticket existe, l'administrateur peut décider des suites (le ticket n'est jamais annulé automatiquement)
    await db.put('fraud_reports', updatedFraud);

    // Synchronisation Supabase si en ligne
    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        await SupabaseDataLayer.updateFraudReportStatus(
          fraudId,
          newStatus,
          decisionNote.trim(),
          currentUser?.id
        );
      } catch (err) {
        console.warn('Erreur mise à jour statut fraude Supabase:', err);
      }
    }

    // Déterminer l'action d'audit appropriée
    let auditAction: AuditAction = 'FRAUD_STATUS_UPDATED';
    if (newStatus === 'CONFIRME') auditAction = 'FRAUD_CONFIRMED';
    else if (newStatus === 'REJETE') auditAction = 'FRAUD_REJECTED';

    await recordAudit(
      auditAction,
      'FraudReport',
      fraudId,
      `Arbitrage administratif du signalement #${fraudId} (Véhicule: ${existing.plateNumber}) : Changement de statut de [${previousStatus}] à [${newStatus}]. Motif décision: "${decisionNote.trim()}" par ${currentUser?.fullName}.`
    );

    // Notifier le contrôleur ayant émis le signalement
    try {
      const notifToControleur: NotificationRecord = {
        id: `notif-fraud-decision-${fraudId}-${Date.now()}`,
        recipientId: existing.controleurId,
        senderId: currentUser?.id,
        title: `Décision administrative sur votre signalement (${existing.plateNumber})`,
        message: `Votre signalement pour le véhicule ${existing.plateNumber} a été classé : ${newStatus}. Note : ${decisionNote.trim()}`,
        level: newStatus === 'CONFIRME' ? 'WARNING' : 'INFO',
        type: 'FRAUD_ALERT',
        metadata: {
          fraudId,
          status: newStatus,
          plateNumber: existing.plateNumber,
        },
        isRead: false,
        createdAt: nowIso,
      };

      if (db.objectStoreNames.contains('notifications')) {
        await db.put('notifications', notifToControleur);
      }
      if (isOnline && SupabaseDataLayer.isAvailable()) {
        SupabaseDataLayer.insertNotification(notifToControleur).catch(() => {});
      }
    } catch (ctrlNotifErr) {
      console.warn('Erreur notification contrôleur décision fraude:', ctrlNotifErr);
    }

    await refreshData();
    return updatedFraud;
  };

  return (
    <DataContext.Provider
      value={{
        users,
        carnets,
        tickets,
        sales,
        controls,
        fraudReports,
        remises,
        expenses,
        auditLogs,
        alerts,
        notifications,
        dailyClosings,
        vehicles,
        ticketReprints,
        sectors: DEFAULT_SECTORS,
        ticketPrice,
        updateTicketPrice,
        isOnline,
        isSimulatedOffline,
        toggleSimulatedOffline,
        isSyncing,
        pendingSyncCount,
        lastSyncedSaleNumber,
        syncOfflineQueue,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        latestRealtimeIncident,
        dismissLatestIncident,
        isRealtimeConnected,
        simulateIncidentForTesting,
        createUser,
        updateUser,
        toggleUserActive,
        resetUserPassword,
        changeOwnPassword,
        resetApplicationData,
        createCarnet,
        assignCarnetToResponsable,
        cancelCarnet,
        updateTicketStatus,
        cancelTicket,
        correctRemiseAdmin,
        assignTicketsToAgent,
        reassignUnsoldTickets,
        correctPlateNumber,
        recordRemise,
        createExpense,
        validateExpense,
        rejectExpense,
        cancelExpense,
        correctExpense,
        submitDailyClosing,
        upsertVehicle,
        recordTicketReprint,
        checkDuplicatePlate,
        sellTicket,
        getAgentStats,
        getRecentPlates,
        verifyTicket,
        searchTicketsByPlate,
        recordControl,
        reportFraud,
        updateFraudReportStatus,
        refreshData,
        syncAllToSupabase,
        isRlsPermissionIssue,
        lastRlsError,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData doit être utilisé au sein d’un DataProvider');
  }
  return context;
}
