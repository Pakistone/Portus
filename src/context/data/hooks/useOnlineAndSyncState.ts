import { useState, useCallback, useRef, useEffect } from 'react';
import { useOnlineStatus } from '../../../components/pwa/usePWAInstall';
import { getDB } from '../../../db/indexedDb';
import { generateUUID } from '../../../utils/uuid';
import { SupabaseDataLayer } from '../../../db/supabaseService';
import type { AuditLog, Sale, Control, FraudReport } from '../../../types';

export function useOnlineAndSyncState(
  notifySaleSynced: (sale: Sale, database: any) => Promise<void>,
  refreshData: (forceSync?: boolean) => Promise<void>
) {
  const rawIsOnline = useOnlineStatus();
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);
  const isOnline = isSimulatedOffline ? false : rawIsOnline;

  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncedSaleNumber, setLastSyncedSaleNumber] = useState<string | null>(null);
  const [isRlsPermissionIssue, setIsRlsPermissionIssue] = useState(false);
  const [lastRlsError, setLastRlsError] = useState('');

  const actionLocksRef = useRef<Set<string>>(new Set());
  const isOfflineSyncingRef = useRef(false);

  const toggleSimulatedOffline = useCallback(() => {
    setIsSimulatedOffline((prev) => !prev);
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    if (!isOnline || isSyncing || isOfflineSyncingRef.current) return;
    isOfflineSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const db = await getDB();
      const allSales: Sale[] = await db.getAll('sales');
      const allControls: Control[] = await db.getAll('controls');
      const allFrauds: FraudReport[] = await db.getAll('fraud_reports');
      const pendingSales = allSales.filter((s) => s.syncStatus === 'PENDING_SYNC');
      const pendingControls = allControls.filter((c) => c.syncStatus === 'PENDING_SYNC');
      const pendingFrauds = allFrauds.filter((f) => f.syncStatus === 'PENDING_SYNC');

      if (pendingSales.length === 0 && pendingControls.length === 0 && pendingFrauds.length === 0) {
        setPendingSyncCount(0);
        setIsSyncing(false);
        isOfflineSyncingRef.current = false;
        return;
      }

      const syncTimestamp = new Date().toISOString();
      let lastSyncedNumber = '';

      // 1. Mettre à jour IndexedDB d'abord
      const tx = db.transaction(['sales', 'controls', 'fraud_reports', 'audit_logs'], 'readwrite');
      const salesStore = tx.objectStore('sales');
      const controlsStore = tx.objectStore('controls');
      const fraudStore = tx.objectStore('fraud_reports');
      const auditStore = tx.objectStore('audit_logs');

      const allAudits: AuditLog[] = [];

      const updatedSales = pendingSales.map((sale) => {
        const updated = { ...sale, syncedAt: syncTimestamp, syncStatus: 'SYNCED' as const };
        lastSyncedNumber = sale.ticketNumber;
        allAudits.push({
          id: generateUUID(),
          actorId: sale.agentId,
          actorName: sale.agentName,
          actorRole: 'AGENT',
          action: 'SALE_SYNCED',
          timestamp: syncTimestamp,
          targetEntity: 'Sale',
          targetId: sale.id,
          details: `Synchronisation de la vente hors ligne pour le ticket ${sale.ticketNumber} (Immat: ${sale.plateNumber}). Date originale conservée: ${sale.soldAt}`,
        });
        return updated;
      });

      const updatedControls = pendingControls.map((ctrl) => {
        const updated = { ...ctrl, syncedAt: syncTimestamp, syncStatus: 'SYNCED' as const };
        allAudits.push({
          id: generateUUID(),
          actorId: ctrl.controleurId,
          actorName: ctrl.controleurName,
          actorRole: 'CONTROLEUR',
          action: 'CONTROL_SYNCED',
          timestamp: syncTimestamp,
          targetEntity: 'Control',
          targetId: ctrl.id,
          details: `Synchronisation du contrôle routier hors ligne pour le ticket ${ctrl.ticketNumber} (Immat: ${ctrl.plateNumber}).`,
        });
        return updated;
      });

      const updatedFrauds = pendingFrauds.map((fraud) => {
        const updated = { ...fraud, syncedAt: syncTimestamp, syncStatus: 'SYNCED' as const };
        allAudits.push({
          id: generateUUID(),
          actorId: fraud.controleurId,
          actorName: fraud.controleurName,
          actorRole: 'CONTROLEUR',
          action: 'FRAUD_SYNCED',
          timestamp: syncTimestamp,
          targetEntity: 'FraudReport',
          targetId: fraud.id,
          details: `Synchronisation du signalement de fraude pour le véhicule ${fraud.plateNumber} (Type: ${fraud.typeLabel}). ${fraud.photos?.length || 0} photo(s) transmise(s).`,
        });
        return updated;
      });

      await Promise.all([
        ...updatedSales.map((s) => salesStore.put(s)),
        ...updatedControls.map((c) => controlsStore.put(c)),
        ...updatedFrauds.map((f) => fraudStore.put(f)),
        ...allAudits.map((a) => auditStore.put(a)),
        tx.done,
      ]);

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
      isOfflineSyncingRef.current = false;
    }
  }, [isOnline, isSyncing, refreshData, notifySaleSynced]);

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

  return {
    isOnline,
    isSimulatedOffline,
    toggleSimulatedOffline,
    isSyncing,
    setIsSyncing,
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
  };
}
