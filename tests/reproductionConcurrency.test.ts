import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Suite de tests de reproduction des problèmes de concurrence & benchmarks de performance (Phase 1)
 * Simule les scénarios Identifiés lors de la Phase 0 sans modifier le code source de production.
 */

describe('Phase 1 - Tests de Reproduction & Concurrence (Filet de Sécurité)', () => {
  it('Reproduction 1 : Double soumission concourante sans verrou in-memory', async () => {
    // Simulation d'une fonction d'action sans mutex (similaire à la situation actuelle de DataContext)
    let ticketStatus = 'ASSIGNED_TO_AGENT';
    const salesLog: string[] = [];

    // Sans verrou synchrone, deux appels lancés en même temps avec un petit delai d'E/S async (ex: DB read)
    const mockSellTicketUnsafe = async (saleId: string) => {
      // Étape 1 : Lecture async
      await new Promise((res) => setTimeout(res, 10)); 
      
      // Étape 2 : Vérification du statut
      if (ticketStatus === 'SOLD') {
        throw new Error('Ticket déjà vendu !');
      }

      // Étape 3 : Écriture async
      await new Promise((res) => setTimeout(res, 10));
      ticketStatus = 'SOLD';
      salesLog.push(saleId);
      return { success: true, saleId };
    };

    // Déclenchement de 2 clics simultanés (double-clic utilisateur)
    const promise1 = mockSellTicketUnsafe('sale-click-1');
    const promise2 = mockSellTicketUnsafe('sale-click-2');

    const results = await Promise.allSettled([promise1, promise2]);

    // CONSTAT : Les deux promesses réussissent parce qu'elles ont toutes deux lu 'ASSIGNED_TO_AGENT' avant l'écriture.
    const successfulSales = results.filter((r) => r.status === 'fulfilled');
    assert.equal(
      successfulSales.length,
      2,
      'REPRODUCTION CONFIRMÉE : Sans verrou synchrone, 2 ventes sont créées pour le même ticket'
    );
    assert.equal(salesLog.length, 2);
  });

  it('Reproduction 2 : Synchronisation concourante re-entrante', async () => {
    let isSyncingState = false; // state React simulé (mis à jour au re-rendu)
    let activeSyncJobs = 0;
    let maxSimultaneousJobs = 0;

    const mockSyncOfflineQueue = async () => {
      // Si la vérification repose uniquement sur un state React non encore re-rendu :
      if (isSyncingState) {
        return 'ABORTED';
      }

      // Mise à jour de l'état (asynchrone en React)
      activeSyncJobs++;
      maxSimultaneousJobs = Math.max(maxSimultaneousJobs, activeSyncJobs);

      // Traitement asynchrone
      await new Promise((res) => setTimeout(res, 25));

      activeSyncJobs--;
      return 'COMPLETED';
    };

    // Deux événements rapides (ex: retour réseau + clic sur rafraîchir avant le re-rendu de state)
    const syncCall1 = mockSyncOfflineQueue();
    const syncCall2 = mockSyncOfflineQueue();

    await Promise.all([syncCall1, syncCall2]);

    // CONSTAT : 2 tâches de synchro se sont exécutées en même temps
    assert.equal(
      maxSimultaneousJobs,
      2,
      'REPRODUCTION CONFIRMÉE : La synchro hors-ligne s\'exécute 2 fois simultanément sans verrou de ref'
    );
  });

  it('Reproduction 3 : Invalidation de session (logout) pendant une requête asynchrone', async () => {
    let currentUser: { id: string; name: string } | null = { id: 'usr-1', name: 'Agent Vridi' };
    let processedUserInResult: string | null = null;

    const mockLongRunningOperation = async () => {
      const userAtStart = currentUser;
      await new Promise((res) => setTimeout(res, 30));

      // Si l'opération ne vérifie pas l'annulation de session à la fin :
      processedUserInResult = userAtStart ? userAtStart.id : null;
    };

    const opPromise = mockLongRunningOperation();

    // L'utilisateur clique sur Se Déconnecter pendant le traitement
    currentUser = null;

    await opPromise;

    // CONSTAT : L'opération s'est achevée avec l'ancien ID utilisateur malgré le logout
    assert.equal(
      processedUserInResult,
      'usr-1',
      'REPRODUCTION CONFIRMÉE : L\'opération s\'est terminée avec une session utilisateur périmée'
    );
  });

  it('Benchmark de performance : Calculs d\'index et filtrages imbriqués (Mesure de référence)', () => {
    const ticketCount = 3000;
    const userCount = 50;

    // Génération de fausses données
    const mockTickets = Array.from({ length: ticketCount }, (_, i) => ({
      id: `tkt-${i}`,
      ticketNumber: `VRD-${String(i).padStart(6, '0')}`,
      assignedAgentId: `usr-${i % userCount}`,
      status: i % 3 === 0 ? 'SOLD' : 'ASSIGNED_TO_AGENT',
    }));

    const mockAgents = Array.from({ length: userCount }, (_, i) => ({
      id: `usr-${i}`,
      role: 'AGENT',
      isActive: true,
    }));

    // Mesure de l'approche actuelle : parcours imbriqué O(U * T)
    const startTimeOUN = performance.now();
    const alerts: any[] = [];
    mockAgents.forEach((agent) => {
      const agentSold = mockTickets.filter(
        (t) => t.assignedAgentId === agent.id && t.status === 'SOLD'
      );
      if (agentSold.length > 10) {
        alerts.push({ agentId: agent.id, count: agentSold.length });
      }
    });
    const endTimeOUN = performance.now();
    const durationUnindexed = endTimeOUN - startTimeOUN;

    // Mesure de l'approche optimisée : index précalculé O(T + U)
    const startTimeIndexed = performance.now();
    const ticketsByAgentAndStatus: Record<string, number> = {};
    for (let i = 0; i < mockTickets.length; i++) {
      const t = mockTickets[i];
      if (t.status === 'SOLD') {
        ticketsByAgentAndStatus[t.assignedAgentId] = (ticketsByAgentAndStatus[t.assignedAgentId] || 0) + 1;
      }
    }
    const alertsIndexed: any[] = [];
    for (let i = 0; i < mockAgents.length; i++) {
      const count = ticketsByAgentAndStatus[mockAgents[i].id] || 0;
      if (count > 10) {
        alertsIndexed.push({ agentId: mockAgents[i].id, count });
      }
    }
    const endTimeIndexed = performance.now();
    const durationIndexed = endTimeIndexed - startTimeIndexed;

    // Vérifier l'équivalence des résultats
    assert.equal(alerts.length, alertsIndexed.length);

    console.log(`[BENCHMARK BASELINE] Filtrage non indexé O(U*T) : ${durationUnindexed.toFixed(3)} ms`);
    console.log(`[BENCHMARK OPTIMISÉ] Filtrage par Map/Index O(T+U) : ${durationIndexed.toFixed(3)} ms`);
    assert.ok(durationIndexed <= durationUnindexed, 'L\'indexation doit être plus rapide ou égale');
  });
});
