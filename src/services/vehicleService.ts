/**
 * Service Métier Véhicules & Immatriculations pour PORTUS — U.J.S.R.V.
 * Catégorie principale : Camions-citernes ("camion-citerne")
 * Catégories complémentaires : Conteneur, Plateau, Benne, Marchandises, Autre commercial
 */

import { getSupabase } from '../db/supabaseClient';
import type { Vehicle, VehicleType, Ticket, Sale, Control, FraudReport } from '../types';
import { normalizePlate } from '../utils/normalization';

export const VEHICLE_TYPES_INFO: Record<VehicleType, { label: string; description: string; badgeColor: string }> = {
  CAMION_CITERNE: {
    label: 'Camion-Citerne',
    description: 'Hydrocarbures, carburant, vrac liquide (Catégorie principale corridor portuaire)',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  CONTENEUR: {
    label: 'Porte-Conteneur',
    description: 'Transport de conteneurs 20ft/40ft transit portuaire',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  PLATEAU: {
    label: 'Camion Plateau',
    description: 'Matériaux lourds, grumes, charges indivisibles',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  BENNE: {
    label: 'Camion Benne',
    description: 'Agrégats, sable, minerais, chantiers industriels',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },
  MARCHANDISES: {
    label: 'Fourgon / Marchandises',
    description: 'Denrées diverses, fret général sec',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  AUTRE_POIDS_LOURD: {
    label: 'Autre Poids Lourd Commercial',
    description: 'Véhicule commercial lourd spécialisé',
    badgeColor: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  },
};

export interface VehicleFullHistory {
  vehicle: Vehicle;
  sales: Sale[];
  tickets: Ticket[];
  controls: Control[];
  fraudReports: FraudReport[];
  totalPaidAmount: number;
  lastSeenDate?: string;
  hasActiveTicket: boolean;
  activeTicket?: Ticket;
}

export const VehicleService = {
  /**
   * Construit l'historique opérationnel complet d'une plaque d'immatriculation
   */
  buildVehicleHistory(params: {
    plateNumber: string;
    vehicles: Vehicle[];
    sales: Sale[];
    tickets: Ticket[];
    controls: Control[];
    fraudReports: FraudReport[];
  }): VehicleFullHistory {
    const cleanPlate = normalizePlate(params.plateNumber);

    let vehicle = params.vehicles.find((v) => normalizePlate(v.plateNumber) === cleanPlate);
    if (!vehicle) {
      vehicle = {
        id: `veh-${cleanPlate}`,
        plateNumber: cleanPlate,
        vehicleType: 'CAMION_CITERNE',
        isFlaggedFraud: false,
        totalTicketsCount: 0,
        totalControlsCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const matchedSales = params.sales.filter((s) => normalizePlate(s.plateNumber) === cleanPlate);
    const matchedTickets = params.tickets.filter((t) => t.plateNumber && normalizePlate(t.plateNumber) === cleanPlate);
    const matchedControls = params.controls.filter((c) => normalizePlate(c.plateNumber) === cleanPlate);
    const matchedFrauds = params.fraudReports.filter((f) => normalizePlate(f.plateNumber) === cleanPlate);

    const totalPaidAmount = matchedSales.reduce((sum, s) => sum + s.price, 0);

    // Recherche de ticket actif (< 7 jours)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activeTicket = matchedTickets.find(
      (t) =>
        (t.status === 'SOLD' || t.status === 'CONTROLLED') &&
        !t.isSuperseded &&
        t.soldAt &&
        new Date(t.soldAt).getTime() >= sevenDaysAgo
    );

    let lastSeenDate: string | undefined;
    const timestamps = [
      ...matchedSales.map((s) => s.soldAt),
      ...matchedControls.map((c) => c.controlledAt),
      ...matchedFrauds.map((f) => f.reportedAt),
    ].filter(Boolean).sort().reverse();

    if (timestamps.length > 0) {
      lastSeenDate = timestamps[0];
    }

    return {
      vehicle: {
        ...vehicle,
        totalTicketsCount: matchedTickets.length,
        totalControlsCount: matchedControls.length,
        isFlaggedFraud: matchedFrauds.some((f) => f.status === 'CONFIRME' || f.status === 'NOUVEAU'),
        lastSeenAt: lastSeenDate,
      },
      sales: matchedSales,
      tickets: matchedTickets,
      controls: matchedControls,
      fraudReports: matchedFrauds,
      totalPaidAmount,
      lastSeenDate,
      hasActiveTicket: Boolean(activeTicket),
      activeTicket,
    };
  },

  /**
   * Sauvegarde / met à jour un véhicule dans Supabase
   */
  async upsertVehicleSupabase(vehicle: Vehicle): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) return;

    await supabase.from('vehicles').upsert({
      id: vehicle.id,
      plate_number: normalizePlate(vehicle.plateNumber),
      vehicle_type: vehicle.vehicleType,
      make_model: vehicle.makeModel || null,
      driver_name: vehicle.driverName || null,
      driver_phone: vehicle.driverPhone || null,
      company_name: vehicle.companyName || null,
      is_flagged_fraud: vehicle.isFlaggedFraud,
      flag_reason: vehicle.flagReason || null,
      last_seen_at: vehicle.lastSeenAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'plate_number' });
  },
};
