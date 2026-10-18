import type { Ticket, Sale } from '../types';

/**
 * Fonctions pures d'indexation précalculée O(N) pour éliminer les parcours imbriqués O(N*M)
 */

export interface PrecomputedIndexes {
  ticketByIdMap: Map<string, Ticket>;
  ticketByNumberMap: Map<string, Ticket>;
  ticketsByCarnetIdMap: Map<string, Ticket[]>;
  ticketsByAgentIdMap: Map<string, Ticket[]>;
  salesByTicketIdMap: Map<string, Sale>;
  salesByDayMap: Map<string, Sale[]>;
  salesByPlateMap: Map<string, Sale[]>;
  uncoveredTicketsByAgentIdMap: Map<string, Ticket[]>;
}

export function computeIndexes(tickets: Ticket[], sales: Sale[]): PrecomputedIndexes {
  const ticketByIdMap = new Map<string, Ticket>();
  const ticketByNumberMap = new Map<string, Ticket>();
  const ticketsByCarnetIdMap = new Map<string, Ticket[]>();
  const ticketsByAgentIdMap = new Map<string, Ticket[]>();
  const uncoveredTicketsByAgentIdMap = new Map<string, Ticket[]>();

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    ticketByIdMap.set(t.id, t);
    if (t.ticketNumber) {
      ticketByNumberMap.set(t.ticketNumber, t);
    }

    // Index par carnet
    if (t.carnetId) {
      let carnetList = ticketsByCarnetIdMap.get(t.carnetId);
      if (!carnetList) {
        carnetList = [];
        ticketsByCarnetIdMap.set(t.carnetId, carnetList);
      }
      carnetList.push(t);
    }

    // Index par agent
    if (t.assignedAgentId) {
      let agentList = ticketsByAgentIdMap.get(t.assignedAgentId);
      if (!agentList) {
        agentList = [];
        ticketsByAgentIdMap.set(t.assignedAgentId, agentList);
      }
      agentList.push(t);

      // Index tickets vendus non couverts par une remise
      if ((t.status === 'SOLD' || t.status === 'CONTROLLED') && !t.coveredByRemiseId) {
        let uncoveredList = uncoveredTicketsByAgentIdMap.get(t.assignedAgentId);
        if (!uncoveredList) {
          uncoveredList = [];
          uncoveredTicketsByAgentIdMap.set(t.assignedAgentId, uncoveredList);
        }
        uncoveredList.push(t);
      }
    }
  }

  const salesByTicketIdMap = new Map<string, Sale>();
  const salesByDayMap = new Map<string, Sale[]>();
  const salesByPlateMap = new Map<string, Sale[]>();

  for (let i = 0; i < sales.length; i++) {
    const s = sales[i];
    salesByTicketIdMap.set(s.ticketId, s);

    // Index par jour (YYYY-MM-DD)
    const dayKey = s.soldAt ? s.soldAt.slice(0, 10) : 'UNKNOWN';
    let dayList = salesByDayMap.get(dayKey);
    if (!dayList) {
      dayList = [];
      salesByDayMap.set(dayKey, dayList);
    }
    dayList.push(s);

    // Index par plaque
    if (s.plateNumber) {
      const plateKey = s.plateNumber.toUpperCase();
      let plateList = salesByPlateMap.get(plateKey);
      if (!plateList) {
        plateList = [];
        salesByPlateMap.set(plateKey, plateList);
      }
      plateList.push(s);
    }
  }

  return {
    ticketByIdMap,
    ticketByNumberMap,
    ticketsByCarnetIdMap,
    ticketsByAgentIdMap,
    salesByTicketIdMap,
    salesByDayMap,
    salesByPlateMap,
    uncoveredTicketsByAgentIdMap,
  };
}
