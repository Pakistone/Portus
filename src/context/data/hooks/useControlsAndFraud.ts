import { useState, useCallback } from 'react';
import type { Control, FraudReport, Ticket, User, FraudProcessingHistoryEntry, AuditAction, NotificationRecord } from '../../../types';
import type { VerifyTicketResult } from '../types';
import { getDB } from '../../../db/indexedDb';
import { normalizePlate, normalizeText } from '../../../utils/normalization';
import { getCurrentCoordinates } from '../../../utils/geolocation';
import { parseTicketQRPayload, verifyTicketSecurityToken } from '../../../utils/ticketSecurity';
import { SupabaseDataLayer } from '../../../db/supabaseService';
import { generateUUID } from '../../../utils/uuid';

export function useControlsAndFraud(
  currentUser: User | null,
  tickets: Ticket[],
  users: User[],
  isOnline: boolean,
  recordAudit: (action: any, entity: string, id: string, details?: string, oldVal?: any, newVal?: any) => Promise<void>,
  refreshData: (forceSync?: boolean) => Promise<void>
) {
  const [controls, setControls] = useState<Control[]>([]);
  const [fraudReports, setFraudReports] = useState<FraudReport[]>([]);

  const verifyTicket = useCallback(async (identifierRaw: string): Promise<VerifyTicketResult> => {
    let targetTicketNumber: string = '';
    let targetTicketId: string = '';

    const parsedQR = parseTicketQRPayload(identifierRaw);
    if (parsedQR && (parsedQR.num || parsedQR.tid)) {
      targetTicketNumber = parsedQR.num ? parsedQR.num.trim().toUpperCase() : '';
      targetTicketId = parsedQR.tid || '';
    } else {
      const rawTrimmed = identifierRaw.trim();
      targetTicketNumber = rawTrimmed.toUpperCase();
      targetTicketId = rawTrimmed;
    }

    let foundTicket: Ticket | null = null;
    let verifiedVia: 'SERVER' | 'LOCAL_CACHE' = 'LOCAL_CACHE';

    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        const secureResult = await SupabaseDataLayer.verifyTicketSecureRPC({
          identifier: targetTicketNumber || targetTicketId || identifierRaw,
          scannedToken: parsedQR?.sig || parsedQR?.tok,
        });

        if (secureResult) {
          if (!secureResult.valid && (secureResult.status === 'FORGED_SIGNATURE' || secureResult.status === 'FORGED_TOKEN')) {
            return {
              status: 'INVALID_UNKNOWN',
              bannerTitle: '🚨 FALSIFICATION DÉTECTÉE — SIGNATURE NON CONFORME',
              ticket: null,
              agentName: secureResult.agent_name || null,
              agentPhone: secureResult.agent_phone || null,
              verifiedVia: 'SERVER',
              message: secureResult.message || 'Signature cryptographique non authentique. Faux ticket détecté !',
              isRepeatedControl: false,
              previousControlCount: secureResult.control_count || 0,
            };
          }

          if (secureResult.ticket_id) {
            const serverTicket = await SupabaseDataLayer.fetchTicketForVerification(
              secureResult.ticket_number || targetTicketNumber || targetTicketId || identifierRaw
            );
            if (serverTicket) {
              foundTicket = serverTicket;
              verifiedVia = 'SERVER';
              const db = await getDB();
              await db.put('tickets', serverTicket);
            }
          }
        } else {
          const serverTicket = await SupabaseDataLayer.fetchTicketForVerification(
            targetTicketNumber || targetTicketId || identifierRaw
          );
          if (serverTicket) {
            foundTicket = serverTicket;
            verifiedVia = 'SERVER';
            const db = await getDB();
            await db.put('tickets', serverTicket);
          }
        }
      } catch (err) {
        console.warn('Erreur vérification serveur Supabase, repli sur le cache local:', err);
      }
    }

    if (!foundTicket) {
      const cleanNum = targetTicketNumber;
      const cleanPlate = normalizePlate(identifierRaw);

      foundTicket =
        tickets.find((t) => {
          if (cleanNum && t.ticketNumber.toUpperCase() === cleanNum) return true;
          if (targetTicketId && t.id === targetTicketId) return true;
          if (t.id === identifierRaw) return true;
          if (t.qrPayload && t.qrPayload === identifierRaw) return true;
          if (cleanPlate && normalizePlate(t.plateNumber || '') === cleanPlate) return true;
          return false;
        }) || null;

      verifiedVia = 'LOCAL_CACHE';
    }

    if (!foundTicket) {
      return {
        status: 'INVALID_UNKNOWN',
        bannerTitle: '🔴 TICKET INVALIDE — QR CODE NON RECONNU',
        ticket: null,
        agentName: null,
        agentPhone: null,
        verifiedVia,
        message: 'Ce code ne correspond à aucun ticket enregistré dans la base officielle de l’U.J.S.R.V.',
        isRepeatedControl: false,
        previousControlCount: 0,
      };
    }

    if (parsedQR && foundTicket) {
      const scannedToken = parsedQR.sig || parsedQR.signature || parsedQR.tok;
      const tokenVerification = verifyTicketSecurityToken(foundTicket.qrPayload, scannedToken);
      if (!tokenVerification.isAuthentic && tokenVerification.forgeryDetected) {
        return {
          status: 'INVALID_UNKNOWN',
          bannerTitle: '🚨 FALSIFICATION DÉTECTÉE — SIGNATURE OU JETON NON AUTHENTIQUE',
          ticket: foundTicket,
          agentName: null,
          agentPhone: null,
          verifiedVia,
          message: `ALERTE SÉCURITÉ : Le numéro physique [${foundTicket.ticketNumber}] existe, mais la signature ou le jeton cryptographique est non conforme. Ticket contrefait. (${tokenVerification.reason})`,
          isRepeatedControl: false,
          previousControlCount: foundTicket.controlCount || 0,
        };
      }
    }

    const agentUser = users.find((u) => u.id === foundTicket?.assignedAgentId);
    const agentName =
      foundTicket.assignedAgentName || agentUser?.fullName || 'Agent U.J.S.R.V.';
    const agentPhone =
      foundTicket.assignedAgentPhone || agentUser?.phone || 'Téléphone non renseigné';

    const previousControlCount = foundTicket.controlCount || 0;
    const isRepeatedControl = previousControlCount > 0;

    if (foundTicket.status === 'CANCELLED') {
      return {
        status: 'CANCELLED',
        bannerTitle: '❌ TICKET ANNULÉ — NON VALIDE',
        ticket: foundTicket,
        agentName,
        agentPhone,
        verifiedVia,
        message: `Ce ticket a été annulé par l’administration.${
          foundTicket.cancellationReason ? ' Motif : ' + foundTicket.cancellationReason : ''
        }`,
        isRepeatedControl,
        previousControlCount,
      };
    }

    if (foundTicket.isSuperseded) {
      return {
        status: 'SUPERSEDED',
        bannerTitle: '⚠️ TICKET INACTIF — REMPLACÉ PAR UN NOUVEAU TICKET',
        ticket: foundTicket,
        agentName,
        agentPhone,
        verifiedVia,
        message: `Un nouveau ticket actif a été émis pour ce véhicule (${
          foundTicket.supersededByTicketNumber || 'Nouveau ticket'
        }).`,
        isRepeatedControl,
        previousControlCount,
      };
    }

    if (foundTicket.status !== 'SOLD' && foundTicket.status !== 'CONTROLLED') {
      return {
        status: 'NOT_SOLD',
        bannerTitle: '🔴 TICKET INVALIDE — NON ENCORE VENDU',
        ticket: foundTicket,
        agentName,
        agentPhone,
        verifiedVia,
        message: `Ce ticket figure dans un carnet non vendu (statut actuel : ${foundTicket.status}). Circuler avec ce ticket est non conforme.`,
        isRepeatedControl,
        previousControlCount,
      };
    }

    return {
      status: 'VALID',
      bannerTitle: '🟢 TICKET VALIDE — AUTORISÉ',
      ticket: foundTicket,
      agentName,
      agentPhone,
      verifiedVia,
      message: `Ticket régulier et conforme pour le véhicule ${foundTicket.plateNumber || 'Enregistré'}.`,
      isRepeatedControl,
      previousControlCount,
    };
  }, [isOnline, tickets, users]);

  const searchTicketsByPlate = useCallback(async (plateRaw: string): Promise<Ticket[]> => {
    const cleanPlate = normalizePlate(plateRaw);
    if (!cleanPlate) return [];

    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        const serverResults = await SupabaseDataLayer.fetchTicketsByPlate(cleanPlate);
        if (serverResults.length > 0) {
          const db = await getDB();
          for (const st of serverResults) {
            await db.put('tickets', st);
          }
          return serverResults;
        }
      } catch (err) {
        console.warn('Erreur recherche serveur par immatriculation:', err);
      }
    }

    return tickets
      .filter((t) => normalizePlate(t.plateNumber || '') === cleanPlate)
      .sort((a, b) => {
        if (a.status === 'SOLD' && b.status !== 'SOLD') return -1;
        if (b.status === 'SOLD' && a.status !== 'SOLD') return 1;
        return (b.soldAt || '').localeCompare(a.soldAt || '');
      });
  }, [isOnline, tickets]);

  const recordControl = useCallback(async (
    ticketNumberOrParams:
      | string
      | {
          ticketNumber: string;
          plateNumber: string;
          isValid: boolean;
          message: string;
          resultType?: Control['resultType'];
        },
    plateNumberArg?: string,
    isValidArg?: boolean,
    messageArg?: string
  ): Promise<Control> => {
    const db = await getDB();

    let ticketNum: string;
    let plateNum: string;
    let isValid: boolean;
    let validationMessage: string;
    let resultType: Control['resultType'];

    if (typeof ticketNumberOrParams === 'object') {
      ticketNum = ticketNumberOrParams.ticketNumber;
      plateNum = ticketNumberOrParams.plateNumber;
      isValid = ticketNumberOrParams.isValid;
      validationMessage = ticketNumberOrParams.message;
      resultType = ticketNumberOrParams.resultType;
    } else {
      ticketNum = ticketNumberOrParams;
      plateNum = plateNumberArg || '';
      isValid = isValidArg ?? false;
      validationMessage = messageArg || '';
      resultType = isValid ? 'VALID' : 'INVALID_UNKNOWN';
    }

    const cleanPlate = normalizePlate(plateNum);
    const cleanNum = normalizeText(ticketNum);
    const gps = await getCurrentCoordinates();

    const controlId = `ctrl-${Date.now()}-${generateUUID().slice(0, 4)}`;
    const now = new Date().toISOString();

    const t = tickets.find((tkt) => tkt.ticketNumber === cleanNum);
    if (t) {
      t.controlCount = (t.controlCount || 0) + 1;
      t.lastControlledAt = now;
      t.lastControlledBy = currentUser?.fullName;
      if (t.status === 'SOLD') {
        t.status = 'CONTROLLED';
      }
      await db.put('tickets', t);
    }

    const control: Control = {
      id: controlId,
      ticketId: t?.id,
      ticketNumber: cleanNum,
      plateNumber: cleanPlate || (t?.plateNumber ? normalizePlate(t.plateNumber) : 'NON_RENSEIGNEE'),
      controleurId: currentUser?.id || 'ctrl',
      controleurName: currentUser?.fullName || 'CONTRÔLEUR',
      controlledAt: now,
      isValid,
      validationMessage: normalizeText(validationMessage),
      resultType: resultType || (isValid ? 'VALID' : 'INVALID_UNKNOWN'),
      isOnline,
      gpsLatitude: gps.latitude,
      gpsLongitude: gps.longitude,
      gpsAccuracy: gps.accuracy,
      gpsStatus: gps.status,
      syncStatus: isOnline ? 'SYNCED' : 'PENDING_SYNC',
      syncedAt: isOnline ? now : undefined,
    };

    await db.put('controls', control);

    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        const secureControl = await SupabaseDataLayer.recordControlSecureRPC({
          identifier: cleanNum,
          plateNumber: cleanPlate,
          location: 'Vridi',
          notes: validationMessage,
        });
        if (secureControl) {
          control.isValid = secureControl.valid;
          if (secureControl.control_id) control.id = secureControl.control_id;
          control.syncStatus = 'SYNCED';
        }
      } catch (err) {
        console.warn('Erreur envoi direct contrôle Supabase via RPC, bascule sur insertion/file:', err);
        try {
          await SupabaseDataLayer.insertControl(control);
        } catch {
          control.syncStatus = 'PENDING_SYNC';
          await db.put('controls', control);
        }
      }
    }

    await recordAudit(
      'TICKET_CONTROLLED',
      'Control',
      controlId,
      `Contrôle routier ${isOnline ? '[EN LIGNE]' : '[HORS LIGNE]'} pour le ticket ${cleanNum} (Immat: ${
        control.plateNumber
      }) — Résultat : ${isValid ? '🟢 VALIDE' : '🔴 NON CONFORME'}`
    );

    await refreshData();
    return control;
  }, [currentUser, isOnline, tickets, recordAudit, refreshData]);

  const reportFraud = useCallback(async (report: {
    ticketNumber?: string;
    plateNumber: string;
    type: FraudReport['type'];
    typeLabel: string;
    comment: string;
    photos?: string[];
    photoDataUrl?: string;
    reason?: string;
    reasonLabel?: string;
  }): Promise<FraudReport> => {
    const db = await getDB();
    const gps = await getCurrentCoordinates();
    const cleanPlate = normalizePlate(report.plateNumber);

    const now = new Date();
    const nowIso = now.toISOString();
    const reportedDate = nowIso.split('T')[0];
    const reportedTime = now.toLocaleTimeString('fr-FR', { hour12: false });

    const photosList = report.photos && report.photos.length > 0
      ? report.photos
      : (report.photoDataUrl ? [report.photoDataUrl] : []);

    const fraudId = `frd-${Date.now()}`;
    const fraud: FraudReport = {
      id: fraudId,
      ticketNumber: report.ticketNumber ? normalizeText(report.ticketNumber) : undefined,
      plateNumber: cleanPlate,
      controleurId: currentUser?.id || 'ctrl',
      controleurName: currentUser?.fullName || 'CONTRÔLEUR ROUTIER',
      type: report.type,
      typeLabel: report.typeLabel,
      reason: report.reason || report.type,
      reasonLabel: report.reasonLabel || report.typeLabel,
      comment: normalizeText(report.comment),
      photos: photosList,
      photoDataUrl: photosList[0] || report.photoDataUrl,
      reportedAt: nowIso,
      reportedDate,
      reportedTime,
      gpsLatitude: gps.latitude,
      gpsLongitude: gps.longitude,
      gpsStatus: gps.latitude != null ? 'AVAILABLE' : 'UNAVAILABLE',
      status: 'NOUVEAU',
      processingHistory: [],
      isOnline,
      syncStatus: isOnline ? 'SYNCED' : 'PENDING_SYNC',
      syncedAt: isOnline ? nowIso : undefined,
    };

    await db.put('fraud_reports', fraud);

    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        await SupabaseDataLayer.insertFraudReport(fraud);
      } catch (err) {
        console.warn('Erreur envoi direct signalement fraude Supabase, bascule en file d’attente:', err);
        fraud.syncStatus = 'PENDING_SYNC';
        await db.put('fraud_reports', fraud);
      }
    }

    await recordAudit(
      'FRAUD_REPORTED',
      'FraudReport',
      fraudId,
      `Signalement de fraude [${report.typeLabel}] pour le véhicule ${cleanPlate}${
        report.ticketNumber ? ` (Ticket ${report.ticketNumber})` : ''
      } par ${fraud.controleurName}. ${photosList.length} photo(s) jointe(s). Statut: NOUVEAU (Soumis à analyse administrative). Mode: ${isOnline ? 'EN LIGNE' : 'HORS LIGNE (Stocké localement)'}`
    );

    try {
      const allUsers: User[] = await db.getAll('users');
      let targetSectorId: string | undefined;
      if (report.ticketNumber) {
        const matchingTicket = tickets.find((t) => t.ticketNumber === report.ticketNumber);
        targetSectorId = matchingTicket?.sectorId;
      }

      const alertRecipients = allUsers.filter(
        (u) =>
          u.isActive &&
          (u.role === 'ADMINISTRATEUR' ||
            (u.role === 'RESPONSABLE' && (!targetSectorId || !u.sectorId || u.sectorId === targetSectorId)))
      );

      const notifTitle = `🚨 SIGNALEMENT FRAUDE : ${report.typeLabel}`;
      const notifMessage = `Véhicule ${cleanPlate} | Ticket : ${report.ticketNumber || 'Non renseigné'} | Contrôleur : ${fraud.controleurName} | ${photosList.length} photo(s). En attente d'arbitrage.`;

      for (const rec of alertRecipients) {
        const notif: NotificationRecord = {
          id: `notif-fraud-${fraud.id}-${rec.id}`,
          recipientId: rec.id,
          senderId: fraud.controleurId,
          title: notifTitle,
          message: notifMessage,
          level: 'CRITICAL',
          type: 'FRAUD_ALERT',
          metadata: {
            fraudId: fraud.id,
            plateNumber: cleanPlate,
            ticketNumber: report.ticketNumber,
            fraudType: report.type,
            controleurName: fraud.controleurName,
            photosCount: photosList.length,
          },
          isRead: false,
          createdAt: nowIso,
        };

        if (db.objectStoreNames.contains('notifications')) {
          await db.put('notifications', notif);
        }
        if (isOnline && SupabaseDataLayer.isAvailable()) {
          SupabaseDataLayer.insertNotification(notif).catch(() => {});
        }
      }
    } catch (notifErr) {
      console.warn('Erreur génération notification fraude:', notifErr);
    }

    await refreshData();
    return fraud;
  }, [currentUser, isOnline, tickets, recordAudit, refreshData]);

  const updateFraudReportStatus = useCallback(async (
    fraudId: string,
    newStatus: FraudReport['status'],
    decisionNote: string
  ): Promise<FraudReport> => {
    const db = await getDB();
    const existing = await db.get('fraud_reports', fraudId);
    if (!existing) {
      throw new Error(`Signalement de fraude #${fraudId} introuvable.`);
    }

    const previousStatus = existing.status;
    const nowIso = new Date().toISOString();

    const historyEntry: FraudProcessingHistoryEntry = {
      id: `fph-${Date.now()}`,
      processedAt: nowIso,
      adminId: currentUser?.id || 'admin',
      adminName: currentUser?.fullName || 'ADMINISTRATEUR',
      fromStatus: previousStatus,
      toStatus: newStatus,
      decisionNote: decisionNote.trim(),
    };

    const updatedHistory = [...(existing.processingHistory || []), historyEntry];

    const updatedFraud: FraudReport = {
      ...existing,
      status: newStatus,
      adminDecisionNote: decisionNote.trim(),
      adminDecisionBy: currentUser?.id,
      adminDecisionByName: currentUser?.fullName,
      adminDecisionAt: nowIso,
      processingHistory: updatedHistory,
    };

    await db.put('fraud_reports', updatedFraud);

    if (isOnline && SupabaseDataLayer.isAvailable()) {
      try {
        await SupabaseDataLayer.updateFraudReportStatus(
          fraudId,
          newStatus,
          decisionNote.trim(),
          currentUser?.id
        );
      } catch (err) {
        console.warn('Erreur mise à jour statut fraude Supabase:', err);
      }
    }

    let auditAction: AuditAction = 'FRAUD_STATUS_UPDATED';
    if (newStatus === 'CONFIRME') auditAction = 'FRAUD_CONFIRMED';
    else if (newStatus === 'REJETE') auditAction = 'FRAUD_REJECTED';

    await recordAudit(
      auditAction,
      'FraudReport',
      fraudId,
      `Arbitrage administratif du signalement #${fraudId} (Véhicule: ${existing.plateNumber}) : Changement de statut de [${previousStatus}] à [${newStatus}]. Motif décision: "${decisionNote.trim()}" par ${currentUser?.fullName}.`
    );

    try {
      const notifToControleur: NotificationRecord = {
        id: `notif-fraud-decision-${fraudId}-${Date.now()}`,
        recipientId: existing.controleurId,
        senderId: currentUser?.id,
        title: `Décision administrative sur votre signalement (${existing.plateNumber})`,
        message: `Votre signalement pour le véhicule ${existing.plateNumber} a été classé : ${newStatus}. Note : ${decisionNote.trim()}`,
        level: newStatus === 'CONFIRME' ? 'WARNING' : 'INFO',
        type: 'FRAUD_ALERT',
        metadata: {
          fraudId,
          status: newStatus,
          plateNumber: existing.plateNumber,
        },
        isRead: false,
        createdAt: nowIso,
      };

      if (db.objectStoreNames.contains('notifications')) {
        await db.put('notifications', notifToControleur);
      }
      if (isOnline && SupabaseDataLayer.isAvailable()) {
        SupabaseDataLayer.insertNotification(notifToControleur).catch(() => {});
      }
    } catch (ctrlNotifErr) {
      console.warn('Erreur notification contrôleur décision fraude:', ctrlNotifErr);
    }

    await refreshData();
    return updatedFraud;
  }, [currentUser, isOnline, recordAudit, refreshData]);

  return {
    controls,
    setControls,
    fraudReports,
    setFraudReports,
    verifyTicket,
    searchTicketsByPlate,
    recordControl,
    reportFraud,
    updateFraudReportStatus,
  };
}
