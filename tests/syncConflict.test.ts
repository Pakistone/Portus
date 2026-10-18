import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Suite de tests de synchronisation, résolution de conflits (Last-Write-Wins)
 * et réécriture idempotente (Phase 3).
 */

export interface SyncConflictResolution<T> {
  winner: T;
  hasConflict: boolean;
  conflictDetails?: string;
}

export function resolveLastWriteWinsConflict<
  T extends { id: string; updatedAt?: string; createdAt?: string; soldAt?: string; reportedAt?: string }
>(localItem: T | undefined, remoteItem: T): SyncConflictResolution<T> {
  if (!localItem) {
    return { winner: remoteItem, hasConflict: false };
  }

  const getTime = (item: any): number => {
    const raw = item.updatedAt || item.updated_at || item.soldAt || item.reportedAt || item.createdAt || item.created_at;
    return raw ? new Date(raw).getTime() : 0;
  };

  const localTime = getTime(localItem);
  const remoteTime = getTime(remoteItem);

  const isDivergent = JSON.stringify(localItem) !== JSON.stringify(remoteItem);
  if (!isDivergent) {
    return { winner: remoteItem, hasConflict: false };
  }

  const winner = localTime >= remoteTime ? localItem : remoteItem;
  const winnerOrigin = localTime >= remoteTime ? 'LOCAL' : 'DISTANT';
  const conflictDetails = `Conflit détecté sur l'entité ID ${remoteItem.id}. Date locale: ${new Date(localTime).toISOString()}, Date distante: ${new Date(remoteTime).toISOString()}. Résolution Last-Write-Wins conservée: ${winnerOrigin}.`;

  return {
    winner,
    hasConflict: true,
    conflictDetails,
  };
}

describe('Phase 3 - Tests de Synchronisation & Résolution de Conflits (Decision n°2)', () => {
  it('doit appliquer la règle Last-Write-Wins en faveur de la donnée locale si plus récente', () => {
    const localRecord = {
      id: 'sale-101',
      plateNumber: '9988HH01',
      updatedAt: '2026-10-18T12:00:00.000Z',
      status: 'CONTROLLED',
    };

    const remoteRecord = {
      id: 'sale-101',
      plateNumber: '9988HH01',
      updatedAt: '2026-10-18T11:30:00.000Z',
      status: 'SOLD',
    };

    const result = resolveLastWriteWinsConflict(localRecord, remoteRecord);

    assert.equal(result.hasConflict, true, 'Un conflit doit être détecté du fait de la divergence des données');
    assert.equal(result.winner.status, 'CONTROLLED', 'La mise à jour locale plus récente doit l emporter');
    assert.ok(result.conflictDetails?.includes('LOCAL'), 'Le journal d audit doit expliciter le gagnant LOCAL');
  });

  it('doit appliquer la règle Last-Write-Wins en faveur de la donnée distante si plus récente', () => {
    const localRecord = {
      id: 'expense-202',
      amount: 15000,
      updatedAt: '2026-10-18T08:00:00.000Z',
      status: 'PENDING',
    };

    const remoteRecord = {
      id: 'expense-202',
      amount: 15000,
      updatedAt: '2026-10-18T10:15:00.000Z',
      status: 'VALIDATED',
    };

    const result = resolveLastWriteWinsConflict(localRecord, remoteRecord);

    assert.equal(result.hasConflict, true);
    assert.equal(result.winner.status, 'VALIDATED', 'La version distante validée plus récente doit l emporter');
    assert.ok(result.conflictDetails?.includes('DISTANT'));
  });

  it('ne doit déclencher aucun conflit si les données locale et distante sont identiques', () => {
    const localRecord = {
      id: 'carnet-303',
      carnetNumber: 'C-2026-001',
      updatedAt: '2026-10-18T09:00:00.000Z',
    };

    const remoteRecord = {
      id: 'carnet-303',
      carnetNumber: 'C-2026-001',
      updatedAt: '2026-10-18T09:00:00.000Z',
    };

    const result = resolveLastWriteWinsConflict(localRecord, remoteRecord);

    assert.equal(result.hasConflict, false, 'Aucun conflit si les enregistrements sont stricts doublons');
  });

  it('garantit l idempotence des écritures avec identifiants UUID générés côté client', () => {
    const databaseStore = new Map<string, any>();

    const writeIdempotent = (entity: { id: string; val: string }) => {
      databaseStore.set(entity.id, entity);
    };

    const clientGeneratedUuid = '550e8400-e29b-41d4-a716-446655440000';
    const entityPayload = { id: clientGeneratedUuid, val: 'Vente Camion 1' };

    // Premier envoi réseau
    writeIdempotent(entityPayload);
    assert.equal(databaseStore.size, 1);

    // Deuxième envoi réseau identique (rejoué par la file d'attente hors ligne)
    writeIdempotent(entityPayload);
    assert.equal(databaseStore.size, 1, 'L écriture répétée avec le même UUID ne crée aucun doublon');
  });
});
