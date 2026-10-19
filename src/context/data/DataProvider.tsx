import React, { useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { DataContext } from './DataContext';
import type { DataContextType } from './types';
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
  NotificationRecord,
  DailyClosing,
  Vehicle,
  SOSAlert,
  LitigeChauffeur,
  BrigadeAssignment,
} from '../../types';
import { DEFAULT_SECTORS } from '../../config/constants';
import { getDB, initializeDatabase } from '../../db/indexedDb';
import { useAuth } from '../AuthContext';
import { getSupabase } from '../../db/supabaseClient';
import {
  SupabaseDataLayer,
  isRlsPermissionIssueDetected,
  getLastRlsErrorMessage,
} from '../../db/supabaseService';
import { usePortusStore } from '../../store/usePortusStore';
import { getStoredDeletedCarnetIds } from './constants';

import { useOnlineAndSyncState } from './hooks/useOnlineAndSyncState';
import { useAuditLogs } from './hooks/useAuditLogs';
import { useNotifications } from './hooks/useNotifications';
import { useRealtimeIncidents } from './hooks/useRealtimeIncidents';
import { useUsers } from './hooks/useUsers';
import { useCarnetsAndTickets } from './hooks/useCarnetsAndTickets';
import { useSalesAndAgentStats } from './hooks/useSalesAndAgentStats';
import { useRemittances } from './hooks/useRemittances';
import { useExpenses } from './hooks/useExpenses';
import { useControlsAndFraud } from './hooks/useControlsAndFraud';
import { useSOSAndLitiges } from './hooks/useSOSAndLitiges';
import { useDailyClosingsAndVehicles } from './hooks/useDailyClosingsAndVehicles';

let lastSyncTime = 0;

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  // 1. Audit Logs
  const { auditLogs, setAuditLogs, recordAudit: recordAuditRaw } = useAuditLogs();

  const recordAudit = useCallback(
    (
      action: AuditLog['action'],
      targetEntity: string,
      targetId: string,
      details?: string,
      oldValue?: any,
      newValue?: any
    ) => recordAuditRaw(action, targetEntity, targetId, details, oldValue, newValue, currentUser),
    [recordAuditRaw, currentUser]
  );

  // 2. Notifications
  const {
    notifications,
    setNotifications,
    markNotificationAsRead: markNotifRead,
    markAllNotificationsAsRead: markAllNotifsRead,
    notifySaleSynced,
  } = useNotifications();

  const markNotificationAsRead = useCallback(
    (notificationId: string) => markNotifRead(notificationId),
    [markNotifRead]
  );

  const markAllNotificationsAsRead = useCallback(
    (recipientId?: string) => markAllNotifsRead(recipientId, currentUser?.id),
    [markAllNotifsRead, currentUser]
  );

  // 3. SOS & Realtime Incidents
  const {
    latestRealtimeIncident,
    dismissLatestIncident,
    isRealtimeConnected,
    simulateIncidentForTesting,
  } = useRealtimeIncidents(currentUser, true, () => {}, setNotifications);

  // Forward declaration ref for refreshData
  const refreshDataRef = useRef<(forceSync?: boolean) => Promise<void>>(async () => {});

  const handleRefresh = useCallback(async (forceSync?: boolean) => {
    await refreshDataRef.current(forceSync);
  }, []);

  // 4. Online and Sync State
  const {
    isOnline,
    isSimulatedOffline,
    toggleSimulatedOffline,
    isSyncing,
    pendingSyncCount,
    setPendingSyncCount,
    lastSyncedSaleNumber,
    setLastSyncedSaleNumber,
    isRlsPermissionIssue,
    setIsRlsPermissionIssue,
    lastRlsError,
    setLastRlsError,
    actionLocksRef,
    syncOfflineQueue,
    syncAllToSupabase,
  } = useOnlineAndSyncState(notifySaleSynced, handleRefresh);

  // 5. Users
  const {
    users,
    setUsers,
    createUser,
    updateUser,
    toggleUserActive,
    resetUserPassword,
    changeOwnPassword,
    resetApplicationData,
  } = useUsers(currentUser, recordAudit, handleRefresh);

  // 6. Carnets & Tickets
  const {
    carnets,
    setCarnets,
    tickets,
    setTickets,
    createCarnet,
    assignCarnetToResponsable,
    cancelCarnet,
    deleteCarnet,
    updateTicketStatus,
    cancelTicket,
    assignTicketsToAgent,
    reassignUnsoldTickets,
    correctPlateNumber,
  } = useCarnetsAndTickets(currentUser, 5000, recordAudit, handleRefresh, setNotifications);

  // 7. Daily Closings & Vehicles
  const {
    dailyClosings,
    setDailyClosings,
    vehicles,
    setVehicles,
    ticketReprints,
    setTicketReprints,
    submitDailyClosing,
    upsertVehicle,
    recordTicketReprint,
  } = useDailyClosingsAndVehicles(currentUser, recordAudit, handleRefresh);

  // 8. Remittances
  const {
    remises,
    setRemises,
    alerts,
    setAlerts,
    calculateFinancialAlerts,
    recordRemise,
    correctRemiseAdmin,
  } = useRemittances(currentUser, 5000, isOnline, recordAudit, handleRefresh, actionLocksRef);

  // 9. Sales
  const {
    sales,
    setSales,
    ticketPrice,
    updateTicketPrice,
    checkDuplicatePlate,
    sellTicket,
    getAgentStats,
    getRecentPlates,
  } = useSalesAndAgentStats(
    currentUser,
    tickets,
    users,
    remises,
    isOnline,
    recordAudit,
    handleRefresh,
    notifySaleSynced,
    upsertVehicle,
    setLastSyncedSaleNumber,
    actionLocksRef
  );

  // 10. Expenses
  const {
    expenses,
    setExpenses,
    createExpense,
    validateExpense,
    rejectExpense,
    cancelExpense,
    correctExpense,
  } = useExpenses(currentUser, recordAudit, handleRefresh);

  // 11. Controls & Fraud
  const {
    controls,
    setControls,
    fraudReports,
    setFraudReports,
    verifyTicket,
    searchTicketsByPlate,
    recordControl,
    reportFraud,
    updateFraudReportStatus,
  } = useControlsAndFraud(currentUser, tickets, users, isOnline, recordAudit, handleRefresh);

  // 12. SOS & Litiges
  const {
    sosAlerts,
    setSosAlerts,
    litigesChauffeurs,
    setLitigesChauffeurs,
    brigadeAssignments,
    setBrigadeAssignments,
    triggerSOSAlert,
    resolveSOSAlert,
    createLitige,
    updateLitigeStatus,
    createBrigadeAssignment,
    checkInBrigade,
    checkOutBrigade,
  } = useSOSAndLitiges(currentUser, recordAudit, handleRefresh, () => {});

  // --------------------------------------------------------------------------
  // Apply Local Data (IndexedDB -> React state with RBAC filtering)
  // --------------------------------------------------------------------------
  const applyLocalData = useCallback(
    async (db: any) => {
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
        allNotifications,
        allClosings,
        allVehicles,
        allReprints,
        allSos,
        allLitiges,
        allPlannings,
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
        db.objectStoreNames.contains('notifications') ? db.getAll('notifications') : Promise.resolve([]),
        db.objectStoreNames.contains('daily_closings') ? db.getAll('daily_closings') : Promise.resolve([]),
        db.objectStoreNames.contains('vehicles') ? db.getAll('vehicles') : Promise.resolve([]),
        db.objectStoreNames.contains('ticket_reprints') ? db.getAll('ticket_reprints') : Promise.resolve([]),
        db.objectStoreNames.contains('sos_alerts') ? db.getAll('sos_alerts') : Promise.resolve([]),
        db.objectStoreNames.contains('litiges_chauffeurs') ? db.getAll('litiges_chauffeurs') : Promise.resolve([]),
        db.objectStoreNames.contains('brigades_plannings') ? db.getAll('brigades_plannings') : Promise.resolve([]),
      ]);

      const activeSessionUserId =
        sessionStorage.getItem('portus_session_user_id') || sessionStorage.getItem('portus_current_user_id');
      const activeUser = currentUser || allUsers.find((u: User) => u.id === activeSessionUserId) || null;

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
          visibleAudits = allAudits;
        } else if (activeUser.role === 'RESPONSABLE') {
          const secId = activeUser.sectorId;
          visibleUsers = allUsers.filter((u: User) => u.sectorId === secId || u.id === activeUser.id);
          visibleCarnets = allCarnets.filter((c: Carnet) => c.sectorId === secId || c.assignedToResponsableId === activeUser.id);
          visibleTickets = allTickets.filter((t: Ticket) => t.sectorId === secId || t.assignedResponsableId === activeUser.id);
          visibleSales = allSales.filter((s: Sale) => s.sectorId === secId);
          visibleRemises = allRemises.filter((r: Remise) => r.sectorId === secId || r.responsableId === activeUser.id);
          visibleExpenses = allExpenses.filter(
            (e: Expense) => e.sectorId === secId || e.responsibleId === activeUser.id || e.createdBy === activeUser.id
          );
          visibleFrauds = allFrauds.filter((f: FraudReport) => !f.sectorId || f.sectorId === secId);
          visibleControls = allControls.filter((c: Control) => {
            const tkt = allTickets.find((t: Ticket) => t.id === c.ticketId || t.ticketNumber === c.ticketNumber);
            return !tkt || tkt.sectorId === secId;
          });
          visibleAudits = [];
        } else if (activeUser.role === 'AGENT') {
          visibleUsers = allUsers.filter((u: User) => u.id === activeUser.id);
          visibleCarnets = [];
          visibleTickets = allTickets.filter((t: Ticket) => t.assignedAgentId === activeUser.id);
          visibleSales = allSales.filter((s: Sale) => s.agentId === activeUser.id);
          visibleRemises = allRemises.filter((r: Remise) => r.agentId === activeUser.id);
          visibleExpenses = allExpenses.filter((e: Expense) => e.createdBy === activeUser.id);
          visibleFrauds = [];
          visibleControls = allControls.filter((c: Control) => {
            const tkt = allTickets.find((t: Ticket) => t.id === c.ticketId || t.ticketNumber === c.ticketNumber);
            return tkt && tkt.assignedAgentId === activeUser.id;
          });
          visibleAudits = [];
        } else if (activeUser.role === 'CONTROLEUR') {
          visibleUsers = allUsers.filter((u: User) => u.id === activeUser.id);
          visibleCarnets = [];
          visibleTickets = [];
          visibleSales = [];
          visibleRemises = [];
          visibleExpenses = [];
          visibleControls = allControls.filter((c: Control) => c.controleurId === activeUser.id);
          visibleFrauds = allFrauds.filter((f: FraudReport) => f.controleurId === activeUser.id);
          visibleAudits = [];
        }
      }

      const sortedCarnets = visibleCarnets.sort((a: Carnet, b: Carnet) => b.createdAt.localeCompare(a.createdAt));
      const sortedTickets = visibleTickets.sort((a: Ticket, b: Ticket) => a.ticketNumber.localeCompare(b.ticketNumber));
      const sortedSales = visibleSales.sort((a: Sale, b: Sale) => b.soldAt.localeCompare(a.soldAt));
      const sortedControls = visibleControls.sort((a: Control, b: Control) => b.controlledAt.localeCompare(a.controlledAt));
      const sortedFrauds = visibleFrauds.sort((a: FraudReport, b: FraudReport) => b.reportedAt.localeCompare(a.reportedAt));
      const sortedRemises = visibleRemises.sort((a: Remise, b: Remise) => b.createdAt.localeCompare(a.createdAt));
      const sortedExpenses = visibleExpenses.sort((a: Expense, b: Expense) => b.createdAt.localeCompare(a.createdAt));
      const sortedAudits = visibleAudits.sort((a: AuditLog, b: AuditLog) => b.timestamp.localeCompare(a.timestamp));
      const sortedNotifs = allNotifications.sort((a: NotificationRecord, b: NotificationRecord) => b.createdAt.localeCompare(a.createdAt));
      const sortedClosings = allClosings.sort((a: DailyClosing, b: DailyClosing) => (b.closingDate || b.date || '').localeCompare(a.closingDate || a.date || ''));
      const sortedSos = allSos.sort((a: SOSAlert, b: SOSAlert) => b.alertedAt.localeCompare(a.alertedAt));
      const sortedLitiges = allLitiges.sort((a: LitigeChauffeur, b: LitigeChauffeur) => b.createdAt.localeCompare(a.createdAt));
      const sortedBrigades = allPlannings.sort((a: BrigadeAssignment, b: BrigadeAssignment) => b.shiftDate.localeCompare(a.shiftDate));

      usePortusStore.getState().setAllData({
        users: visibleUsers,
        carnets: sortedCarnets,
        tickets: sortedTickets,
        sales: sortedSales,
        controls: sortedControls,
        fraudReports: sortedFrauds,
        remises: sortedRemises,
        expenses: sortedExpenses,
        auditLogs: sortedAudits,
        notifications: sortedNotifs,
        dailyClosings: sortedClosings,
        vehicles: allVehicles,
        ticketReprints: allReprints,
        sosAlerts: sortedSos,
        litigesChauffeurs: sortedLitiges,
        brigadeAssignments: sortedBrigades,
      });

      React.startTransition(() => {
        setUsers(visibleUsers);
        setCarnets(sortedCarnets);
        setTickets(sortedTickets);
        setSales(sortedSales);
        setControls(sortedControls);
        setFraudReports(sortedFrauds);
        setRemises(sortedRemises);
        setExpenses(sortedExpenses);
        setAuditLogs(sortedAudits);

        setNotifications(sortedNotifs);
        setDailyClosings(sortedClosings);
        setVehicles(allVehicles);
        setTicketReprints(allReprints);
        setSosAlerts(sortedSos);
        setLitigesChauffeurs(sortedLitiges);
        setBrigadeAssignments(sortedBrigades);
      });

      const pendingSales = allSales.filter((s: Sale) => s.syncStatus === 'PENDING_SYNC');
      const pendingControls = allControls.filter((c: Control) => c.syncStatus === 'PENDING_SYNC');
      const pendingFrauds = allFrauds.filter((f: FraudReport) => f.syncStatus === 'PENDING_SYNC');
      setPendingSyncCount(pendingSales.length + pendingControls.length + pendingFrauds.length);

      calculateFinancialAlerts(allUsers, allTickets, allRemises);
    },
    [
      currentUser,
      calculateFinancialAlerts,
      setUsers,
      setCarnets,
      setTickets,
      setSales,
      setControls,
      setFraudReports,
      setRemises,
      setExpenses,
      setAuditLogs,
      setNotifications,
      setDailyClosings,
      setVehicles,
      setTicketReprints,
      setSosAlerts,
      setLitigesChauffeurs,
      setBrigadeAssignments,
      setPendingSyncCount,
    ]
  );

  const isSyncingRemoteRef = useRef(false);

  // --------------------------------------------------------------------------
  // Sync Remote Data (Supabase Cloud -> IndexedDB bulk updates)
  // --------------------------------------------------------------------------
  const syncRemoteData = useCallback(async (db: any): Promise<boolean> => {
    if (isSyncingRemoteRef.current) return false;
    isSyncingRemoteRef.current = true;
    try {
      const [
        profilesResult,
        sectorsResult,
        carnetsResult,
        ticketsResult,
        salesResult,
        remittancesResult,
        controlsResult,
        fraudsResult,
        auditLogsResult,
        expensesResult,
        closingsResult,
        vehiclesResult,
      ] = await Promise.allSettled([
        SupabaseDataLayer.fetchProfiles(),
        SupabaseDataLayer.fetchSectors(),
        SupabaseDataLayer.fetchCarnets(),
        SupabaseDataLayer.fetchTickets(),
        SupabaseDataLayer.fetchSales(),
        SupabaseDataLayer.fetchRemittances(),
        SupabaseDataLayer.fetchControls(),
        SupabaseDataLayer.fetchFraudReports(),
        SupabaseDataLayer.fetchAuditLogs(),
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

      const remoteProfiles = profilesResult.status === 'fulfilled' ? profilesResult.value : [];
      const remoteCarnets = carnetsResult.status === 'fulfilled' ? carnetsResult.value : [];
      const remoteTickets = ticketsResult.status === 'fulfilled' ? ticketsResult.value : [];
      const remoteSales = salesResult.status === 'fulfilled' ? salesResult.value : [];
      const remoteRemises = remittancesResult.status === 'fulfilled' ? remittancesResult.value : [];
      const remoteControls = controlsResult.status === 'fulfilled' ? controlsResult.value : [];
      const remoteFrauds = fraudsResult.status === 'fulfilled' ? fraudsResult.value : [];
      const remoteAuditLogs = auditLogsResult.status === 'fulfilled' ? auditLogsResult.value : [];
      const remoteExpenses = expensesResult.status === 'fulfilled' ? expensesResult.value : [];
      const remoteClosings = closingsResult.status === 'fulfilled' ? closingsResult.value : [];
      const remoteVehicles = vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : [];

      if (remoteProfiles && remoteProfiles.length > 0) {
        const currentLocalUsers: User[] = await db.getAll('users');
        const localUserMap = new Map<string, User>(currentLocalUsers.map((u: User) => [u.id, u]));

        const mergedProfiles: User[] = [];
        for (const rp of remoteProfiles) {
          const lu = localUserMap.get(rp.id);
          if (lu) {
            const localTime = lu.updatedAt ? new Date(lu.updatedAt).getTime() : 0;
            const remoteTime = rp.updatedAt ? new Date(rp.updatedAt).getTime() : 0;
            if (localTime > remoteTime) {
              mergedProfiles.push(lu);
              SupabaseDataLayer.upsertProfile(lu).catch(() => {});
            } else {
              mergedProfiles.push(rp);
            }
          } else {
            mergedProfiles.push(rp);
          }
        }
        for (const lu of currentLocalUsers) {
          if (!mergedProfiles.some((u) => u.id === lu.id)) {
            mergedProfiles.push(lu);
          }
        }

        const tx = db.transaction('users', 'readwrite');
        const store = tx.objectStore('users');
        await Promise.all([...mergedProfiles.map((p: User) => store.put(p)), tx.done]);
      }

      if (remoteCarnets && Array.isArray(remoteCarnets)) {
        const deletedSet = getStoredDeletedCarnetIds();
        const uniqueRemoteCarnets: Carnet[] = [];
        const seenCarnetIds = new Set<string>();
        const seenCarnetNums = new Set<string>();
        for (const c of remoteCarnets) {
          if (
            c &&
            c.id &&
            !seenCarnetIds.has(c.id) &&
            !deletedSet.has(c.id) &&
            !(c.carnetNumber && deletedSet.has(c.carnetNumber))
          ) {
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
        const currentLocalCarnets: Carnet[] = await db.getAll('carnets');
        const carnetsToDelete: string[] = [];
        for (const lc of currentLocalCarnets) {
          const isDeleted = deletedSet.has(lc.id) || (lc.carnetNumber && deletedSet.has(lc.carnetNumber));
          const isRecent = lc.createdAt && (Date.now() - new Date(lc.createdAt).getTime() < 15 * 60 * 1000);
          if (isDeleted || (!remoteCarnetIds.has(lc.id) && !isRecent)) {
            carnetsToDelete.push(lc.id);
          }
        }

        const tx = db.transaction('carnets', 'readwrite');
        const store = tx.objectStore('carnets');
        await Promise.all([
          ...carnetsToDelete.map((id) => store.delete(id)),
          ...uniqueRemoteCarnets.map((c) => store.put(c)),
          tx.done,
        ]);
      }

      if (remoteTickets && Array.isArray(remoteTickets)) {
        const deletedSet = getStoredDeletedCarnetIds();
        const validRemoteTickets = remoteTickets.filter(
          (t: Ticket) => !deletedSet.has(t.carnetId) && !(t.carnetNumber && deletedSet.has(t.carnetNumber))
        );
        const remoteTicketIds = new Set(validRemoteTickets.map((t: Ticket) => t.id));
        const currentLocalTickets: Ticket[] = await db.getAll('tickets');
        const localTicketMap = new Map<string, Ticket>(currentLocalTickets.map((t) => [t.id, t]));

        const ticketsToDelete: string[] = [];
        for (const lt of currentLocalTickets) {
          const isDeleted = deletedSet.has(lt.carnetId) || (lt.carnetNumber && deletedSet.has(lt.carnetNumber));
          const isRecent = lt.createdAt && (Date.now() - new Date(lt.createdAt).getTime() < 15 * 60 * 1000);
          const isSyntheticTest =
            lt.id?.startsWith('f0000000-') ||
            (lt.carnetId === 'c0000000-0000-0000-0000-000000000001' &&
              lt.ticketNumber &&
              !['VRD-000001', 'VRD-000002', 'VRD-000003'].includes(lt.ticketNumber));

          if (isDeleted || isSyntheticTest || (!remoteTicketIds.has(lt.id) && !isRecent)) {
            ticketsToDelete.push(lt.id);
          }
        }

        const mergedTickets: Ticket[] = [];
        for (const rt of validRemoteTickets) {
          const lt = localTicketMap.get(rt.id);
          if (lt) {
            const localTime = lt.updatedAt
              ? new Date(lt.updatedAt).getTime()
              : lt.soldAt
              ? new Date(lt.soldAt).getTime()
              : 0;
            const remoteTime = rt.updatedAt
              ? new Date(rt.updatedAt).getTime()
              : rt.soldAt
              ? new Date(rt.soldAt).getTime()
              : 0;

            if (localTime > remoteTime) {
              mergedTickets.push(lt);
              SupabaseDataLayer.updateTicketStatus({
                ticketId: lt.id,
                status: lt.status,
                assignedAgentId: lt.assignedAgentId,
                assignedResponsableId: lt.assignedResponsableId,
              }).catch(() => {});
            } else {
              mergedTickets.push(rt);
            }
          } else {
            mergedTickets.push(rt);
          }
        }

        const tx = db.transaction('tickets', 'readwrite');
        const store = tx.objectStore('tickets');
        await Promise.all([
          ...ticketsToDelete.map((id) => store.delete(id)),
          ...mergedTickets.map((t: Ticket) => store.put(t)),
          tx.done,
        ]);
      }

      if (remoteExpenses && remoteExpenses.length > 0) {
        const tx = db.transaction('expenses', 'readwrite');
        const store = tx.objectStore('expenses');
        await Promise.all([...remoteExpenses.map((exp: Expense) => store.put(exp)), tx.done]);
      }

      if (remoteClosings && remoteClosings.length > 0 && db.objectStoreNames.contains('daily_closings')) {
        const tx = db.transaction('daily_closings', 'readwrite');
        const store = tx.objectStore('daily_closings');
        await Promise.all([...remoteClosings.map((cl: DailyClosing) => store.put(cl)), tx.done]);
      }

      if (remoteVehicles && remoteVehicles.length > 0 && db.objectStoreNames.contains('vehicles')) {
        const tx = db.transaction('vehicles', 'readwrite');
        const store = tx.objectStore('vehicles');
        await Promise.all([...remoteVehicles.map((v: Vehicle) => store.put(v)), tx.done]);
      }

      if (remoteSales && remoteSales.length > 0) {
        const tx = db.transaction('sales', 'readwrite');
        const store = tx.objectStore('sales');
        await Promise.all([...remoteSales.map((s: Sale) => store.put(s)), tx.done]);
      }

      if (remoteRemises && remoteRemises.length > 0) {
        const tx = db.transaction('remises', 'readwrite');
        const store = tx.objectStore('remises');
        await Promise.all([...remoteRemises.map((r: Remise) => store.put(r)), tx.done]);
      }

      if (remoteControls && remoteControls.length > 0) {
        const tx = db.transaction('controls', 'readwrite');
        const store = tx.objectStore('controls');
        await Promise.all([...remoteControls.map((c: Control) => store.put(c)), tx.done]);
      }

      if (remoteFrauds && remoteFrauds.length > 0) {
        const tx = db.transaction('fraud_reports', 'readwrite');
        const store = tx.objectStore('fraud_reports');
        await Promise.all([...remoteFrauds.map((f: FraudReport) => store.put(f)), tx.done]);
      }

      if (remoteAuditLogs && remoteAuditLogs.length > 0) {
        const tx = db.transaction('audit_logs', 'readwrite');
        const store = tx.objectStore('audit_logs');
        await Promise.all([...remoteAuditLogs.map((a: AuditLog) => store.put(a)), tx.done]);
      }

      const allLocalTktsAfter: Ticket[] = await db.getAll('tickets');
      const remoteTicketIds = new Set((remoteTickets || []).map((t: Ticket) => t.id));
      const unsyncedTkts = allLocalTktsAfter.filter((t: Ticket) => !remoteTicketIds.has(t.id));
      if (unsyncedTkts.length > 0) {
        const allLocalCarnets = await db.getAll('carnets');
        SupabaseDataLayer.syncCarnetsBatch(allLocalCarnets, unsyncedTkts).catch((e) =>
          console.warn('[PORTUS AutoSync] Erreur synchro tickets:', e)
        );
      }

      lastSyncTime = Date.now();
      return true;
    } catch (syncErr) {
      console.warn('[PORTUS DataContext] Erreur synchro distante:', syncErr);
      return false;
    } finally {
      isSyncingRemoteRef.current = false;
    }
  }, [setIsRlsPermissionIssue, setLastRlsError]);

  // --------------------------------------------------------------------------
  // Stale-While-Revalidate Refresh Data
  // --------------------------------------------------------------------------
  const refreshData = useCallback(
    async (forceSync = false) => {
      try {
        await initializeDatabase();
        const db = await getDB();

        // Step 1: Instant local render
        await applyLocalData(db);
        setIsLoading(false);

        // Step 2: Background revalidation
        const isAuthenticated = Boolean(currentUser && currentUser.isActive);
        let hasActiveSupabaseSession = false;
        const client = getSupabase();
        if (client) {
          try {
            const {
              data: { session },
            } = await client.auth.getSession();
            hasActiveSupabaseSession = Boolean(session && session.user);
          } catch {
            hasActiveSupabaseSession = false;
          }
        }

        const shouldSyncNetwork =
          isAuthenticated && hasActiveSupabaseSession && (forceSync || Date.now() - lastSyncTime > 5000);

        if (SupabaseDataLayer.isAvailable() && shouldSyncNetwork) {
          if (forceSync) {
            const didSync = await syncRemoteData(db);
            if (didSync) {
              await applyLocalData(db);
            }
          } else {
            syncRemoteData(db)
              .then((didSync) => {
                if (didSync) {
                  applyLocalData(db).catch(() => {});
                }
              })
              .catch(() => {});
          }
        }
      } catch (err) {
        console.error('Erreur chargement données', err);
        setIsLoading(false);
      }
    },
    [currentUser, applyLocalData, syncRemoteData]
  );

  // Keep ref up to date
  useEffect(() => {
    refreshDataRef.current = refreshData;
  }, [refreshData]);

  useEffect(() => {
    refreshData();
  }, [currentUser, refreshData]);

  const value: DataContextType = {
    isLoading,
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
    sosAlerts,
    litigesChauffeurs,
    brigadeAssignments,
    sectors: DEFAULT_SECTORS,
    ticketPrice,
    updateTicketPrice,
    resolveSOSAlert,
    createLitige,
    updateLitigeStatus,
    createBrigadeAssignment,
    checkInBrigade,
    checkOutBrigade,
    createExpense,
    validateExpense,
    rejectExpense,
    cancelExpense,
    correctExpense,
    submitDailyClosing,
    upsertVehicle,
    recordTicketReprint,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    isOnline,
    isSimulatedOffline,
    toggleSimulatedOffline,
    isSyncing,
    pendingSyncCount,
    lastSyncedSaleNumber,
    syncOfflineQueue,
    syncAllToSupabase,
    isRlsPermissionIssue,
    lastRlsError,
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
    deleteCarnet,
    updateTicketStatus,
    cancelTicket,
    correctRemiseAdmin,
    assignTicketsToAgent,
    reassignUnsoldTickets,
    correctPlateNumber,
    recordRemise,
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
    triggerSOSAlert,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
