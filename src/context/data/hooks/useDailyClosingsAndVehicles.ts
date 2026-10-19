import { useState, useCallback } from 'react';
import type { DailyClosing, Vehicle, TicketReprint, User, Ticket } from '../../../types';
import { getDB } from '../../../db/indexedDb';
import { normalizePlate, formatFCFA } from '../../../utils/normalization';
import { generateUUID } from '../../../utils/uuid';
import { recordTicketReprint as recordTicketReprintDomain } from '../../../services/ticketService';
import { SupabaseDataLayer } from '../../../db/supabaseService';

export function useDailyClosingsAndVehicles(
  currentUser: User | null,
  recordAudit: (action: any, entity: string, id: string, details?: string, oldVal?: any, newVal?: any) => Promise<void>,
  refreshData: (forceSync?: boolean) => Promise<void>
) {
  const [dailyClosings, setDailyClosings] = useState<DailyClosing[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [ticketReprints, setTicketReprints] = useState<TicketReprint[]>([]);

  const submitDailyClosing = useCallback(async (params: {
    openingBalance: number;
    cashSalesAmount: number;
    digitalSalesAmount: number;
    refundsAmount: number;
    expensesAmount: number;
    expectedBalance: number;
    declaredBalance: number;
    notes?: string;
  }): Promise<DailyClosing> => {
    if (!currentUser) throw new Error('Authentification requise');
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    const difference = params.declaredBalance - params.expectedBalance;

    const closing: DailyClosing = {
      id: generateUUID(),
      closingReference: `CLO-${today.replace(/-/g, '')}`,
      closingDate: today,
      date: today,
      cashierId: currentUser.id,
      cashierName: currentUser.fullName,
      sectorId: currentUser.sectorId,
      sectorName: currentUser.sectorName,
      openingBalance: params.openingBalance,
      cashSalesAmount: params.cashSalesAmount,
      digitalSalesAmount: params.digitalSalesAmount,
      refundsAmount: params.refundsAmount,
      expensesAmount: params.expensesAmount,
      expectedBalance: params.expectedBalance,
      declaredBalance: params.declaredBalance,
      declaredCash: params.declaredBalance,
      discrepancy: difference,
      difference,
      notes: params.notes,
      status: 'CONFIRMED',
      confirmedBy: currentUser.id,
      confirmedByName: currentUser.fullName,
      confirmedAt: nowIso,
      closedById: currentUser.id,
      closedByName: currentUser.fullName,
      closedAt: nowIso,
      isLocked: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const db = await getDB();
    if (db.objectStoreNames.contains('daily_closings')) {
      await db.put('daily_closings', closing);
    }

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertDailyClosing(closing).catch((err: any) =>
        console.warn('Supabase submitDailyClosing error:', err)
      );
    }

    await recordAudit(
      'DAILY_CLOSING_SUBMITTED',
      'DailyClosing',
      closing.id,
      `Clôture de caisse du ${today} validée par ${currentUser.fullName} (Écart: ${formatFCFA(difference)})`
    );

    await refreshData();
    return closing;
  }, [currentUser, recordAudit, refreshData]);

  const upsertVehicle = useCallback(async (
    vehicleData: Partial<Vehicle> & { plateNumber: string }
  ): Promise<Vehicle> => {
    const cleanPlate = normalizePlate(vehicleData.plateNumber);
    const nowIso = new Date().toISOString();
    const db = await getDB();

    let existing: Vehicle | undefined;
    if (db.objectStoreNames.contains('vehicles')) {
      const all: Vehicle[] = await db.getAll('vehicles');
      existing = all.find((v) => v.plateNumber === cleanPlate);
    }

    const vehicle: Vehicle = {
      id: existing?.id || generateUUID(),
      plateNumber: cleanPlate,
      vehicleType: vehicleData.vehicleType || existing?.vehicleType || 'CAMION_CITERNE',
      makeModel: vehicleData.makeModel || existing?.makeModel,
      driverName: vehicleData.driverName || existing?.driverName,
      driverPhone: vehicleData.driverPhone || existing?.driverPhone,
      companyName: vehicleData.companyName || existing?.companyName,
      isFlaggedFraud: vehicleData.isFlaggedFraud ?? existing?.isFlaggedFraud ?? false,
      flagReason: vehicleData.flagReason || existing?.flagReason,
      lastSeenAt: nowIso,
      totalTicketsCount:
        (existing?.totalTicketsCount || 0) + (vehicleData.totalTicketsCount ? 1 : 0),
      totalControlsCount:
        (existing?.totalControlsCount || 0) + (vehicleData.totalControlsCount ? 1 : 0),
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (db.objectStoreNames.contains('vehicles')) {
      await db.put('vehicles', vehicle);
    }

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.upsertVehicle(vehicle).catch((err) =>
        console.warn('Supabase upsertVehicle error:', err)
      );
    }

    await refreshData();
    return vehicle;
  }, [refreshData]);

  const recordTicketReprint = useCallback(async (
    ticketId: string,
    reason: string
  ): Promise<{ reprint: TicketReprint; isSuspicious: boolean }> => {
    if (!currentUser) throw new Error('Authentification requise');
    const db = await getDB();
    const ticket = await db.get('tickets', ticketId);
    if (!ticket) throw new Error('Ticket introuvable');

    const updated = await recordTicketReprintDomain({
      ticket,
      actor: currentUser,
      reason,
    });

    const reprint: TicketReprint = {
      id: generateUUID(),
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      requestedBy: currentUser.id,
      requestedByName: currentUser.fullName,
      reason,
      reprintCount: updated.reprintCount || 1,
      isSuspicious: (updated.reprintCount || 1) > 2,
      reprintedAt: new Date().toISOString(),
    };

    await refreshData();
    return { reprint, isSuspicious: reprint.isSuspicious };
  }, [currentUser, refreshData]);

  return {
    dailyClosings,
    setDailyClosings,
    vehicles,
    setVehicles,
    ticketReprints,
    setTicketReprints,
    submitDailyClosing,
    upsertVehicle,
    recordTicketReprint,
  };
}
