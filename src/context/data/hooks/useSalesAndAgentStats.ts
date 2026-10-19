import { useState, useCallback } from 'react';
import type { Sale, Ticket, User, PortusPaymentMethod, Remise } from '../../../types';
import type { DuplicateCheckResult } from '../types';
import { TICKET_PRICE_FCFA, ACTIVE_TICKET_VALIDITY_MS } from '../../../config/constants';
import { getDB } from '../../../db/indexedDb';
import { normalizePlate, normalizePhone, formatFCFA } from '../../../utils/normalization';
import { getCurrentCoordinates } from '../../../utils/geolocation';
import { generateUUID } from '../../../utils/uuid';
import { SupabaseDataLayer } from '../../../db/supabaseService';

export function useSalesAndAgentStats(
  currentUser: User | null,
  tickets: Ticket[],
  users: User[],
  remises: Remise[],
  isOnline: boolean,
  recordAudit: (action: any, entity: string, id: string, details?: string, oldVal?: any, newVal?: any) => Promise<void>,
  refreshData: (forceSync?: boolean) => Promise<void>,
  notifySaleSynced: (sale: Sale, database: any) => Promise<void>,
  upsertVehicle: (vehicleData: Partial<any> & { plateNumber: string }) => Promise<any>,
  setLastSyncedSaleNumber: (num: string | null) => void,
  actionLocksRef: React.MutableRefObject<Set<string>>
) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [ticketPrice, setTicketPrice] = useState<number>(TICKET_PRICE_FCFA);

  const updateTicketPrice = useCallback(async (newPrice: number) => {
    if (newPrice <= 0) {
      throw new Error('Le prix du ticket doit être strictement supérieur à zéro.');
    }
    const db = await getDB();
    await db.put('settings', newPrice, 'ticket_price');
    setTicketPrice(newPrice);

    await recordAudit(
      'CONFIG_UPDATE',
      'System',
      'ticket-price',
      `Modification du prix unitaire du ticket : ${formatFCFA(newPrice)}`,
      { price: ticketPrice },
      { price: newPrice }
    );
    await refreshData();
  }, [ticketPrice, recordAudit, refreshData]);

  const checkDuplicatePlate = useCallback((plateRaw: string): DuplicateCheckResult => {
    const cleanPlate = normalizePlate(plateRaw);
    if (!cleanPlate) {
      return { hasActiveTicket: false, activeTicket: null, daysRemaining: 0 };
    }

    const now = Date.now();
    const activeMatch = tickets.find((t) => {
      if (t.status !== 'SOLD' || t.isSuperseded) return false;
      if (normalizePlate(t.plateNumber || '') !== cleanPlate) return false;
      if (!t.soldAt) return false;

      const saleTime = new Date(t.soldAt).getTime();
      const diffMs = now - saleTime;
      return diffMs < ACTIVE_TICKET_VALIDITY_MS;
    });

    if (activeMatch && activeMatch.soldAt) {
      const saleTime = new Date(activeMatch.soldAt).getTime();
      const diffMs = now - saleTime;
      const daysLeft = Math.ceil((ACTIVE_TICKET_VALIDITY_MS - diffMs) / (24 * 60 * 60 * 1000));
      return {
        hasActiveTicket: true,
        activeTicket: activeMatch,
        daysRemaining: Math.max(1, daysLeft),
      };
    }

    return { hasActiveTicket: false, activeTicket: null, daysRemaining: 0 };
  }, [tickets]);

  const sellTicket = useCallback(async (params: {
    ticketId: string;
    plateNumber: string;
    driverPhone?: string;
    driverName?: string;
    overrideOldTicketId?: string;
    paymentMethod?: PortusPaymentMethod;
    paymentReference?: string;
  }): Promise<Sale> => {
    const lockKey = `sellTicket:${params.ticketId}`;
    if (actionLocksRef.current.has(lockKey)) {
      throw new Error('Une transaction de vente est déjà en cours pour ce ticket.');
    }
    actionLocksRef.current.add(lockKey);

    try {
      const db = await getDB();
      const ticket = await db.get('tickets', params.ticketId);
      if (!ticket) throw new Error('Ticket introuvable');

      const isAdmin = currentUser?.role === 'ADMINISTRATEUR';
      if (!isAdmin && ticket.status !== 'ASSIGNED_TO_AGENT') {
        throw new Error(`Ce ticket n'est pas disponible pour la vente (Statut: ${ticket.status})`);
      }
      if (ticket.status === 'SOLD') {
        throw new Error('Ce ticket a déjà été vendu.');
      }
      if (ticket.status === 'CANCELLED') {
        throw new Error('Ce ticket a été annulé par l’administration.');
      }

      if (currentUser && currentUser.role === 'AGENT') {
        if (ticket.assignedAgentId && ticket.assignedAgentId !== currentUser.id) {
          throw new Error("Violation de sécurité : Ce ticket ne vous est pas attribué.");
        }
      }
      if (currentUser && currentUser.role === 'CONTROLEUR') {
        throw new Error("Violation d'accès : Un contrôleur ne peut pas enregistrer de ventes.");
      }

      const cleanPlate = normalizePlate(params.plateNumber);
      if (!cleanPlate) throw new Error('L’immatriculation est obligatoire.');

      const cleanPhone = params.driverPhone ? normalizePhone(params.driverPhone) : undefined;

      const gps = await getCurrentCoordinates();
      const resolvedGpsStatus = gps.status === 'AVAILABLE' ? 'AVAILABLE' : 'GPS_UNAVAILABLE';

      const saleId = generateUUID();
      const originalSoldAt = new Date().toISOString();

      const allExistingTickets: Ticket[] = await db.getAll('tickets');
      for (const oldTkt of allExistingTickets) {
        if (
          oldTkt.id !== ticket.id &&
          oldTkt.status === 'SOLD' &&
          !oldTkt.isSuperseded &&
          normalizePlate(oldTkt.plateNumber || '') === cleanPlate
        ) {
          const updatedOldTkt: Ticket = {
            ...oldTkt,
            isSuperseded: true,
            supersededByTicketNumber: ticket.ticketNumber,
          };
          await db.put('tickets', updatedOldTkt);

          if (SupabaseDataLayer.isAvailable()) {
            SupabaseDataLayer.updateTicketStatus({
              ticketId: oldTkt.id,
              isSuperseded: true,
              supersededByTicketNumber: ticket.ticketNumber,
            }).catch(() => {});
          }
        }
      }

      const updatedTicket: Ticket = {
        ...ticket,
        status: 'SOLD',
        saleId,
        soldAt: originalSoldAt,
        plateNumber: cleanPlate,
        driverPhone: cleanPhone,
        driverName: params.driverName,
        isSuperseded: false,
      };
      await db.put('tickets', updatedTicket);

      const sale: Sale = {
        id: saleId,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        agentId: ticket.assignedAgentId || currentUser?.id || 'admin',
        agentName: ticket.assignedAgentName || (isAdmin ? `${currentUser?.fullName || 'ADMINISTRATEUR'} (Admin)` : currentUser?.fullName || 'AGENT'),
        sectorId: ticket.sectorId,
        sectorName: ticket.sectorName,
        plateNumber: cleanPlate,
        driverPhone: cleanPhone,
        driverName: params.driverName,
        soldAt: originalSoldAt,
        gpsLatitude: gps.latitude,
        gpsLongitude: gps.longitude,
        gpsAccuracy: gps.accuracy,
        gpsStatus: resolvedGpsStatus,
        syncStatus: isOnline ? 'SYNCED' : 'PENDING_SYNC',
        syncedAt: isOnline ? originalSoldAt : undefined,
        price: ticketPrice,
        paymentMethod: params.paymentMethod || 'ESPECES',
        paymentReference: params.paymentReference || undefined,
      };

      await db.put('sales', sale);

      upsertVehicle({
        plateNumber: cleanPlate,
        driverName: params.driverName,
        driverPhone: cleanPhone,
        totalTicketsCount: 1,
      }).catch((err) => console.warn('[PORTUS DataContext] Erreur upsert véhicule vente:', err));

      if (isOnline && SupabaseDataLayer.isAvailable()) {
        try {
          const secureSale = await SupabaseDataLayer.sellTicketSecureRPC({
            ticketId: ticket.id,
            plateNumber: cleanPlate,
            driverPhone: cleanPhone,
            syncIdempotencyKey: saleId,
            latitude: gps.latitude ?? undefined,
            longitude: gps.longitude ?? undefined,
            accuracy: gps.accuracy ?? undefined,
            soldAt: originalSoldAt,
          });
          if (secureSale && secureSale.sale_id) {
            sale.id = secureSale.sale_id;
            sale.syncStatus = 'SYNCED';
          }
        } catch (sbErr: any) {
          if (sbErr.message && sbErr.message.includes('déjà été vendu')) {
            throw sbErr;
          }
          console.warn('Synchro directe Supabase RPC différée, repli sur insertion idempotente:', sbErr);
          try {
            await SupabaseDataLayer.insertSaleIdempotent(sale);
          } catch {
            // Reste en local
          }
        }
      }

      if (isOnline) {
        await notifySaleSynced(sale, db);
      }

      await recordAudit(
        'TICKET_SOLD',
        'Ticket',
        ticket.id,
        `Vente du ticket ${ticket.ticketNumber} pour l'immatriculation ${cleanPlate} (${isOnline ? 'En ligne' : 'Hors ligne'})`
      );

      if (isOnline) {
        setLastSyncedSaleNumber(ticket.ticketNumber);
        setTimeout(() => setLastSyncedSaleNumber(null), 4000);
      }

      await refreshData();
      return sale;
    } finally {
      actionLocksRef.current.delete(lockKey);
    }
  }, [
    actionLocksRef,
    currentUser,
    ticketPrice,
    isOnline,
    upsertVehicle,
    notifySaleSynced,
    recordAudit,
    setLastSyncedSaleNumber,
    refreshData,
  ]);

  const getAgentStats = useCallback((agentId: string) => {
    const userObj = users.find((u) => u.id === agentId);
    let agentTickets = tickets.filter((t) => t.assignedAgentId === agentId);
    if (userObj?.role === 'RESPONSABLE') {
      agentTickets = tickets.filter(
        (t) => t.assignedResponsableId === agentId || (userObj.sectorId && t.sectorId === userObj.sectorId)
      );
    }
    const assignedCount = agentTickets.length;
    const availableCount = agentTickets.filter(
      (t) => t.status === 'ASSIGNED_TO_AGENT' || t.status === 'ASSIGNED_TO_RESPONSIBLE' || t.status === 'AVAILABLE'
    ).length;
    const soldCount = agentTickets.filter((t) => t.status === 'SOLD' || t.status === 'CONTROLLED').length;
    const expectedAmount = soldCount * ticketPrice;

    const agentRemises = remises.filter((r) => r.agentId === agentId || (userObj?.role === 'RESPONSABLE' && r.responsableId === agentId));
    const remittedAmount = agentRemises.reduce((sum, r) => sum + r.amount, 0);
    const remainingBalance = Math.max(0, expectedAmount - remittedAmount);
    const ecart = Math.max(0, remittedAmount - expectedAmount);
    const unremittedTicketsCount = Math.ceil(remainingBalance / ticketPrice);

    return {
      assignedCount,
      availableCount,
      soldCount,
      ticketsSold: soldCount,
      totalSalesAmount: expectedAmount,
      expectedAmount,
      remittedAmount,
      remainingBalance,
      ecart,
      unremittedTicketsCount,
    };
  }, [users, tickets, ticketPrice, remises]);

  const getRecentPlates = useCallback((): string[] => {
    const plateSet = new Set<string>();
    sales.forEach((s) => {
      if (s.plateNumber) plateSet.add(s.plateNumber);
    });
    return Array.from(plateSet).slice(0, 8);
  }, [sales]);

  return {
    sales,
    setSales,
    ticketPrice,
    setTicketPrice,
    updateTicketPrice,
    checkDuplicatePlate,
    sellTicket,
    getAgentStats,
    getRecentPlates,
  };
}
