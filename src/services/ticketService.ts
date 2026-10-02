/**
 * Service Métier Billetterie & Cycle de Vie des Tickets pour PORTUS — U.J.S.R.V.
 * - Transitions de la machine à états
 * - Journal de réimpression contrôlée (Section 29)
 * - Chronologie visuelle complète de chaque ticket (Section 28)
 */

import { getSupabase } from '../db/supabaseClient';
import { getDB } from '../db/indexedDb';
import type { Ticket, TicketReprint, AuditLog, Control, Sale, User } from '../types';
import { assertTicketStatusTransition } from '../utils/ticketSecurity';
import { generateUUID } from '../utils/uuid';

export interface TicketTimelineEvent {
  id: string;
  timestamp: string;
  action: string;
  actorName: string;
  actorRole?: string;
  previousState?: string;
  newState?: string;
  details: string;
  level: 'NORMAL' | 'HIGHLIGHT' | 'WARNING' | 'CRITICAL';
}

/**
 * Enregistre une réimpression contrôlée (Section 29)
 */
export async function recordTicketReprint(params: {
  ticket: Ticket;
  actor: User;
  reason: string;
}): Promise<Ticket> {
  const currentCount = params.ticket.reprintCount || 0;
  const nextCount = currentCount + 1;
  const isSuspicious = nextCount > 2;
  const now = new Date().toISOString();

  const reprintRecord: TicketReprint = {
    id: generateUUID(),
    ticketId: params.ticket.id,
    ticketNumber: params.ticket.ticketNumber,
    requestedBy: params.actor.id,
    requestedByName: params.actor.fullName,
    reason: params.reason.trim(),
    reprintCount: nextCount,
    isSuspicious,
    reprintedAt: now,
  };

  const updatedTicket: Ticket = {
    ...params.ticket,
    reprintCount: nextCount,
    lastReprintedAt: now,
    lastReprintAt: now,
    lastReprintBy: params.actor.id,
    lastReprintByName: params.actor.fullName,
    reprintReason: params.reason.trim(),
    updatedAt: now,
  };

  // 1. Sauvegarde locale dans IndexedDB
  try {
    const db = await getDB();
    await db.put('tickets', updatedTicket);

    if (db.objectStoreNames.contains('ticket_reprints')) {
      await db.put('ticket_reprints', reprintRecord);
    }

    if (db.objectStoreNames.contains('audit_logs')) {
      await db.put('audit_logs', {
        id: generateUUID(),
        actorId: params.actor.id,
        actorName: params.actor.fullName,
        actorRole: params.actor.role,
        action: 'TICKET_REPRINTED',
        targetEntity: 'Ticket',
        targetId: params.ticket.id,
        timestamp: now,
        details: JSON.stringify({
          ticketNumber: params.ticket.ticketNumber,
          reprintCount: nextCount,
          reason: params.reason.trim(),
          isSuspicious,
        }),
      });
    }
  } catch (err) {
    console.warn('Erreur enregistrement réimpression IndexedDB:', err);
  }

  // 2. Synchronisation Supabase si disponible
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('ticket_reprints').insert({
        id: reprintRecord.id,
        ticket_id: reprintRecord.ticketId,
        ticket_number: reprintRecord.ticketNumber,
        requested_by: reprintRecord.requestedBy,
        reason: reprintRecord.reason,
        reprint_count: reprintRecord.reprintCount,
        is_suspicious: reprintRecord.isSuspicious,
        reprinted_at: reprintRecord.reprintedAt,
      });

      await supabase.from('tickets').update({
        reprint_count: nextCount,
        last_reprint_at: now,
        last_reprint_by: params.actor.id,
        reprint_reason: params.reason.trim(),
        updated_at: now,
      }).eq('id', params.ticket.id);
    } catch (err) {
      console.warn('Erreur enregistrement réimpression Supabase:', err);
    }
  }

  return updatedTicket;
}

export const TicketService = {
  /**
   * Construit la timeline chronologique d'un ticket (Section 28)
   */
  buildTicketTimeline(params: {
    ticket: Ticket;
    auditLogs: AuditLog[];
    controls: Control[];
    sale?: Sale | null;
  }): TicketTimelineEvent[] {
    const events: TicketTimelineEvent[] = [];
    const t = params.ticket;

    // 1. Création
    events.push({
      id: `evt-create-${t.id}`,
      timestamp: t.createdAt,
      action: 'CRÉATION DU TICKET',
      actorName: 'ADMINISTRATEUR',
      newState: 'GENERATED',
      details: `Génération physique dans le carnet ${t.carnetNumber} (${t.price} FCFA)`,
      level: 'NORMAL',
    });

    // 2. Attribution Responsable
    if (t.assignedResponsableId) {
      events.push({
        id: `evt-resp-${t.id}`,
        timestamp: t.createdAt,
        action: 'ATTRIBUTION AU SECTEUR',
        actorName: t.assignedResponsableName || 'Responsable',
        previousState: 'GENERATED',
        newState: 'ASSIGNED_TO_RESPONSIBLE',
        details: `Affectation au secteur ${t.sectorName || 'Vridi'}`,
        level: 'NORMAL',
      });
    }

    // 3. Attribution Agent
    if (t.assignedAgentId) {
      events.push({
        id: `evt-agent-${t.id}`,
        timestamp: t.createdAt,
        action: 'DISTRIBUTION À L’AGENT TERRAIN',
        actorName: t.assignedAgentName || 'Agent',
        previousState: 'ASSIGNED_TO_RESPONSIBLE',
        newState: 'ASSIGNED_TO_AGENT',
        details: `Prise en charge par l’agent percepteur ${t.assignedAgentName || ''}`,
        level: 'NORMAL',
      });
    }

    // 4. Vente
    if (t.soldAt && t.plateNumber) {
      events.push({
        id: `evt-sale-${t.id}`,
        timestamp: t.soldAt,
        action: 'VENTE EFFECTUÉE (PERCEPTION)',
        actorName: t.assignedAgentName || 'Agent',
        previousState: 'ASSIGNED_TO_AGENT',
        newState: 'SOLD',
        details: `Vente au camion ${t.plateNumber} (${t.price} FCFA)${t.driverPhone ? ` - Tél: ${t.driverPhone}` : ''}`,
        level: 'HIGHLIGHT',
      });
    }

    // 5. Contrôles routiers
    const relatedControls = params.controls.filter((c) => c.ticketNumber === t.ticketNumber);
    relatedControls.forEach((ctrl, idx) => {
      events.push({
        id: `evt-ctrl-${ctrl.id}`,
        timestamp: ctrl.controlledAt,
        action: `CONTRÔLE ROUTIER #${idx + 1}`,
        actorName: ctrl.controleurName,
        previousState: 'SOLD',
        newState: 'CONTROLLED',
        details: `${ctrl.isValid ? '🟢 Conforme' : '🔴 Non conforme'} - Immat: ${ctrl.plateNumber}. ${ctrl.validationMessage}`,
        level: ctrl.isValid ? 'NORMAL' : 'WARNING',
      });
    });

    // 6. Remplacement / Superseded
    if (t.isSuperseded) {
      events.push({
        id: `evt-super-${t.id}`,
        timestamp: t.createdAt,
        action: 'TICKET REMPLACÉ (SUPERSEDED)',
        actorName: 'ADMINISTRATEUR',
        newState: 'SUPERSEDED',
        details: `Remplacé par le ticket actif ${t.supersededByTicketNumber || ''}`,
        level: 'WARNING',
      });
    }

    // 7. Annulation
    if (t.status === 'CANCELLED' && t.cancelledAt) {
      events.push({
        id: `evt-cancel-${t.id}`,
        timestamp: t.cancelledAt,
        action: 'ANNULATION ADMINISTRATIVE',
        actorName: t.cancelledBy || 'ADMINISTRATEUR',
        newState: 'CANCELLED',
        details: `Motif d'annulation : ${t.cancellationReason || 'Non spécifié'}`,
        level: 'CRITICAL',
      });
    }

    // 8. Logs d'audit associés
    const relatedAudit = params.auditLogs.filter((a) => a.targetId === t.id || (JSON.stringify(a.details || {}).includes(t.ticketNumber)));
    relatedAudit.forEach((aud) => {
      if (!events.some((e) => e.timestamp === aud.timestamp)) {
        events.push({
          id: `evt-aud-${aud.id}`,
          timestamp: aud.timestamp,
          action: `ÉVÉNEMENT : ${aud.action}`,
          actorName: aud.actorName,
          actorRole: aud.actorRole,
          details: typeof aud.details === 'string' ? aud.details : JSON.stringify(aud.details || {}),
          level: 'NORMAL',
        });
      }
    });

    // Tri chronologique
    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },

  recordTicketReprint,
};
