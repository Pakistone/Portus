import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSectorId } from '../src/db/supabaseService';
import type { User, Ticket } from '../src/types';

describe('Suite de Tests — Visibilité des Agents pour Responsable (Bayala)', () => {
  const sampleUsers: User[] = [
    {
      id: 'usr-bayala',
      username: 'bayala',
      fullName: 'BAYALA KOUASSI',
      role: 'RESPONSABLE',
      sectorId: 'sec-vridi-canal',
      sectorName: 'VRIDI CANAL / PONT',
      isActive: true,
      failedAttempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr-agent-1',
      username: 'agent1',
      fullName: 'AGENT KONAN',
      role: 'AGENT',
      sectorId: '3a87f0f7-6141-45c2-a8c8-028d3b6cd734', // UUID Vridi Port
      sectorName: 'VRIDI PORT / TERMINAL',
      isActive: true,
      failedAttempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr-agent-2',
      username: 'agent2',
      fullName: 'AGENT KOUAME',
      role: 'AGENT',
      sectorId: 'sec-vridi-canal',
      sectorName: 'VRIDI CANAL / PONT',
      isActive: true,
      failedAttempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr-agent-3',
      username: 'agent3',
      fullName: 'AGENT YAO INACTIF',
      role: 'AGENT',
      sectorId: 'sec-vridi-canal',
      sectorName: 'VRIDI CANAL / PONT',
      isActive: false,
      failedAttempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const sampleTickets: Ticket[] = [];

  it('doit normaliser correctement les identifiants de secteur UUID et textes', () => {
    assert.equal(normalizeSectorId('3a87f0f7-6141-45c2-a8c8-028d3b6cd734'), 'sec-vridi-port');
    assert.equal(normalizeSectorId(null, 'VRIDI PORT / TERMINAL'), 'sec-vridi-port');
    assert.equal(normalizeSectorId(null, 'VRIDI CANAL / PONT'), 'sec-vridi-canal');
    assert.equal(normalizeSectorId('sec-vridi-zi'), 'sec-vridi-zi');
  });

  it('doit retourner les agents rattachés au secteur du responsable Bayala', () => {
    const currentUser = sampleUsers[0]; // Bayala (VRIDI CANAL)
    const respSector = normalizeSectorId(currentUser.sectorId, currentUser.sectorName);

    const activeAgents = sampleUsers.filter((u) => u.role === 'AGENT' && u.isActive !== false);

    const matched = activeAgents.filter((u) => {
      const agentSector = normalizeSectorId(u.sectorId, u.sectorName);
      if (agentSector && agentSector === respSector) return true;
      if (u.sectorId && (u.sectorId === currentUser.sectorId || u.sectorId === respSector)) return true;

      const hasTicketsWithResp = sampleTickets.some(
        (t) =>
          t.assignedAgentId === u.id &&
          (t.assignedResponsableId === currentUser.id ||
            normalizeSectorId(t.sectorId) === respSector)
      );
      if (hasTicketsWithResp) return true;

      if (!agentSector && !u.sectorId) return true;

      return false;
    });

    const finalAgents = matched.length > 0 ? matched : activeAgents;

    // L'agent 2 (actif, même secteur Vridi Canal) doit être présent
    assert.ok(finalAgents.some((a) => a.id === 'usr-agent-2'));
    // L'agent 3 (inactif) ne doit jamais être présent
    assert.ok(!finalAgents.some((a) => a.id === 'usr-agent-3'));
  });

  it('doit basculer sur le repli réseau (tous les agents actifs) si aucun agent n’est rattaché au secteur', () => {
    const bayalaEmptySector: User = {
      ...sampleUsers[0],
      sectorId: 'sec-vridi-sir', // Secteur Vridi Raffinerie / SIR sans agent dédié
      sectorName: 'VRIDI RAFFINERIE / SIR',
    };

    const respSector = normalizeSectorId(bayalaEmptySector.sectorId, bayalaEmptySector.sectorName);
    const activeAgents = sampleUsers.filter((u) => u.role === 'AGENT' && u.isActive !== false);

    const matched = activeAgents.filter((u) => {
      const agentSector = normalizeSectorId(u.sectorId, u.sectorName);
      if (agentSector && agentSector === respSector) return true;
      if (u.sectorId && (u.sectorId === bayalaEmptySector.sectorId || u.sectorId === respSector)) return true;
      return false;
    });

    const finalAgents = matched.length > 0 ? matched : activeAgents;

    // Grâce au repli réseau, Bayala ne voit pas un écran vide (0 agent)
    assert.ok(finalAgents.length > 0, 'Bayala doit voir les agents du réseau grâce au repli');
    assert.ok(finalAgents.some((a) => a.id === 'usr-agent-1'));
    assert.ok(finalAgents.some((a) => a.id === 'usr-agent-2'));
  });
});
