import { useState, useCallback, MutableRefObject } from 'react';
import type {
  Remise,
  Ticket,
  Sale,
  User,
  Carnet,
  FinancialAlert,
  RemiseHistoryEntry,
} from '../../../types';
import {
  TICKET_PRICE_FCFA,
  ALERT_INITIAL_THRESHOLD,
  ALERT_STEP_THRESHOLD,
} from '../../../config/constants';
import { getDB } from '../../../db/indexedDb';
import { formatFCFA, normalizeText } from '../../../utils/normalization';
import { generateUUID } from '../../../utils/uuid';
import { SupabaseDataLayer, type RemittanceAdjustment } from '../../../db/supabaseService';
import { usePortusStore } from '../../../store/usePortusStore';

/**
 * Règle métier stricte U.J.P.A.S. pour l'éligibilité d'encaissement des remises :
 * - Aucun blocage par secteur (toute vérification de sectorId / sector_id supprimée définitivement).
 * - Si l'utilisateur connecté est ADMINISTRATEUR ou RESPONSABLE, il est autorisé à enregistrer une remise
 *   pour un agent dès lors que cet agent a des tickets vendus non couverts
 *   ((status === 'SOLD' || status === 'CONTROLLED') && !coveredByRemiseId),
 *   en prenant en priorité les tickets issus des carnets attribués par ce responsable.
 */
export function isTicketEligibleForRemiseByActor(
  ticket: Ticket,
  carnets: Carnet[],
  actor: User | null
): boolean {
  if (!actor) return false;
  if (actor.role === 'ADMINISTRATEUR') return true;
  if (actor.role !== 'RESPONSABLE') return false;

  const carnet = carnets.find((c) => c.id === ticket.carnetId);
  const carnetRespId =
    carnet?.assignedToResponsableId ||
    (carnet as unknown as { assignedResponsableId?: string })?.assignedResponsableId;
  const ticketRespId = ticket.assignedResponsableId;

  if (ticketRespId === actor.id || carnetRespId === actor.id) {
    return true;
  }

  if (!ticketRespId && !carnetRespId) {
    return true;
  }

  return false;
}

/**
 * Retourne tous les tickets vendus non couverts d'un agent, en prenant en priorité
 * les tickets issus des carnets attribués au responsable connecté.
 */
export function prioritizeUncoveredTicketsForActor(
  uncoveredTickets: Ticket[],
  carnets: Carnet[],
  actor: User | null
): Ticket[] {
  if (!actor) return [];
  if (actor.role === 'ADMINISTRATEUR') {
    return [...uncoveredTickets].sort((a, b) => (a.soldAt || '').localeCompare(b.soldAt || ''));
  }
  if (actor.role !== 'RESPONSABLE') return [];

  const getPriority = (ticket: Ticket): number => {
    const carnet = carnets.find((c) => c.id === ticket.carnetId);
    const carnetRespId =
      carnet?.assignedToResponsableId ||
      (carnet as unknown as { assignedResponsableId?: string })?.assignedResponsableId;
    const ticketRespId = ticket.assignedResponsableId;

    if (carnetRespId === actor.id || ticketRespId === actor.id) return 0; // Priorité 1 : Carnet/ticket du responsable
    if (!carnetRespId && !ticketRespId) return 1; // Priorité 2 : Non renseigné
    return 2; // Priorité 3 : Autre ticket vendu non couvert de l'agent
  };

  return [...uncoveredTickets].sort((a, b) => {
    const prioDiff = getPriority(a) - getPriority(b);
    if (prioDiff !== 0) return prioDiff;
    return (a.soldAt || '').localeCompare(b.soldAt || '');
  });
}

export function useRemittances(
  currentUser: User | null,
  ticketPrice: number = TICKET_PRICE_FCFA,
  isOnline: boolean = true,
  recordAudit: (
    action: any,
    entity: string,
    id: string,
    details?: string,
    oldVal?: any,
    newVal?: any
  ) => Promise<void>,
  refreshData: (forceSync?: boolean) => Promise<void>,
  actionLocksRef?: MutableRefObject<Set<string>>
) {
  const [remises, setRemises] = useState<Remise[]>([]);
  const [alerts, setAlerts] = useState<FinancialAlert[]>([]);

  const calculateFinancialAlerts = useCallback(
    (allUsers: User[], allTickets: Ticket[], allRemises: Remise[]) => {
      const effectivePrice = ticketPrice || TICKET_PRICE_FCFA;
      const activeAgents = allUsers.filter((u) => u.role === 'AGENT' && u.isActive);
      const computedAlerts: FinancialAlert[] = [];

      for (const agent of activeAgents) {
        const agentSoldCount = allTickets.filter(
          (t) =>
            t.assignedAgentId === agent.id &&
            (t.status === 'SOLD' || t.status === 'CONTROLLED')
        ).length;

        const expectedAmount = agentSoldCount * effectivePrice;
        const remittedAmount = allRemises
          .filter((r) => r.agentId === agent.id)
          .reduce((sum, r) => sum + r.amount, 0);

        const unremittedAmount = Math.max(0, expectedAmount - remittedAmount);
        const unremittedTicketsCount = Math.floor(unremittedAmount / effectivePrice);

        if (unremittedTicketsCount >= ALERT_INITIAL_THRESHOLD) {
          const extraSteps = Math.floor(
            (unremittedTicketsCount - ALERT_INITIAL_THRESHOLD) / ALERT_STEP_THRESHOLD
          );
          const thresholdPassed =
            ALERT_INITIAL_THRESHOLD + extraSteps * ALERT_STEP_THRESHOLD;

          computedAlerts.push({
            id: `alert-${agent.id}`,
            agentId: agent.id,
            agentName: agent.fullName,
            sectorId: agent.sectorId || 'pool-global',
            sectorName: agent.sectorName || 'Pool Mobile U.J.P.A.S.',
            unremittedTicketsCount,
            unremittedAmount,
            thresholdPassed,
            level: unremittedTicketsCount >= 20 ? 'CRITICAL' : 'WARNING',
            createdAt: new Date().toISOString(),
          });
        }
      }

      computedAlerts.sort((a, b) => b.unremittedAmount - a.unremittedAmount);
      setAlerts(computedAlerts);
      usePortusStore.getState().setAllData({ alerts: computedAlerts });
    },
    [ticketPrice]
  );

  const recordRemise = useCallback(
    async (input: {
      agentId: string;
      amount: number;
      note?: string;
      date?: string;
      time?: string;
    }): Promise<Remise> => {
      if (!currentUser) {
        throw new Error('Authentification requise pour enregistrer une remise.');
      }

      if (currentUser.role !== 'RESPONSABLE' && currentUser.role !== 'ADMINISTRATEUR') {
        throw new Error(
          'Accès refusé : Seuls les responsables et les administrateurs peuvent enregistrer et encaisser une remise.'
        );
      }

      const effectivePrice = ticketPrice || TICKET_PRICE_FCFA;
      const numAmount = Number(input.amount);

      if (!numAmount || numAmount <= 0) {
        throw new Error('Le montant de la remise doit être supérieur à 0 FCFA.');
      }

      if (numAmount % effectivePrice !== 0) {
        throw new Error(
          `Le montant doit être un multiple exact de ${formatFCFA(effectivePrice)} (prix unitaire du ticket).`
        );
      }

      const lockKey = `remise:${input.agentId}`;
      if (actionLocksRef?.current.has(lockKey)) {
        throw new Error('Un encaissement est déjà en cours pour cet agent. Veuillez patienter.');
      }
      actionLocksRef?.current.add(lockKey);

      try {
        const db = await getDB();
        const [allUsers, allCarnets, allTickets, allSales, allRemises] = await Promise.all([
          db.getAll('users'),
          db.getAll('carnets'),
          db.getAll('tickets'),
          db.getAll('sales'),
          db.getAll('remises'),
        ]);

        const storeState = usePortusStore.getState();
        const agent =
          allUsers.find((u) => u.id === input.agentId) ||
          storeState.users.find((u) => u.id === input.agentId);

        if (!agent) {
          throw new Error('Agent introuvable.');
        }

        // Tous les tickets vendus non couverts de l'agent (aucune restriction par secteur)
        const allUncoveredAgentTickets = allTickets.filter(
          (t) =>
            t.assignedAgentId === input.agentId &&
            (t.status === 'SOLD' || t.status === 'CONTROLLED') &&
            !t.coveredByRemiseId
        );

        // Application de la règle métier :
        // ADMINISTRATEUR ou RESPONSABLE est autorisé à enregistrer une remise dès lors que l'agent
        // a des tickets vendus non couverts, en prenant en priorité les tickets issus des carnets attribués par ce responsable.
        const eligibleSoldTickets = prioritizeUncoveredTicketsForActor(
          allUncoveredAgentTickets,
          allCarnets,
          currentUser
        );

        // Calcul du solde restant global de l'agent au cas où des tickets ont été vendus sans flag individuel
        const totalAgentSoldCount = allTickets.filter(
          (t) =>
            t.assignedAgentId === input.agentId &&
            (t.status === 'SOLD' || t.status === 'CONTROLLED')
        ).length;
        const totalAgentRemitted = allRemises
          .filter((r) => r.agentId === input.agentId)
          .reduce((sum, r) => sum + r.amount, 0);
        const globalRemainingBalance = Math.max(
          0,
          totalAgentSoldCount * effectivePrice - totalAgentRemitted
        );
        const maxExpectedForUncovered = Math.max(
          eligibleSoldTickets.length * effectivePrice,
          globalRemainingBalance
        );

        if (maxExpectedForUncovered <= 0 && currentUser.role !== 'ADMINISTRATEUR') {
          throw new Error(
            `Cet agent n'a aucun ticket vendu en attente de remise (Solde restant : 0 FCFA).`
          );
        }

        if (maxExpectedForUncovered > 0 && numAmount > maxExpectedForUncovered) {
          throw new Error(
            `Le montant saisi (${formatFCFA(numAmount)}) dépasse le solde restant à remettre de l'agent (${formatFCFA(maxExpectedForUncovered)}).`
          );
        }

        const ticketsCoveredCount = Math.floor(numAmount / effectivePrice);
        const coveredTickets = eligibleSoldTickets.slice(0, ticketsCoveredCount);
        const coveredIds = coveredTickets.map((t) => t.id);
        const coveredIdSet = new Set(coveredIds);

        const now = new Date();
        const nowIso = now.toISOString();
        const dateStr = input.date || nowIso.split('T')[0];
        const timeStr = input.time || now.toLocaleTimeString('fr-FR', { hour12: false });

        const remiseId = generateUUID();
        const reference = `REM-${now.getFullYear()}-${String(allRemises.length + 1).padStart(4, '0')}`;

        const newRemise: Remise = {
          id: remiseId,
          reference,
          agentId: agent.id,
          agentName: agent.fullName,
          responsableId: currentUser.id,
          responsableName: currentUser.fullName,
          sectorId: currentUser.sectorId || agent.sectorId || 'pool-global',
          sectorName: currentUser.sectorName || agent.sectorName || 'Pool Mobile U.J.P.A.S.',
          amount: numAmount,
          status: 'VALIDATED',
          date: dateStr,
          time: timeStr,
          createdAt: nowIso,
          note: input.note ? normalizeText(input.note) : 'Versement régulier espèces',
          ticketIdsCovered: coveredIds,
          ticketsCount: ticketsCoveredCount,
          isCorrected: false,
          history: [],
        };

        // 1. Mise à jour immédiate dans IndexedDB (remise + tickets + sales)
        await db.put('remises', newRemise);

        for (const ct of coveredTickets) {
          const updatedTicket: Ticket = {
            ...ct,
            coveredByRemiseId: remiseId,
          };
          await db.put('tickets', updatedTicket);
        }

        for (const s of allSales) {
          if (coveredIdSet.has(s.ticketId)) {
            const updatedSale: Sale = {
              ...s,
              coveredByRemiseId: remiseId,
            };
            await db.put('sales', updatedSale);
          }
        }

        // 2. Mise à jour immédiate dans Zustand (usePortusStore) et l'état React
        const nextTickets = allTickets.map((t) =>
          coveredIdSet.has(t.id) ? { ...t, coveredByRemiseId: remiseId } : t
        );
        const nextSales = allSales.map((s) =>
          coveredIdSet.has(s.ticketId) ? { ...s, coveredByRemiseId: remiseId } : s
        );
        const nextRemises = [newRemise, ...allRemises];

        setRemises(nextRemises);
        usePortusStore.getState().setAllData({
          remises: nextRemises,
          tickets: nextTickets,
          sales: nextSales,
        });

        calculateFinancialAlerts(allUsers, nextTickets, nextRemises);

        // 3. Synchronisation immédiate dans Supabase (remittances + tickets + sales)
        if (SupabaseDataLayer.isAvailable()) {
          SupabaseDataLayer.insertRemittance(newRemise).catch((err) =>
            console.warn('Supabase insertRemittance error:', err)
          );
        }

        await recordAudit(
          'REMISE_RECORDED',
          'Remise',
          remiseId,
          `Versement ${reference} de ${formatFCFA(numAmount)} par l’agent ${agent.fullName} encaissé par ${currentUser.fullName} (${ticketsCoveredCount} tickets couverts)`
        );

        await refreshData();
        return newRemise;
      } finally {
        actionLocksRef?.current.delete(lockKey);
      }
    },
    [currentUser, ticketPrice, isOnline, calculateFinancialAlerts, recordAudit, refreshData, actionLocksRef]
  );

  const correctRemiseAdmin = useCallback(
    async (
      remiseId: string,
      newAmount: number,
      newNote: string,
      reason: string
    ): Promise<void> => {
      if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
        throw new Error('Seul l’administrateur peut modifier ou corriger une remise.');
      }

      if (!reason || reason.trim().length < 3) {
        throw new Error('Un motif explicite est obligatoire pour toute correction de remise.');
      }

      const effectivePrice = ticketPrice || TICKET_PRICE_FCFA;
      if (newAmount <= 0 || newAmount % effectivePrice !== 0) {
        throw new Error(
          `Le nouveau montant doit être un multiple strict de ${formatFCFA(effectivePrice)}.`
        );
      }

      const db = await getDB();
      const existing = await db.get('remises', remiseId);
      if (!existing) {
        throw new Error('Remise introuvable.');
      }

      const oldAmount = existing.amount;
      const oldNote = existing.note;
      const now = new Date();
      const nowIso = now.toISOString();

      const historyEntry: RemiseHistoryEntry = {
        id: generateUUID(),
        modifiedAt: nowIso,
        modifiedById: currentUser.id,
        modifiedByName: currentUser.fullName,
        date: nowIso.split('T')[0],
        time: now.toLocaleTimeString('fr-FR', { hour12: false }),
        reason: normalizeText(reason),
        oldAmount,
        newAmount,
        oldNote,
        newNote: newNote ? normalizeText(newNote) : oldNote,
      };

      const updatedRemise: Remise = {
        ...existing,
        amount: newAmount,
        ticketsCount: Math.floor(newAmount / effectivePrice),
        note: newNote ? normalizeText(newNote) : existing.note,
        isCorrected: true,
        history: [...(existing.history || []), historyEntry],
      };

      await db.put('remises', updatedRemise);

      if (SupabaseDataLayer.isAvailable()) {
        const adjustment: RemittanceAdjustment = {
          id: historyEntry.id,
          remittanceId: existing.id,
          adminId: currentUser.id,
          reason: historyEntry.reason,
          oldAmount,
          newAmount,
          oldNote,
          newNote: updatedRemise.note,
          adjustedAt: nowIso,
        };
        SupabaseDataLayer.recordRemittanceAdjustment(adjustment).catch((err) =>
          console.warn('Supabase recordRemittanceAdjustment error:', err)
        );
      }

      await recordAudit(
        'REMISE_EXCEPTIONAL_CORRECTION',
        'Remise',
        existing.id,
        `Correction administrative de la remise ${existing.reference} : ${formatFCFA(oldAmount)} → ${formatFCFA(newAmount)}. Motif : ${historyEntry.reason}`,
        { amount: oldAmount, note: oldNote },
        { amount: newAmount, note: updatedRemise.note, reason: historyEntry.reason }
      );

      await refreshData();
    },
    [currentUser, ticketPrice, recordAudit, refreshData]
  );

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
