import { useState, useCallback } from 'react';
import type { Remise, FinancialAlert, User, Ticket, NotificationRecord } from '../../../types';
import { REMISE_ALERT_START_THRESHOLD, REMISE_ALERT_STEP } from '../../../config/constants';
import { getDB } from '../../../db/indexedDb';
import { normalizeText, formatFCFA, formatDate } from '../../../utils/normalization';
import { SupabaseDataLayer } from '../../../db/supabaseService';

export function useRemittances(
  currentUser: User | null,
  ticketPrice: number,
  isOnline: boolean,
  recordAudit: (action: any, entity: string, id: string, details?: string, oldVal?: any, newVal?: any) => Promise<void>,
  refreshData: (forceSync?: boolean) => Promise<void>,
  actionLocksRef: React.MutableRefObject<Set<string>>
) {
  const [remises, setRemises] = useState<Remise[]>([]);
  const [alerts, setAlerts] = useState<FinancialAlert[]>([]);

  const calculateFinancialAlerts = useCallback(
    (allUsers: User[], allTickets: Ticket[], allRemises: Remise[]) => {
      const calculatedAlerts: FinancialAlert[] = [];
      const agents = allUsers.filter((u) => u.role === 'AGENT' && u.isActive);

      const agentSoldAmountMap = new Map<string, number>();
      for (let i = 0; i < allTickets.length; i++) {
        const t = allTickets[i];
        if (t.assignedAgentId && (t.status === 'SOLD' || t.status === 'CONTROLLED')) {
          const current = agentSoldAmountMap.get(t.assignedAgentId) || 0;
          agentSoldAmountMap.set(t.assignedAgentId, current + ticketPrice);
        }
      }

      const agentRemittedAmountMap = new Map<string, number>();
      for (let i = 0; i < allRemises.length; i++) {
        const r = allRemises[i];
        if (r.agentId) {
          const current = agentRemittedAmountMap.get(r.agentId) || 0;
          agentRemittedAmountMap.set(r.agentId, current + r.amount);
        }
      }

      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const totalSoldAmount = agentSoldAmountMap.get(agent.id) || 0;
        const totalRemittedAmount = agentRemittedAmountMap.get(agent.id) || 0;

        const remainingBalance = Math.max(0, totalSoldAmount - totalRemittedAmount);
        const unremittedTicketsCount = Math.ceil(remainingBalance / ticketPrice);

        if (unremittedTicketsCount >= REMISE_ALERT_START_THRESHOLD) {
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
      }

      setAlerts(calculatedAlerts);
    },
    [ticketPrice]
  );

  const recordRemise = useCallback(async (params: {
    agentId: string;
    amount: number;
    note?: string;
  }): Promise<Remise> => {
    if (params.amount <= 0) {
      throw new Error('Le montant de la remise doit être strictly supérieur à zéro.');
    }

    if (currentUser && currentUser.role !== 'RESPONSABLE' && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error("Violation de privilège : Seul un responsable de secteur ou l'administrateur peut enregistrer une remise.");
    }

    const lockKey = `recordRemise:${params.agentId}`;
    if (actionLocksRef.current.has(lockKey)) {
      throw new Error('Une enregistrement de remise est déjà en cours pour cet agent.');
    }
    actionLocksRef.current.add(lockKey);

    try {
      const db = await getDB();
      const agent = await db.get('users', params.agentId);
      if (!agent) throw new Error('Utilisateur (Agent ou Responsable) introuvable');

      if (currentUser && currentUser.role === 'RESPONSABLE') {
        if (currentUser.sectorId && agent.sectorId && agent.sectorId !== currentUser.sectorId) {
          throw new Error("Accès refusé : Vous ne pouvez pas enregistrer une remise pour un agent d'un autre secteur.");
        }
      }

      const allRemises: Remise[] = await db.getAll('remises');
      const ref = `REM-2026-${String(allRemises.length + 1).padStart(4, '0')}`;
      const remiseId = `rem-${Date.now()}`;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toLocaleTimeString('fr-FR', { hour12: false }) || now.toTimeString().slice(0, 8);

      const ticketsCount = Math.floor(params.amount / ticketPrice);

      const allTickets: Ticket[] = await db.getAll('tickets');
      const uncoveredSoldTickets = allTickets
        .filter((t) => {
          const matchesPayer =
            t.assignedAgentId === params.agentId ||
            (agent.role === 'RESPONSABLE' && (t.assignedResponsableId === params.agentId || (agent.sectorId && t.sectorId === agent.sectorId)));
          return matchesPayer && (t.status === 'SOLD' || t.status === 'CONTROLLED') && !t.coveredByRemiseId;
        })
        .sort((a, b) => (a.soldAt || '').localeCompare(b.soldAt || ''));

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

      if (ticketsToCover.length > 0) {
        const tx = db.transaction('tickets', 'readwrite');
        const store = tx.objectStore('tickets');
        const updatedCoveredTickets = ticketsToCover.map((t) => ({ ...t, coveredByRemiseId: remiseId }));
        await Promise.all([...updatedCoveredTickets.map((t) => store.put(t)), tx.done]);
      }

      const allSales = await db.getAll('sales');
      const coveredSales = allSales.filter((s: any) => ticketIdsCovered.includes(s.ticketId));
      if (coveredSales.length > 0) {
        const salesTx = db.transaction('sales', 'readwrite');
        const salesStore = salesTx.objectStore('sales');
        const updatedCoveredSales = coveredSales.map((s: any) => ({ ...s, coveredByRemiseId: remiseId }));
        await Promise.all([...updatedCoveredSales.map((s: any) => salesStore.put(s)), salesTx.done]);
      }

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
    } finally {
      actionLocksRef.current.delete(lockKey);
    }
  }, [currentUser, ticketPrice, isOnline, actionLocksRef, recordAudit, refreshData]);

  const correctRemiseAdmin = useCallback(async (
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

    const lockKey = `correctRemiseAdmin:${remiseId}`;
    if (actionLocksRef.current.has(lockKey)) {
      throw new Error('Une correction est déjà en cours pour cette remise.');
    }
    actionLocksRef.current.add(lockKey);

    try {
      const db = await getDB();
      const remise = await db.get('remises', remiseId);
      if (!remise) throw new Error('Remise introuvable');

      const oldAmount = remise.amount;
      const oldNote = remise.note;
      const now = new Date();
      const nowIso = now.toISOString();
      const dateStr = nowIso.slice(0, 10);
      const timeStr = now.toLocaleTimeString('fr-FR', { hour12: false }) || now.toTimeString().slice(0, 8);

      const newHistoryEntry = {
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
      };

      const updatedRemise: Remise = {
        ...remise,
        amount: newAmount,
        note: normalizeText(newNote),
        ticketsCount: Math.floor(newAmount / ticketPrice),
        isCorrected: true,
        history: [...(remise.history || []), newHistoryEntry],
      };

      await db.put('remises', updatedRemise);

      await recordAudit(
        'REMISE_EXCEPTIONAL_CORRECTION',
        'Remise',
        remise.id,
        `Correction exceptionnelle de la remise ${remise.reference} : Ancien montant ${formatFCFA(oldAmount)} -> Nouveau montant ${formatFCFA(newAmount)}. Motif: ${reason}`,
        { amount: oldAmount, note: oldNote },
        { amount: newAmount, note: newNote }
      );

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
    } finally {
      actionLocksRef.current.delete(lockKey);
    }
  }, [currentUser, ticketPrice, isOnline, actionLocksRef, recordAudit, refreshData]);

  return {
    remises,
    setRemises,
    alerts,
    setAlerts,
    calculateFinancialAlerts,
    recordRemise,
    correctRemiseAdmin,
  };
}
