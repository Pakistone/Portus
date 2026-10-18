import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { usePortusStore } from '../src/store/usePortusStore';
import { computeIndexes } from '../src/store/indexCalculators';
import type { Ticket, Sale } from '../src/types';

describe('Phase 4A - Store Zustand & Indexation Précalculée (Sélecteurs & Performance)', () => {
  it('doit précalculer les index O(1) pour les tickets et les ventes', () => {
    const mockTickets: Ticket[] = [
      {
        id: 'tkt-uuid-1',
        ticketNumber: 'VRD-000001',
        carnetId: 'carnet-1',
        carnetNumber: 'C-2026-001',
        status: 'SOLD',
        price: 5000,
        assignedAgentId: 'agent-1',
        controlCount: 0,
        createdAt: '2026-10-18T10:00:00Z',
      },
      {
        id: 'tkt-uuid-2',
        ticketNumber: 'VRD-000002',
        carnetId: 'carnet-1',
        carnetNumber: 'C-2026-001',
        status: 'ASSIGNED_TO_AGENT',
        price: 5000,
        assignedAgentId: 'agent-1',
        controlCount: 0,
        createdAt: '2026-10-18T10:00:00Z',
      },
    ];

    const mockSales: Sale[] = [
      {
        id: 'sale-uuid-1',
        ticketId: 'tkt-uuid-1',
        ticketNumber: 'VRD-000001',
        agentId: 'agent-1',
        agentName: 'Kouassi Agent',
        plateNumber: '1234HZ01',
        soldAt: '2026-10-18T10:15:00Z',
        syncStatus: 'SYNCED',
        price: 5000,
      },
    ];

    const indexes = computeIndexes(mockTickets, mockSales);

    // Vérification de la recherche O(1) par ID
    const foundById = indexes.ticketByIdMap.get('tkt-uuid-1');
    assert.equal(foundById?.ticketNumber, 'VRD-000001');

    // Vérification du regroupement O(1) par Carnet ID
    const ticketsCarnet = indexes.ticketsByCarnetIdMap.get('carnet-1');
    assert.equal(ticketsCarnet?.length, 2);

    // Vérification du regroupement O(1) par Jour de Vente
    const salesToday = indexes.salesByDayMap.get('2026-10-18');
    assert.equal(salesToday?.length, 1);
    assert.equal(salesToday?.[0].plateNumber, '1234HZ01');
  });

  it('doit mettre à jour le store Zustand de manière atomique', () => {
    const store = usePortusStore.getState();

    store.setAllData({
      ticketPrice: 5000,
      pendingSyncCount: 3,
    });

    const updatedState = usePortusStore.getState();
    assert.equal(updatedState.ticketPrice, 5000);
    assert.equal(updatedState.pendingSyncCount, 3);
  });
});
