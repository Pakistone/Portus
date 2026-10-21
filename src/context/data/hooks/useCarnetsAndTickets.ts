import { useState, useCallback } from 'react';
import type { Carnet, Ticket, TicketStatus, User, NotificationRecord } from '../../../types';
import { CARNET_SIZE_MULTIPLE } from '../../../config/constants';
import { getDB } from '../../../db/indexedDb';
import { normalizePlate, normalizeText } from '../../../utils/normalization';
import { generateSecureToken, generateUUID } from '../../../utils/uuid';
import { buildTicketQRPayload, assertTicketStatusTransition } from '../../../utils/ticketSecurity';
import { SupabaseDataLayer } from '../../../db/supabaseService';
import { safeFetchJson } from '../../../utils/safeApi';
import { showToast } from '../../../components/common/ToastNotification';
import { recordDeletedCarnet } from '../constants';
import { usePortusStore } from '../../../store/usePortusStore';

export function useCarnetsAndTickets(
  currentUser: User | null,
  ticketPrice: number,
  recordAudit: (
    action: import('../../../types').AuditAction,
    entity: string,
    id: string,
    details?: string,
    oldVal?: import('./useAuditLogs').AuditLogValue,
    newVal?: import('./useAuditLogs').AuditLogValue
  ) => Promise<void>,
  refreshData: (forceSync?: boolean) => Promise<void>,
  setNotifications: React.Dispatch<React.SetStateAction<NotificationRecord[]>>
) {
  const [carnets, setCarnets] = useState<Carnet[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  const createCarnet = useCallback(async (params: {
    seriesPrefix?: string;
    size: number;
    startPhysicalNumber?: number;
    assignedResponsableId?: string;
  }): Promise<{ carnet: Carnet; tickets: Ticket[] }> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à générer un carnet.');
    }

    if (!params.size || params.size <= 0 || params.size % CARNET_SIZE_MULTIPLE !== 0) {
      throw new Error(
        `Le nombre de tickets doit obligatoirement être un multiple de 3 (ex: 3, 6, 9, 12, 15... 150, 153). Valeur reçue: ${params.size}. Toute autre valeur est refusée.`
      );
    }

    const db = await getDB();
    const cleanPrefix = normalizeText(params.seriesPrefix || '') || 'VRD';

    const allCarnets: Carnet[] = await db.getAll('carnets');
    const currentYear = new Date().getFullYear();
    let maxIdx = 0;
    const pattern = new RegExp(`^C-${currentYear}-(\\d+)$`);
    for (const c of allCarnets) {
      if (c.carnetNumber) {
        const match = c.carnetNumber.match(pattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxIdx) maxIdx = num;
        }
      }
    }
    let carnetIndex = Math.max(maxIdx + 1, allCarnets.length + 1);
    let carnetNumber = `C-${currentYear}-${String(carnetIndex).padStart(3, '0')}`;
    const existingCarnetNumbers = new Set(allCarnets.map((c) => c.carnetNumber));
    while (existingCarnetNumbers.has(carnetNumber)) {
      carnetIndex++;
      carnetNumber = `C-${currentYear}-${String(carnetIndex).padStart(3, '0')}`;
    }

    const carnetId = generateUUID();

    let responsableName: string | undefined = undefined;
    let sectorId: string | undefined = undefined;
    let sectorName: string | undefined = undefined;

    if (params.assignedResponsableId) {
      const resp = await db.get('users', params.assignedResponsableId);
      if (resp) {
        responsableName = resp.fullName;
        sectorId = resp.sectorId;
        sectorName = resp.sectorName;
      }
    }

    const startNum = params.startPhysicalNumber && params.startPhysicalNumber > 0 ? params.startPhysicalNumber : 1;
    const endNum = startNum + params.size - 1;

    const carnetStatus = params.assignedResponsableId ? 'ASSIGNED_TO_RESPONSIBLE' : 'GENERATED';

    const now = new Date();
    const nowIso = now.toISOString();

    const carnet: Carnet = {
      id: carnetId,
      carnetNumber,
      seriesPrefix: cleanPrefix,
      size: params.size,
      startNumber: startNum,
      endNumber: endNum,
      createdById: currentUser?.id || 'admin',
      createdByName: currentUser?.fullName || 'ADMINISTRATEUR',
      assignedToResponsableId: params.assignedResponsableId,
      assignedToResponsableName: responsableName,
      assignedAt: params.assignedResponsableId ? nowIso : undefined,
      assignedById: params.assignedResponsableId ? (currentUser?.id || 'admin') : undefined,
      assignedByName: params.assignedResponsableId ? (currentUser?.fullName || 'ADMINISTRATEUR') : undefined,
      sectorId,
      sectorName,
      createdAt: nowIso,
      updatedAt: nowIso,
      status: carnetStatus,
    };

    await db.put('carnets', carnet);

    const tx = db.transaction('tickets', 'readwrite');
    const createdTickets: Ticket[] = [];

    for (let i = startNum; i <= endNum; i++) {
      const ticketId = generateUUID();
      const ticketPhysicalNumber = `${cleanPrefix}-${String(i).padStart(6, '0')}`;

      const qrPayload = buildTicketQRPayload({
        ticketId,
        carnetId,
        carnetNumber,
        ticketNumber: ticketPhysicalNumber,
        carnetCreatedAt: nowIso,
      });

      const ticketStatus = params.assignedResponsableId ? 'ASSIGNED_TO_RESPONSIBLE' : 'GENERATED';

      const tkt: Ticket = {
        id: ticketId,
        ticketNumber: ticketPhysicalNumber,
        carnetId,
        carnetNumber,
        qrPayload,
        status: ticketStatus,
        price: ticketPrice,
        assignedResponsableId: params.assignedResponsableId,
        assignedResponsableName: responsableName,
        sectorId,
        sectorName,
        controlCount: 0,
        createdAt: nowIso,
      };
      createdTickets.push(tkt);
    }
    await Promise.all([...createdTickets.map((t) => tx.store.put(t)), tx.done]);

    if (params.assignedResponsableId && responsableName) {
      if (db.objectStoreNames.contains('ticket_assignments')) {
        await db.put('ticket_assignments', {
          id: `asg-carnet-${carnetId}-${Date.now()}`,
          ticketId: carnetId,
          carnetId: carnetId,
          fromProfileId: currentUser?.id || 'admin',
          toProfileId: params.assignedResponsableId,
          assignedBy: currentUser?.id || 'admin',
          assignmentType: 'RESPONSABLE_ASSIGNMENT',
          notes: `Attribution automatique du carnet ${carnetNumber} (${params.size} tickets) au responsable ${responsableName}`,
          assignedAt: nowIso,
        });
      }
    }

    await recordAudit(
      'CARNET_GENERATED',
      'Carnet',
      carnetId,
      `Génération du carnet ${carnetNumber} (${params.size} tickets de ${cleanPrefix}-${String(startNum).padStart(6, '0')} à ${cleanPrefix}-${String(endNum).padStart(6, '0')})${responsableName ? ` - Attribué au responsable ${responsableName}` : ''}`
    );

    if (params.assignedResponsableId && responsableName) {
      await recordAudit(
        'CARNET_ASSIGNED_RESPONSABLE',
        'Carnet',
        carnetId,
        `Attribution du carnet ${carnetNumber} (${params.size} tickets) au responsable ${responsableName} par ${currentUser?.fullName || 'ADMINISTRATEUR'} le ${nowIso.slice(0, 10)} à ${now.toTimeString().slice(0, 8)}.`
      );
    }

    setCarnets((prev) => [carnet, ...prev.filter((c) => c.id !== carnet.id)]);
    const createdTicketIds = new Set(createdTickets.map((t) => t.id));
    setTickets((prev) => [...createdTickets, ...prev.filter((t) => !createdTicketIds.has(t.id))]);

    showToast(
      'success',
      'Carnet Généré',
      `Le carnet ${carnetNumber} (${params.size} tickets) a été généré avec succès.`
    );

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertCarnet(carnet, createdTickets).catch((err) => {
        console.warn('Erreur insertion carnet Supabase:', err);
      });
    }

    return { carnet, tickets: createdTickets };
  }, [currentUser, ticketPrice, recordAudit]);

  const assignCarnetToResponsable = useCallback(async (
    carnetId: string,
    responsableId: string
  ): Promise<Carnet> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à attribuer un carnet.');
    }

    const db = await getDB();
    const carnet = await db.get('carnets', carnetId);
    if (!carnet) throw new Error('Carnet introuvable.');

    const responsable = await db.get('users', responsableId);
    if (!responsable) throw new Error('Responsable introuvable.');
    if (responsable.role !== 'RESPONSABLE') {
      throw new Error('L’utilisateur sélectionné doit posséder le rôle RESPONSABLE.');
    }
    if (!responsable.isActive) {
      throw new Error(`Le responsable ${responsable.fullName} est actuellement désactivé.`);
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8);
    const nowIso = now.toISOString();

    carnet.assignedToResponsableId = responsable.id;
    carnet.assignedToResponsableName = responsable.fullName;
    carnet.assignedAt = nowIso;
    carnet.assignedById = currentUser?.id || 'admin';
    carnet.assignedByName = currentUser?.fullName || 'ADMINISTRATEUR';
    carnet.sectorId = responsable.sectorId;
    carnet.sectorName = responsable.sectorName;
    carnet.status = 'ASSIGNED_TO_RESPONSIBLE';
    carnet.updatedAt = nowIso;
    await db.put('carnets', carnet);

    const allTickets: Ticket[] = await db.getAll('tickets');
    const carnetTickets = allTickets.filter((t) => t.carnetId === carnet.id);

    const tx = db.transaction('tickets', 'readwrite');
    const store = tx.objectStore('tickets');
    let updatedCount = 0;
    const modifiedTickets: Ticket[] = [];
    for (const t of carnetTickets) {
      if (t.status === 'GENERATED' || t.status === 'AVAILABLE') {
        t.status = 'ASSIGNED_TO_RESPONSIBLE';
        t.assignedResponsableId = responsable.id;
        t.assignedResponsableName = responsable.fullName;
        t.sectorId = responsable.sectorId;
        t.sectorName = responsable.sectorName;
        t.updatedAt = nowIso;
        modifiedTickets.push(t);
        updatedCount++;
      }
    }
    await Promise.all([...modifiedTickets.map((t) => store.put(t)), tx.done]);

    if (db.objectStoreNames.contains('ticket_assignments')) {
      await db.put('ticket_assignments', {
        id: `asg-${carnet.id}-${Date.now()}`,
        ticketId: carnet.id,
        carnetId: carnet.id,
        fromProfileId: currentUser?.id || 'admin',
        toProfileId: responsable.id,
        assignedBy: currentUser?.id || 'admin',
        assignmentType: 'RESPONSABLE_ASSIGNMENT',
        notes: `Attribution du carnet ${carnet.carnetNumber} (${carnet.size} tickets) au responsable ${responsable.fullName}`,
        assignedAt: nowIso,
      });
    }

    await recordAudit(
      'CARNET_ASSIGNED_RESPONSABLE',
      'Carnet',
      carnet.id,
      `Attribution du carnet ${carnet.carnetNumber} (${carnet.size} tickets, dont ${updatedCount} transférés) au responsable ${responsable.fullName} par l'administrateur ${currentUser?.fullName || 'ADMINISTRATEUR'} le ${dateStr} à ${timeStr}.`
    );

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.assignCarnet(carnet.id, responsable.id, responsable.sectorId || '').catch((err) => {
        console.warn('Erreur synchro attribution carnet Supabase:', err);
      });
    }

    await refreshData();
    return carnet;
  }, [currentUser, recordAudit, refreshData]);

  const cancelCarnet = useCallback(async (carnetId: string, reason: string): Promise<Carnet> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à annuler un carnet.');
    }
    const cleanReason = normalizeText(reason);
    if (!cleanReason) {
      throw new Error('Un motif d’annulation est obligatoire.');
    }

    try {
      const supabase = (await import('../../../db/supabaseClient')).getSupabase();
      const session = (await supabase?.auth.getSession())?.data.session;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await safeFetchJson<{ error?: string }>(`/api/carnets/${encodeURIComponent(carnetId)}/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: cleanReason }),
      });

      if (!res.ok) {
        try {
          await supabase?.from('carnets').update({ status: 'CANCELLED' }).eq('id', carnetId);
        } catch (dbErr) {
          console.warn('[DataContext] cancelCarnet direct Supabase fallback warning:', dbErr);
        }
      }
    } catch (err: any) {
      console.warn('[DataContext] cancelCarnet notice:', err?.message);
    }

    const db = await getDB();
    const carnet = await db.get('carnets', carnetId);
    if (!carnet) throw new Error('Carnet introuvable localement.');

    carnet.status = 'CANCELLED';
    carnet.updatedAt = new Date().toISOString();
    await db.put('carnets', carnet);

    const allTickets: Ticket[] = await db.getAll('tickets');
    const carnetTickets = allTickets.filter((t) => t.carnetId === carnet.id);

    const tx = db.transaction('tickets', 'readwrite');
    const store = tx.objectStore('tickets');
    let cancelledCount = 0;
    const nowIso = new Date().toISOString();
    const cancelledTickets: Ticket[] = [];
    for (const t of carnetTickets) {
      if (t.status !== 'SOLD' && t.status !== 'CONTROLLED') {
        t.status = 'CANCELLED';
        t.cancelledAt = nowIso;
        t.cancelledBy = currentUser?.fullName;
        t.cancellationReason = cleanReason;
        cancelledTickets.push(t);
        cancelledCount++;
      }
    }
    await Promise.all([...cancelledTickets.map((t) => store.put(t)), tx.done]);

    await recordAudit(
      'CARNET_CANCELLED',
      'Carnet',
      carnet.id,
      `Annulation du carnet ${carnet.carnetNumber} (${cancelledCount} tickets non vendus annulés). Motif : ${cleanReason}`
    );

    await refreshData(true);
    return carnet;
  }, [currentUser, recordAudit, refreshData]);

  const deleteCarnet = useCallback(async (carnetId: string): Promise<void> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à supprimer un carnet.');
    }

    const db = await getDB();
    const carnet = (await db.get('carnets', carnetId)) || carnets.find((c) => c.id === carnetId || c.carnetNumber === carnetId);
    const carnetNumber = carnet?.carnetNumber || carnetId;

    recordDeletedCarnet(carnetId, carnetNumber);

    setCarnets((prev) => prev.filter((c) => c.id !== carnetId && c.carnetNumber !== carnetNumber));
    setTickets((prev) => prev.filter((t) => t.carnetId !== carnetId && t.carnetNumber !== carnetNumber));

    if (SupabaseDataLayer.isAvailable()) {
      try {
        const res = await safeFetchJson<{ success?: boolean; message?: string; error?: string }>(
          `/api/carnets/${encodeURIComponent(carnetId)}`,
          {
            method: 'DELETE',
          }
        );

        if (!res.ok) {
          console.warn('[DataContext] Réponse API suppression distante:', res.error);
          try {
            const supabase = (await import('../../../db/supabaseClient')).getSupabase();
            await supabase?.from('tickets').delete().eq('carnet_id', carnetId);
            await supabase?.from('carnets').delete().eq('id', carnetId);
          } catch (fallbackErr: any) {
            console.warn('[DataContext] Secours suppression distante direct:', fallbackErr?.message);
          }
        }
      } catch (err: any) {
        console.warn('[DataContext] Échec suppression distante via API backend:', err?.message);
      }
    }

    const allTickets: Ticket[] = await db.getAll('tickets');
    const carnetTickets = allTickets.filter((t) => t.carnetId === carnetId || (carnet && t.carnetNumber === carnet.carnetNumber));
    const ticketIds = carnetTickets.map((t) => t.id);
    const ticketNumbers = carnetTickets.map((t) => t.ticketNumber).filter(Boolean) as string[];

    if (ticketIds.length > 0) {
      const allSales = await db.getAll('sales');
      const salesToDelete = allSales.filter((s: any) => ticketIds.includes(s.ticketId));
      if (salesToDelete.length > 0) {
        const txSales = db.transaction('sales', 'readwrite');
        await Promise.all([...salesToDelete.map((s: any) => txSales.store.delete(s.id)), txSales.done]);
      }

      const allControls = await db.getAll('controls');
      const controlsToDelete = allControls.filter((c: any) => c.ticketId && ticketIds.includes(c.ticketId));
      if (controlsToDelete.length > 0) {
        const txControls = db.transaction('controls', 'readwrite');
        await Promise.all([...controlsToDelete.map((c: any) => txControls.store.delete(c.id)), txControls.done]);
      }

      const allFrauds = await db.getAll('fraud_reports');
      const fraudsToDelete = allFrauds.filter((f: any) => f.ticketNumber && ticketNumbers.includes(f.ticketNumber));
      if (fraudsToDelete.length > 0) {
        const txFrauds = db.transaction('fraud_reports', 'readwrite');
        await Promise.all([...fraudsToDelete.map((f: any) => txFrauds.store.delete(f.id)), txFrauds.done]);
      }

      const allAssignments = await db.getAll('ticket_assignments');
      const assignmentsToDelete = allAssignments.filter((a: any) => a.ticketId && ticketIds.includes(a.ticketId));
      if (assignmentsToDelete.length > 0) {
        const txAssignments = db.transaction('ticket_assignments', 'readwrite');
        await Promise.all([...assignmentsToDelete.map((a: any) => txAssignments.store.delete(a.id)), txAssignments.done]);
      }

      const txTickets = db.transaction('tickets', 'readwrite');
      await Promise.all([...ticketIds.map((tId) => txTickets.store.delete(tId)), txTickets.done]);
    }

    await db.delete('carnets', carnetId);

    showToast(
      'success',
      'Carnet supprimé',
      `Le carnet ${carnetNumber} et tous ses tickets associés ont été définitivement supprimés.`
    );

    const notif: NotificationRecord = {
      id: generateSecureToken('notif', 12),
      recipientId: currentUser?.id || 'admin',
      title: 'Carnet Supprimé',
      message: `Le carnet ${carnetNumber} et tous ses tickets associés ont été définitivement supprimés par ${currentUser?.fullName || 'l’administrateur'}.`,
      level: 'INFO',
      type: 'SYSTEM',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setNotifications((prev) => [notif, ...prev]);

    await recordAudit(
      'CARNET_CANCELLED',
      'Carnet',
      carnetId,
      `Suppression définitive du carnet ${carnetNumber} et de tous ses tickets associés par l'administrateur.`
    );

    await refreshData(false);
  }, [currentUser, carnets, setNotifications, recordAudit, refreshData]);

  const updateTicketStatus = useCallback(async (
    ticketId: string,
    newStatus: TicketStatus,
    reason?: string
  ): Promise<Ticket> => {
    const db = await getDB();
    const ticket = await db.get('tickets', ticketId);
    if (!ticket) throw new Error('Ticket introuvable.');

    assertTicketStatusTransition(ticket.ticketNumber, ticket.status, newStatus);

    const oldStatus = ticket.status;
    ticket.status = newStatus;

    if (newStatus === 'CANCELLED') {
      ticket.cancelledAt = new Date().toISOString();
      ticket.cancelledBy = currentUser?.fullName;
      ticket.cancellationReason = reason ? normalizeText(reason) : 'Annulation administrative';
    }

    await db.put('tickets', ticket);

    await recordAudit(
      'TICKET_CANCELLED',
      'Ticket',
      ticket.id,
      `Transition de statut du ticket ${ticket.ticketNumber} : [${oldStatus}] -> [${newStatus}]${reason ? ` (Motif : ${reason})` : ''}`,
      { status: oldStatus },
      { status: newStatus }
    );

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.updateTicketStatus({
        ticketId: ticket.id,
        status: newStatus,
      }).catch(() => {});
    }

    await refreshData();
    return ticket;
  }, [currentUser, recordAudit, refreshData]);

  const cancelTicket = useCallback(async (ticketId: string, reason: string): Promise<void> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Violation de privilège : Un responsable ou agent ne peut jamais annuler un ticket. Seul l’administrateur général est habilité.');
    }
    const cleanReason = normalizeText(reason);
    if (!cleanReason) {
      throw new Error('Un motif d’annulation est obligatoire.');
    }

    try {
      const supabase = (await import('../../../db/supabaseClient')).getSupabase();
      const session = (await supabase?.auth.getSession())?.data.session;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await safeFetchJson<{ error?: string }>(`/api/tickets/${encodeURIComponent(ticketId)}/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: cleanReason }),
      });

      if (!res.ok) {
        try {
          await supabase?.from('tickets').update({
            status: 'CANCELLED',
            cancelled_at: new Date().toISOString(),
            cancelled_by: currentUser?.id,
            cancellation_reason: cleanReason,
          }).eq('id', ticketId);
        } catch (dbErr) {
          console.warn('[DataContext] cancelTicket direct Supabase fallback warning:', dbErr);
        }
      }
    } catch (err: any) {
      console.warn('[DataContext] cancelTicket notice:', err?.message);
    }

    const db = await getDB();
    const ticket = await db.get('tickets', ticketId);
    if (!ticket) throw new Error('Ticket introuvable localement');

    const previousStatus = ticket.status;
    ticket.status = 'CANCELLED';
    ticket.cancelledAt = new Date().toISOString();
    ticket.cancelledBy = currentUser?.fullName;
    ticket.cancellationReason = cleanReason;
    await db.put('tickets', ticket);

    await recordAudit(
      'TICKET_CANCELLED',
      'Ticket',
      ticket.id,
      `Annulation du ticket ${ticket.ticketNumber}. Raison: ${reason}`,
      { status: previousStatus },
      { status: 'CANCELLED' }
    );

    await refreshData(true);
  }, [currentUser, recordAudit, refreshData]);

  const assignTicketsToAgent = useCallback(async (
    ticketIds: string[],
    agentId: string
  ): Promise<{ count: number; ticketNumbers: string[] }> => {
    if (!ticketIds || ticketIds.length === 0) {
      throw new Error('Aucun ticket sélectionné pour l\'attribution.');
    }

    if (currentUser && (currentUser.role === 'AGENT' || currentUser.role === 'CONTROLEUR')) {
      throw new Error("Violation de privilège : Les agents et contrôleurs ne peuvent pas attribuer de tickets.");
    }

    const db = await getDB();
    const agent = await db.get('users', agentId);
    if (!agent) throw new Error('Agent introuvable');
    if (!agent.isActive) {
      throw new Error(`Impossible d'attribuer des tickets à un agent inactif (${agent.fullName}).`);
    }
    if (agent.role !== 'AGENT') {
      throw new Error(`L'utilisateur sélectionné (${agent.fullName}) n'a pas le rôle AGENT.`);
    }

    // RÈGLE DE GARDE SÉCURISÉE : Empêcher la double attribution à un agent qui a déjà des tickets actifs (ASSIGNE_AGENT)
    const allTicketsInDb: Ticket[] = await db.getAll('tickets');
    const activeAgentTickets = allTicketsInDb.filter(
      (t) =>
        t.assignedAgentId === agent.id &&
        ((t.status as string) === 'ASSIGNED_TO_AGENT' || (t.status as string) === 'ASSIGNE_AGENT')
    );

    if (activeAgentTickets.length > 0) {
      throw new Error(
        `Attribution impossible : L'agent ${agent.fullName} possède déjà ${activeAgentTickets.length} ticket(s) actif(s) non encore épuisé(s) (Statut : ASSIGNE_AGENT). L'agent doit obligatoirement solder ou remettre ses tickets en cours avant de recevoir une nouvelle attribution.`
      );
    }

    for (const tId of ticketIds) {
      const ticket = await db.get('tickets', tId);
      if (!ticket) throw new Error(`Ticket introuvable (ID: ${tId}).`);

      if (ticket.status === 'SOLD' || ticket.status === 'CONTROLLED') {
        throw new Error(
          `Règle de sécurité violée : Le ticket ${ticket.ticketNumber} est déjà VENDU et ne peut jamais être réattribué.`
        );
      }

      if (ticket.status === 'CANCELLED') {
        throw new Error(
          `Règle de sécurité violée : Le ticket ${ticket.ticketNumber} est ANNULÉ et ne peut pas être attribué.`
        );
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = nowIso.slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8);
    const responsableName = currentUser?.fullName || 'RESPONSABLE';
    const actorName = currentUser?.fullName || currentUser?.username || 'RESPONSABLE';

    const updatedTickets: Ticket[] = [];
    const assignmentRecords: any[] = [];
    const previousAgentsSet = new Set<string>();

    const tx = db.transaction(['tickets', 'ticket_assignments'], 'readwrite');
    for (const tId of ticketIds) {
      const ticket = await tx.objectStore('tickets').get(tId);
      if (!ticket) continue;

      const oldAgentId = ticket.assignedAgentId;
      const oldAgentName = ticket.assignedAgentName;
      if (oldAgentName && oldAgentId !== agent.id) {
        previousAgentsSet.add(oldAgentName);
      }

      ticket.assignedAgentId = agent.id;
      ticket.assignedAgentName = agent.fullName;
      if (currentUser?.role === 'RESPONSABLE') {
        ticket.assignedResponsableId = currentUser.id;
        ticket.assignedResponsableName = currentUser.fullName;
      }
      ticket.sectorId = agent.sectorId || ticket.sectorId;
      ticket.sectorName = agent.sectorName || ticket.sectorName;
      ticket.status = 'ASSIGNED_TO_AGENT';
      ticket.updatedAt = nowIso;

      updatedTickets.push(ticket);

      assignmentRecords.push({
        id: generateSecureToken('asg', 12),
        ticketId: ticket.id,
        carnetId: ticket.carnetId,
        fromProfileId: oldAgentId || currentUser?.id,
        toProfileId: agent.id,
        assignedBy: currentUser?.id || 'resp',
        assignmentType: oldAgentId ? 'REASSIGNMENT' : 'AGENT_ASSIGNMENT',
        notes: oldAgentId
          ? `Réattribution du ticket ${ticket.ticketNumber} de ${oldAgentName} vers ${agent.fullName}`
          : `Attribution initiale du ticket ${ticket.ticketNumber} à ${agent.fullName}`,
        assignedAt: nowIso,
      });
    }

    await Promise.all([
      ...updatedTickets.map((t) => tx.objectStore('tickets').put(t)),
      ...assignmentRecords.map((a) => tx.objectStore('ticket_assignments').put(a)),
      tx.done,
    ]);

    const updatedTicketsMap = new Map(updatedTickets.map((t) => [t.id, { ...t }]));
    setTickets((prev) => prev.map((t) => updatedTicketsMap.get(t.id) || t));
    const currentStoreTickets = usePortusStore.getState().tickets;
    usePortusStore.getState().setAllData({
      tickets: currentStoreTickets.map((t) => updatedTicketsMap.get(t.id) || t),
    });

    const count = updatedTickets.length;
    const isReassignment = previousAgentsSet.size > 0;
    const oldAgentsSummary = isReassignment
      ? Array.from(previousAgentsSet).join(', ')
      : 'Aucun (Stock Responsable)';
    const ticketNumbers = updatedTickets.map((t) => t.ticketNumber);

    await recordAudit(
      isReassignment ? 'TICKETS_REASSIGNED' : 'TICKETS_ASSIGNED_AGENT',
      'Tickets',
      agent.id,
      `Attribution de ${count} ticket(s) à l'agent ${agent.fullName}. Tickets: ${ticketNumbers.slice(0, 20).join(', ')}${count > 20 ? '...' : ''}. Ancien agent: ${oldAgentsSummary}. Responsable: ${responsableName}. Date: ${dateStr}, Heure: ${timeStr}. Acteur: ${actorName}.`,
      { previousAgents: oldAgentsSummary, status: isReassignment ? 'ASSIGNED_TO_AGENT' : 'AVAILABLE' },
      { newAgentId: agent.id, newAgentName: agent.fullName, status: 'ASSIGNED_TO_AGENT', count }
    );

    const notifMessage = `${count} NOUVEAUX TICKETS VOUS ONT ÉTÉ ATTRIBUÉS`;
    const notif: NotificationRecord = {
      id: generateSecureToken('notif', 12),
      recipientId: agent.id,
      senderId: currentUser?.id,
      title: 'ATTRIBUTION DE TICKETS',
      message: notifMessage,
      level: 'INFO',
      type: 'ASSIGNMENT',
      metadata: {
        ticketCount: count,
        ticketNumbers,
        carnets: Array.from(new Set(updatedTickets.map((t) => t.carnetNumber))),
        assignedBy: responsableName,
        date: dateStr,
        time: timeStr,
      },
      isRead: false,
      createdAt: nowIso,
    };

    if (db.objectStoreNames.contains('notifications')) {
      await db.put('notifications', notif);
    }

    if (SupabaseDataLayer.isAvailable()) {
      SupabaseDataLayer.insertNotification(notif).catch(() => {});
      for (const t of updatedTickets) {
        SupabaseDataLayer.updateTicketStatus({
          ticketId: t.id,
          status: 'ASSIGNED_TO_AGENT',
          assignedAgentId: agent.id,
          assignedResponsableId: t.assignedResponsableId,
        }).catch(() => {});
      }
      try {
        const supabase = (await import('../../../db/supabaseClient')).getSupabase();
        const session = (await supabase?.auth.getSession())?.data.session;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        await safeFetchJson('/api/tickets/assign', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ticketIds,
            agentId: agent.id,
            responsibleId: currentUser?.id,
          }),
        });
      } catch (err) {
        console.warn('[DataContext] Erreur réseau lors de l’attribution:', err);
      }
    }

    await refreshData();
    return { count, ticketNumbers };
  }, [currentUser, recordAudit, refreshData]);

  const reassignUnsoldTickets = useCallback(async (
    ticketIds: string[],
    newAgentId: string
  ): Promise<{ count: number; ticketNumbers: string[] }> => {
    return assignTicketsToAgent(ticketIds, newAgentId);
  }, [assignTicketsToAgent]);

  const correctPlateNumber = useCallback(async (
    ticketId: string,
    newPlate: string,
    reason: string
  ): Promise<void> => {
    const db = await getDB();
    const ticket = await db.get('tickets', ticketId);
    if (!ticket) throw new Error('Ticket introuvable');

    const normalizedNewPlate = normalizePlate(newPlate);
    const oldPlate = ticket.plateNumber;
    ticket.plateNumber = normalizedNewPlate;
    await db.put('tickets', ticket);

    if (ticket.saleId) {
      const sale = await db.get('sales', ticket.saleId);
      if (sale) {
        sale.plateNumber = normalizedNewPlate;
        await db.put('sales', sale);
      }
    }

    await recordAudit(
      'PLATE_CORRECTED',
      'Ticket',
      ticket.id,
      `Correction d'immatriculation pour le ticket ${ticket.ticketNumber} : ${oldPlate} -> ${normalizedNewPlate}. Motif: ${reason}`,
      { plateNumber: oldPlate },
      { plateNumber: normalizedNewPlate }
    );

    await refreshData();
  }, [recordAudit, refreshData]);

  return {
    carnets,
    setCarnets,
    tickets,
    setTickets,
    createCarnet,
    assignCarnetToResponsable,
    cancelCarnet,
    deleteCarnet,
    updateTicketStatus,
    cancelTicket,
    assignTicketsToAgent,
    reassignUnsoldTickets,
    correctPlateNumber,
  };
}
