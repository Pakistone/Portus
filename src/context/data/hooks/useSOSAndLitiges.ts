import { useState, useCallback } from 'react';
import type { SOSAlert, LitigeChauffeur, BrigadeAssignment, User, FraudReport, LitigeStatus, Role, BrigadeType, SectorType } from '../../../types';
import { getDB } from '../../../db/indexedDb';
import { normalizePlate, normalizePhone } from '../../../utils/normalization';
import { getCurrentCoordinates } from '../../../utils/geolocation';
import { generateUUID } from '../../../utils/uuid';
import { playIncidentAlertSound } from '../../../utils/audioAlert';
import { SupabaseDataLayer } from '../../../db/supabaseService';

export function useSOSAndLitiges(
  currentUser: User | null,
  recordAudit: (action: any, entity: string, id: string, details?: string, oldVal?: any, newVal?: any) => Promise<void>,
  refreshData: (forceSync?: boolean) => Promise<void>,
  setLatestRealtimeIncident: React.Dispatch<React.SetStateAction<FraudReport | null>>
) {
  const [sosAlerts, setSosAlerts] = useState<SOSAlert[]>([]);
  const [litigesChauffeurs, setLitigesChauffeurs] = useState<LitigeChauffeur[]>([]);
  const [brigadeAssignments, setBrigadeAssignments] = useState<BrigadeAssignment[]>([]);

  const triggerSOSAlert = useCallback(async (message = 'Incident bloquant ou agression sur le terrain'): Promise<FraudReport> => {
    const now = new Date();
    const gps = await getCurrentCoordinates();

    const sosReport: FraudReport = {
      id: `sos-${Date.now()}`,
      ticketNumber: 'SOS-URGENT',
      plateNumber: 'SOS_ALERT',
      controleurId: currentUser?.id || 'system',
      controleurName: currentUser?.fullName || 'Agent PORTUS',
      type: 'AUTRE',
      typeLabel: '🚨 ALERTE SOS - AGENT EN DANGER',
      comment: `${message}. Position GPS : ${gps.latitude ? `${gps.latitude.toFixed(5)}, ${gps.longitude?.toFixed(5)} (Précision: ${gps.accuracy || 0}m)` : 'Non disponible'}.`,
      photos: [],
      reportedAt: now.toISOString(),
      reportedDate: now.toISOString().slice(0, 10),
      reportedTime: now.toLocaleTimeString('fr-FR', { hour12: false }),
      gpsLatitude: gps.latitude || 5.2647,
      gpsLongitude: gps.longitude || -4.0089,
      status: 'NOUVEAU',
      syncStatus: 'SYNCED',
      syncedAt: now.toISOString(),
    };

    playIncidentAlertSound();
    setLatestRealtimeIncident(sosReport);
    window.dispatchEvent(new CustomEvent('portus-road-safety-alert', { detail: sosReport }));

    const db = await getDB();
    await db.put('fraud_reports', sosReport);

    if (SupabaseDataLayer.isAvailable()) {
      await SupabaseDataLayer.broadcastIncident(sosReport).catch(() => {});
      await SupabaseDataLayer.insertFraudReport(sosReport).catch(() => {});
    }

    await recordAudit(
      'SECURITY_ALERT',
      'System',
      sosReport.id,
      `Déclenchement d'une alerte SOS par l'utilisateur ${currentUser?.fullName} (${currentUser?.role}) : ${message}`
    );

    await refreshData();
    return sosReport;
  }, [currentUser, setLatestRealtimeIncident, recordAudit, refreshData]);

  const resolveSOSAlert = useCallback(async (sosId: string, notes: string) => {
    const db = await getDB();
    const report = await db.get('fraud_reports', sosId);
    if (report) {
      report.status = 'TRAITE';
      report.adminDecisionNote = notes;
      report.adminDecisionAt = new Date().toISOString();
      report.adminDecisionBy = currentUser?.id;
      report.adminDecisionByName = currentUser?.fullName;
      await db.put('fraud_reports', report);
    }

    const localSos = await db.get('sos_alerts', sosId);
    if (localSos) {
      localSos.status = 'RESOLU';
      localSos.resolvedAt = new Date().toISOString();
      localSos.resolvedBy = currentUser?.id;
      localSos.resolvedByName = currentUser?.fullName;
      localSos.resolutionNotes = notes;
      await db.put('sos_alerts', localSos);
    }

    await recordAudit(
      'FRAUD_STATUS_UPDATED',
      'SOSAlert',
      sosId,
      `Résolution de l'alerte SOS par ${currentUser?.fullName} : ${notes}`
    );
    await refreshData();
  }, [currentUser, recordAudit, refreshData]);

  const createLitige = useCallback(async (params: {
    plateNumber: string;
    driverPhone?: string;
    driverName?: string;
    ticketNumber?: string;
    reason: 'TICKET_DEJA_PAYE' | 'TICKET_PERDU' | 'ERREUR_IMMATRICULATION' | 'AUTRE';
    description: string;
  }): Promise<LitigeChauffeur> => {
    const db = await getDB();
    const id = generateUUID();
    const now = new Date().toISOString();
    const litige: LitigeChauffeur = {
      id,
      plateNumber: normalizePlate(params.plateNumber),
      driverPhone: params.driverPhone ? normalizePhone(params.driverPhone) : undefined,
      driverName: params.driverName,
      ticketNumber: params.ticketNumber,
      reason: params.reason,
      description: params.description,
      status: 'OUVERT',
      reportedBy: currentUser?.id || 'system',
      reportedByName: currentUser?.fullName || 'Agent PORTUS',
      reportedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await db.put('litiges_chauffeurs', litige);
    await recordAudit(
      'SECURITY_ALERT',
      'LitigeChauffeur',
      id,
      `Nouveau litige chauffeur enregistré pour plaque ${litige.plateNumber} par ${currentUser?.fullName}`
    );
    await refreshData();
    return litige;
  }, [currentUser, recordAudit, refreshData]);

  const updateLitigeStatus = useCallback(async (litigeId: string, status: LitigeStatus, decisionNote: string): Promise<LitigeChauffeur> => {
    const db = await getDB();
    const litige = await db.get('litiges_chauffeurs', litigeId);
    if (!litige) throw new Error('Litige introuvable');

    litige.status = status;
    litige.decisionNote = decisionNote;
    litige.decidedBy = currentUser?.id;
    litige.decidedByName = currentUser?.fullName;
    litige.decidedAt = new Date().toISOString();
    litige.updatedAt = new Date().toISOString();

    await db.put('litiges_chauffeurs', litige);
    await recordAudit(
      'SECURITY_ALERT',
      'LitigeChauffeur',
      litigeId,
      `Statut du litige chauffeur ${litigeId} modifié en ${status} par ${currentUser?.fullName} : ${decisionNote}`
    );
    await refreshData();
    return litige;
  }, [currentUser, recordAudit, refreshData]);

  const createBrigadeAssignment = useCallback(async (params: {
    userId: string;
    userName: string;
    userRole: Role;
    brigade: BrigadeType;
    sector: SectorType;
    sectorName: string;
    shiftDate: string;
    notes?: string;
  }): Promise<BrigadeAssignment> => {
    const db = await getDB();
    const id = generateUUID();
    const assignment: BrigadeAssignment = {
      id,
      userId: params.userId,
      userName: params.userName,
      userRole: params.userRole,
      brigade: params.brigade,
      sector: params.sector,
      sectorName: params.sectorName,
      shiftDate: params.shiftDate,
      notes: params.notes,
      status: 'PLANIFIE',
      createdAt: new Date().toISOString(),
    };

    await db.put('brigades_plannings', assignment);
    await recordAudit(
      'USER_UPDATED',
      'BrigadeAssignment',
      id,
      `Planification de l'agent ${params.userName} pour la brigade ${params.brigade} du ${params.shiftDate}`
    );
    await refreshData();
    return assignment;
  }, [recordAudit, refreshData]);

  const checkInBrigade = useCallback(async (assignmentId: string) => {
    const db = await getDB();
    const assignment = await db.get('brigades_plannings', assignmentId);
    if (!assignment) throw new Error('Planification introuvable');

    assignment.status = 'PRESENT';
    assignment.checkInAt = new Date().toISOString();
    assignment.checkInApprovedBy = currentUser?.id;
    assignment.checkInApprovedByName = currentUser?.fullName;

    await db.put('brigades_plannings', assignment);
    await recordAudit(
      'USER_UPDATED',
      'BrigadeAssignment',
      assignmentId,
      `Prise de service validée pour ${assignment.userName} à la brigade ${assignment.brigade}`
    );
    await refreshData();
  }, [currentUser, recordAudit, refreshData]);

  const checkOutBrigade = useCallback(async (assignmentId: string, notes?: string) => {
    const db = await getDB();
    const assignment = await db.get('brigades_plannings', assignmentId);
    if (!assignment) throw new Error('Planification introuvable');

    assignment.status = 'TERMINE';
    assignment.checkOutAt = new Date().toISOString();
    if (notes) assignment.notes = notes;

    await db.put('brigades_plannings', assignment);
    await recordAudit(
      'USER_UPDATED',
      'BrigadeAssignment',
      assignmentId,
      `Fin de service enregistrée pour ${assignment.userName} de la brigade ${assignment.brigade}`
    );
    await refreshData();
  }, [recordAudit, refreshData]);

  return {
    sosAlerts,
    setSosAlerts,
    litigesChauffeurs,
    setLitigesChauffeurs,
    brigadeAssignments,
    setBrigadeAssignments,
    triggerSOSAlert,
    resolveSOSAlert,
    createLitige,
    updateLitigeStatus,
    createBrigadeAssignment,
    checkInBrigade,
    checkOutBrigade,
  };
}
