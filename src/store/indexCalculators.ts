import type { Ticket, Sale, User, Vehicle } from '../types';
import { normalizePlate } from '../utils/normalization';

/**
 * Fonctions pures d'indexation précalculée O(N) pour recherches instantanées O(1) en 0 ms
 * PORTUS — U.J.P.A.S. (Union des Jeunes du Port pour l'Assistance et la Sécurité)
 * Zone Portuaire & Industrielle d'Abidjan
 */

export interface VehiclePlateProfile {
  readonly plateNumber: string;
  readonly driverName?: string;
  readonly driverPhone?: string;
  readonly vehicleType?: string;
  readonly companyName?: string;
  readonly lastSoldAt?: string;
  readonly lastTicketNumber?: string;
  readonly lastExpiresAt?: string;
  readonly totalTicketsCount: number;
  readonly isFlaggedFraud: boolean;
  readonly flagReason?: string;
}

export interface PrecomputedIndexes {
  ticketByIdMap: Map<string, Ticket>;
  ticketByNumberMap: Map<string, Ticket>;
  ticketsByCarnetIdMap: Map<string, Ticket[]>;
  ticketsByAgentIdMap: Map<string, Ticket[]>;
  salesByTicketIdMap: Map<string, Sale>;
  salesByDayMap: Map<string, Sale[]>;
  salesByPlateMap: Map<string, Sale[]>;
  uncoveredTicketsByAgentIdMap: Map<string, Ticket[]>;
  availableAgentsList: User[];
  vehicleProfileByPlateMap: Map<string, VehiclePlateProfile>;
}

export function computeIndexes(
  tickets: Ticket[] = [],
  sales: Sale[] = [],
  users: User[] = [],
  vehicles: Vehicle[] = []
): PrecomputedIndexes {
  const ticketByIdMap = new Map<string, Ticket>();
  const ticketByNumberMap = new Map<string, Ticket>();
  const ticketsByCarnetIdMap = new Map<string, Ticket[]>();
  const ticketsByAgentIdMap = new Map<string, Ticket[]>();
  const uncoveredTicketsByAgentIdMap = new Map<string, Ticket[]>();
  const agentsWithActiveStockSet = new Set<string>();
  const vehicleProfileByPlateMap = new Map<string, VehiclePlateProfile>();

  // 1. Pré-remplissage à partir du registre des véhicules (public.vehicles)
  const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
  for (let i = 0; i < safeVehicles.length; i++) {
    const v = safeVehicles[i];
    if (!v || !v.plateNumber) continue;
    const normPlate = normalizePlate(v.plateNumber);
    if (!normPlate) continue;

    vehicleProfileByPlateMap.set(normPlate, {
      plateNumber: normPlate,
      driverName: v.driverName,
      driverPhone: v.driverPhone,
      vehicleType: v.vehicleType,
      companyName: v.companyName,
      lastSoldAt: v.lastSeenAt,
      totalTicketsCount: v.totalTicketsCount || 0,
      isFlaggedFraud: Boolean(v.isFlaggedFraud),
      flagReason: v.flagReason,
    });
  }

  // 2. Indexation des tickets (O(N))
  const safeTickets = Array.isArray(tickets) ? tickets : [];
  for (let i = 0; i < safeTickets.length; i++) {
    const t = safeTickets[i];
    if (!t || !t.id) continue;

    ticketByIdMap.set(t.id, t);
    if (t.ticketNumber) {
      ticketByNumberMap.set(t.ticketNumber, t);
    }

    if (t.carnetId) {
      let carnetList = ticketsByCarnetIdMap.get(t.carnetId);
      if (!carnetList) {
        carnetList = [];
        ticketsByCarnetIdMap.set(t.carnetId, carnetList);
      }
      carnetList.push(t);
    }

    if (t.assignedAgentId) {
      let agentList = ticketsByAgentIdMap.get(t.assignedAgentId);
      if (!agentList) {
        agentList = [];
        ticketsByAgentIdMap.set(t.assignedAgentId, agentList);
      }
      agentList.push(t);

      // Si l'agent détient un ticket non encore vendu (en cours d'écoulement)
      if (t.status === 'ASSIGNED_TO_AGENT') {
        agentsWithActiveStockSet.add(t.assignedAgentId);
      }

      if ((t.status === 'SOLD' || t.status === 'CONTROLLED') && !t.coveredByRemiseId) {
        let uncoveredList = uncoveredTicketsByAgentIdMap.get(t.assignedAgentId);
        if (!uncoveredList) {
          uncoveredList = [];
          uncoveredTicketsByAgentIdMap.set(t.assignedAgentId, uncoveredList);
        }
        uncoveredList.push(t);
      }
    }

    if (t.plateNumber && (t.status === 'SOLD' || t.status === 'CONTROLLED')) {
      const normPlate = normalizePlate(t.plateNumber);
      if (normPlate) {
        const existing = vehicleProfileByPlateMap.get(normPlate);
        const isNewer = !existing?.lastSoldAt || (t.soldAt && t.soldAt > existing.lastSoldAt);
        vehicleProfileByPlateMap.set(normPlate, {
          plateNumber: normPlate,
          driverName: (isNewer && t.driverName) || existing?.driverName,
          driverPhone: (isNewer && t.driverPhone) || existing?.driverPhone,
          vehicleType: existing?.vehicleType || 'CAMION_CITERNE',
          companyName: existing?.companyName,
          lastSoldAt: isNewer ? t.soldAt : existing?.lastSoldAt,
          lastTicketNumber: isNewer ? t.ticketNumber : existing?.lastTicketNumber,
          lastExpiresAt: isNewer ? t.expiresAt : existing?.lastExpiresAt,
          totalTicketsCount: Math.max((existing?.totalTicketsCount || 0) + 1, 1),
          isFlaggedFraud: Boolean(existing?.isFlaggedFraud),
          flagReason: existing?.flagReason,
        });
      }
    }
  }

  // 3. Indexation des ventes (O(M)) + enrichissement mémoire CEDEAO par plaque
  const salesByTicketIdMap = new Map<string, Sale>();
  const salesByDayMap = new Map<string, Sale[]>();
  const salesByPlateMap = new Map<string, Sale[]>();

  const safeSales = Array.isArray(sales) ? sales : [];
  for (let i = 0; i < safeSales.length; i++) {
    const s = safeSales[i];
    if (!s || !s.ticketId) continue;

    salesByTicketIdMap.set(s.ticketId, s);

    const dayKey = s.soldAt ? s.soldAt.slice(0, 10) : 'UNKNOWN';
    let dayList = salesByDayMap.get(dayKey);
    if (!dayList) {
      dayList = [];
      salesByDayMap.set(dayKey, dayList);
    }
    dayList.push(s);

    if (s.plateNumber) {
      const normPlate = normalizePlate(s.plateNumber);
      const plateKey = normPlate || s.plateNumber.toUpperCase().trim();
      let plateList = salesByPlateMap.get(plateKey);
      if (!plateList) {
        plateList = [];
        salesByPlateMap.set(plateKey, plateList);
      }
      plateList.push(s);

      if (normPlate) {
        const existing = vehicleProfileByPlateMap.get(normPlate);
        const isNewer = !existing?.lastSoldAt || (s.soldAt && s.soldAt >= existing.lastSoldAt);
        vehicleProfileByPlateMap.set(normPlate, {
          plateNumber: normPlate,
          driverName: (isNewer && s.driverName) || existing?.driverName,
          driverPhone: (isNewer && s.driverPhone) || existing?.driverPhone,
          vehicleType: (isNewer && s.vehicleCategory) || existing?.vehicleType || 'CAMION_CITERNE',
          companyName: existing?.companyName,
          lastSoldAt: isNewer ? s.soldAt : existing?.lastSoldAt,
          lastTicketNumber: isNewer ? s.ticketNumber : existing?.lastTicketNumber,
          lastExpiresAt: isNewer ? s.expiresAt : existing?.lastExpiresAt,
          totalTicketsCount: Math.max(existing?.totalTicketsCount || 0, plateList.length),
          isFlaggedFraud: Boolean(existing?.isFlaggedFraud),
          flagReason: existing?.flagReason,
        });
      }
    }
  }

  // 4. Pool global d'agents disponibles (libres de tout carnet/ticket actif en cours)
  const safeUsers = Array.isArray(users) ? users : [];
  const availableAgentsList: User[] = [];
  for (let i = 0; i < safeUsers.length; i++) {
    const u = safeUsers[i];
    if (u && u.role === 'AGENT' && u.isActive && !agentsWithActiveStockSet.has(u.id)) {
      availableAgentsList.push(u);
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
    availableAgentsList,
    vehicleProfileByPlateMap,
  };
}
