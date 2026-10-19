import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { usePortusStore } from '../src/store/usePortusStore';

describe('Phase 4B - Actions Store Zustand & Intégrité (Décision n°1)', () => {
  it('doit pouvoir mettre à jour le prix du ticket et les compteurs de synchronisation', () => {
    const store = usePortusStore.getState();

    store.setTicketPrice(5000);
    store.setIsSyncing(true);
    store.setPendingSyncCount(5);

    const updated = usePortusStore.getState();
    assert.equal(updated.ticketPrice, 5000);
    assert.equal(updated.isSyncing, true);
    assert.equal(updated.pendingSyncCount, 5);

    // Nettoyage
    store.setIsSyncing(false);
    store.setPendingSyncCount(0);
  });

  it('doit maintenir la cohérence des index après modification des tickets', () => {
    const store = usePortusStore.getState();

    store.setAllData({
      tickets: [
        {
          id: 'tkt-test-1',
          ticketNumber: 'VRD-000001',
          carnetId: 'c-1',
          carnetNumber: 'C-2026-001',
          qrPayload: 'test-qr',
          status: 'AVAILABLE',
          price: 5000,
          controlCount: 0,
          createdAt: new Date().toISOString(),
        },
      ],
      sales: [],
    });

    const indexes = usePortusStore.getState().indexes;
    assert.ok(indexes.ticketByIdMap.has('tkt-test-1'));
    assert.equal(indexes.ticketByNumberMap.get('VRD-000001')?.status, 'AVAILABLE');
  });
});
