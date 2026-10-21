import { useState, useCallback } from 'react';
import type { User, Role, Ticket } from '../../../types';
import { DEFAULT_SECTORS } from '../../../config/constants';
import { getDB } from '../../../db/indexedDb';
import { normalizeName, normalizePhone } from '../../../utils/normalization';
import { generateSecureToken } from '../../../utils/uuid';
import { SupabaseDataLayer, normalizeSectorId } from '../../../db/supabaseService';
import { safeFetchJson } from '../../../utils/safeApi';
import { usePortusStore } from '../../../store/usePortusStore';

export function useUsers(
  currentUser: User | null,
  recordAudit: (action: any, entity: string, id: string, details?: string, oldVal?: any, newVal?: any) => Promise<void>,
  refreshData: (forceSync?: boolean) => Promise<void>
) {
  const [users, setUsers] = useState<User[]>([]);

  const createUser = useCallback(async (userData: {
    username: string;
    fullName: string;
    role: Role;
    sectorId?: string;
    phone?: string;
    avatarUrl?: string;
    passwordRaw: string;
  }): Promise<User> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à créer un compte.');
    }

    const db = await getDB();
    const cleanUsername = userData.username.trim().toLowerCase();
    const normalizedFullName = normalizeName(userData.fullName);
    const normalizedPhone = normalizePhone(userData.phone || '');

    // Vérifier si l'utilisateur existe déjà
    const existing = await db.getFromIndex('users', 'by-username', cleanUsername);
    if (existing) {
      throw new Error(`Le nom d'utilisateur "${cleanUsername}" est déjà utilisé.`);
    }

    // Gouvernance U.J.P.A.S. : Pool global d'agents mobiles (aucun secteur fixe imposé aux agents)
    const effectiveSectorId = userData.role === 'RESPONSABLE' ? userData.sectorId : undefined;
    let newUser: User;

    if (SupabaseDataLayer.isAvailable()) {
      newUser = await SupabaseDataLayer.createAdminUser({
        username: cleanUsername,
        fullName: normalizedFullName,
        role: userData.role,
        sectorId: effectiveSectorId,
        phone: normalizedPhone,
        avatarUrl: userData.avatarUrl,
        passwordRaw: userData.passwordRaw,
      });
      if (userData.avatarUrl && !newUser.avatarUrl) {
        newUser.avatarUrl = userData.avatarUrl;
      }
      await db.put('users', newUser);
    } else {
      const sector = effectiveSectorId ? DEFAULT_SECTORS.find((s) => s.id === effectiveSectorId) : undefined;
      newUser = {
        id: `usr-${Date.now()}`,
        username: cleanUsername,
        fullName: normalizedFullName,
        role: userData.role,
        sectorId: effectiveSectorId,
        sectorName: sector?.name,
        phone: normalizedPhone,
        avatarUrl: userData.avatarUrl,
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.put('users', newUser);
    }

    await recordAudit(
      'USER_CREATED',
      'User',
      newUser.id,
      `Création du compte "${newUser.username}" avec le rôle ${newUser.role}${newUser.avatarUrl ? ' (Photo officielle jointe)' : ''}`
    );

    await refreshData();
    return newUser;
  }, [currentUser, recordAudit, refreshData]);

  const updateUser = useCallback(async (
    userId: string,
    updates: {
      fullName?: string;
      phone?: string;
      sectorId?: string;
      role?: Role;
      avatarUrl?: string;
    }
  ): Promise<User> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à modifier les informations des comptes.');
    }

    const db = await getDB();
    const user = await db.get('users', userId);
    if (!user) throw new Error('Utilisateur introuvable');

    const oldValues = {
      fullName: user.fullName,
      phone: user.phone,
      sectorId: user.sectorId,
      role: user.role,
      hasAvatar: Boolean(user.avatarUrl),
    };

    if (updates.fullName !== undefined) {
      user.fullName = normalizeName(updates.fullName);
    }
    if (updates.phone !== undefined) {
      user.phone = normalizePhone(updates.phone);
    }
    if (updates.role !== undefined) {
      user.role = updates.role;
    }
    if (updates.avatarUrl !== undefined) {
      user.avatarUrl = updates.avatarUrl || undefined;
    }

    if (user.role === 'AGENT' || user.role === 'CONTROLEUR' || user.role === 'ADMINISTRATEUR') {
      user.sectorId = undefined;
      user.sectorName = undefined;
    } else if (updates.sectorId !== undefined) {
      const normSector = normalizeSectorId(updates.sectorId);
      user.sectorId = normSector;
      const sector = DEFAULT_SECTORS.find((s) => s.id === normSector || s.id === updates.sectorId);
      user.sectorName = sector?.name || user.sectorName;
    }

    user.updatedAt = new Date().toISOString();
    await db.put('users', user);

    // MOUSE-CLICK INSTANT OPTIMISTIC UI UPDATE
    const updatedUserObj = { ...user };
    setUsers((prev) => prev.map((u) => (u.id === userId ? updatedUserObj : u)));
    const currentStoreUsers = usePortusStore.getState().users;
    usePortusStore.getState().setAllData({
      users: currentStoreUsers.map((u) => (u.id === userId ? updatedUserObj : u)),
    });

    if (SupabaseDataLayer.isAvailable()) {
      try {
        await SupabaseDataLayer.upsertProfile(user);
        const remoteUpdated = await SupabaseDataLayer.updateAdminUser(user.id, {
          username: user.username,
          fullName: user.fullName,
          phone: user.phone,
          sectorId: user.sectorId,
          role: user.role,
          avatarUrl: user.avatarUrl,
        });
        if (remoteUpdated) {
          const normRemoteSec = normalizeSectorId(remoteUpdated.sectorId, remoteUpdated.sectorName) || user.sectorId;
          user.role = remoteUpdated.role || user.role;
          user.fullName = remoteUpdated.fullName || user.fullName;
          user.phone = remoteUpdated.phone !== undefined ? remoteUpdated.phone : user.phone;
          user.sectorId = user.role === 'RESPONSABLE' ? normRemoteSec : undefined;
          user.sectorName = user.role === 'RESPONSABLE' ? (remoteUpdated.sectorName || user.sectorName) : undefined;
          if (remoteUpdated.avatarUrl !== undefined) {
            user.avatarUrl = remoteUpdated.avatarUrl;
          }
          await db.put('users', user);
        }
      } catch (e) {
        console.warn('[PORTUS DataContext] Supabase updateAdminUser notice:', e);
      }
    }

    await recordAudit(
      'USER_UPDATED',
      'User',
      user.id,
      `Mise à jour des informations pour ${user.fullName} (${user.username})`,
      oldValues,
      { ...updates, avatarUrl: updates.avatarUrl ? '[Photo Base64]' : undefined }
    );

    await refreshData();
    return user;
  }, [currentUser, recordAudit, refreshData]);

  const toggleUserActive = useCallback(async (userId: string): Promise<void> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à modifier le statut d’un compte.');
    }

    const db = await getDB();
    const user = await db.get('users', userId);
    if (!user) throw new Error('Utilisateur introuvable');

    const previousStatus = user.isActive;
    const willBeActive = !previousStatus;

    if (!willBeActive) {
      if (user.role === 'AGENT') {
        const allTickets: Ticket[] = await db.getAll('tickets');
        const agentUnsoldTickets = allTickets.filter(
          (t) =>
            t.assignedAgentId === user.id &&
            t.status !== 'SOLD' &&
            t.status !== 'CONTROLLED' &&
            t.status !== 'CANCELLED'
        );

        const allUsers: User[] = await db.getAll('users');
        let destinationResp = allUsers.find(
          (u) => u.role === 'RESPONSABLE' && u.isActive && (u.sectorId === user.sectorId || !user.sectorId)
        );
        if (!destinationResp) {
          destinationResp = allUsers.find((u) => u.role === 'RESPONSABLE' && u.isActive);
        }
        if (!destinationResp) {
          destinationResp = allUsers.find((u) => u.role === 'ADMINISTRATEUR' && u.isActive) || (currentUser ?? undefined);
        }

        const updatedTkts: Ticket[] = [];
        const asgRecords: any[] = [];
        for (const tkt of agentUnsoldTickets) {
          const respId = tkt.assignedResponsableId || destinationResp?.id || 'usr-resp-01';
          const respName = tkt.assignedResponsableName || destinationResp?.fullName || 'RESPONSABLE';

          tkt.status = 'ASSIGNED_TO_RESPONSIBLE';
          tkt.assignedResponsableId = respId;
          tkt.assignedResponsableName = respName;
          tkt.assignedAgentId = undefined;
          tkt.assignedAgentName = undefined;
          updatedTkts.push(tkt);

          if (db.objectStoreNames.contains('ticket_assignments')) {
            asgRecords.push({
              id: generateSecureToken('asg', 12),
              ticketId: tkt.id,
              carnetId: tkt.carnetId,
              fromProfileId: user.id,
              toProfileId: respId,
              assignedBy: currentUser?.id || 'admin',
              assignmentType: 'RETURN',
              notes: `Retour automatique au responsable suite à la désactivation de l'agent ${user.fullName}`,
              assignedAt: new Date().toISOString(),
            });
          }

          if (SupabaseDataLayer.isAvailable()) {
            SupabaseDataLayer.updateTicketStatus({
              ticketId: tkt.id,
              status: 'ASSIGNED_TO_RESPONSIBLE',
              assignedResponsableId: respId,
              assignedAgentId: null,
            }).catch(() => {});
          }
        }

        const tx = (db as any).transaction(
          db.objectStoreNames.contains('ticket_assignments') ? ['tickets', 'ticket_assignments'] : ['tickets'],
          'readwrite'
        );
        const tktStore = tx.objectStore('tickets');
        const promises = updatedTkts.map((t) => tktStore.put(t));
        if (db.objectStoreNames.contains('ticket_assignments')) {
          const asgStore = tx.objectStore('ticket_assignments');
          promises.push(...asgRecords.map((a) => asgStore.put(a)));
        }
        await Promise.all([...promises, tx.done]);

        await recordAudit(
          'USER_DEACTIVATED',
          'User',
          user.id,
          `Désactivation de l’agent ${user.fullName}. ${agentUnsoldTickets.length} ticket(s) non vendu(s) retourné(s) au responsable. Ventes historiques et audit préservés.`,
          { isActive: true, unsoldTicketsReturned: agentUnsoldTickets.length },
          { isActive: false }
        );
      } else if (user.role === 'RESPONSABLE') {
        const allUsers: User[] = await db.getAll('users');
        const adminUser =
          allUsers.find((u) => u.role === 'ADMINISTRATEUR' && u.isActive) ||
          currentUser || { id: 'usr-admin-01', fullName: 'YAO KOFFI ALEXIS' };

        const allTickets: Ticket[] = await db.getAll('tickets');
        const respUnsoldTickets = allTickets.filter(
          (t) => t.assignedResponsableId === user.id && t.status !== 'SOLD' && t.status !== 'CANCELLED'
        );

        const updatedRespTkts: Ticket[] = [];
        const respAsgRecords: any[] = [];
        for (const tkt of respUnsoldTickets) {
          tkt.assignedResponsableId = adminUser.id;
          tkt.assignedResponsableName = adminUser.fullName;
          if (tkt.status === 'ASSIGNED_TO_RESPONSIBLE') {
            tkt.status = 'AVAILABLE';
          }
          updatedRespTkts.push(tkt);

          if (db.objectStoreNames.contains('ticket_assignments')) {
            respAsgRecords.push({
              id: generateSecureToken('asg', 12),
              ticketId: tkt.id,
              carnetId: tkt.carnetId,
              fromProfileId: user.id,
              toProfileId: adminUser.id,
              assignedBy: currentUser?.id || adminUser.id,
              assignmentType: 'RETURN',
              notes: `Transfert automatique à l'administrateur suite à la désactivation du responsable ${user.fullName}`,
              assignedAt: new Date().toISOString(),
            });
          }

          if (SupabaseDataLayer.isAvailable()) {
            SupabaseDataLayer.updateTicketStatus({
              ticketId: tkt.id,
              status: tkt.status,
              assignedResponsableId: adminUser.id,
            }).catch(() => {});
          }
        }

        const allCarnets = await db.getAll('carnets');
        const respCarnets = allCarnets.filter((c: any) => c.assignedToResponsableId === user.id);
        for (const carnet of respCarnets) {
          carnet.assignedToResponsableId = adminUser.id;
          carnet.assignedToResponsableName = adminUser.fullName;
        }

        const storesList = ['tickets', 'carnets'];
        if (db.objectStoreNames.contains('ticket_assignments')) storesList.push('ticket_assignments');
        const respTx = (db as any).transaction(storesList, 'readwrite');
        const tStore = respTx.objectStore('tickets');
        const cStart = respTx.objectStore('carnets');
        const txPromises = [
          ...updatedRespTkts.map((t) => tStore.put(t)),
          ...respCarnets.map((c: any) => cStart.put(c)),
        ];
        if (db.objectStoreNames.contains('ticket_assignments')) {
          const aStore = respTx.objectStore('ticket_assignments');
          txPromises.push(...respAsgRecords.map((a) => aStore.put(a)));
        }
        await Promise.all([...txPromises, respTx.done]);

        await recordAudit(
          'USER_DEACTIVATED',
          'User',
          user.id,
          `Désactivation du responsable ${user.fullName}. ${respUnsoldTickets.length} ticket(s) non vendu(s) et ${respCarnets.length} carnet(s) transféré(s) à l’administrateur. Historique conservé.`,
          { isActive: true, unsoldTicketsTransferred: respUnsoldTickets.length },
          { isActive: false }
        );
      } else {
        await recordAudit(
          'USER_DEACTIVATED',
          'User',
          user.id,
          `Désactivation du compte pour ${user.fullName} (${user.role}). Historique conservé.`,
          { isActive: true },
          { isActive: false }
        );
      }

      user.isActive = false;
    } else {
      user.isActive = true;
      user.failedAttempts = 0;
      user.lockedUntil = null;

      await recordAudit(
        'USER_ACTIVATED',
        'User',
        user.id,
        `Réactivation du compte pour ${user.fullName} (${user.role})`,
        { isActive: false },
        { isActive: true }
      );
    }

    user.updatedAt = new Date().toISOString();
    await db.put('users', user);

    if (SupabaseDataLayer.isAvailable()) {
      try {
        await SupabaseDataLayer.updateAdminUser(user.id, {
          username: user.username,
          isActive: willBeActive,
        });
      } catch (e) {
        console.warn('[PORTUS DataContext] Supabase toggle active warning:', e);
      }
    }

    await refreshData();
  }, [currentUser, recordAudit, refreshData]);

  const resetUserPassword = useCallback(async (userId: string, newPasswordRaw: string): Promise<void> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à réinitialiser le mot de passe.');
    }

    const db = await getDB();
    const user = await db.get('users', userId);
    if (!user) throw new Error('Utilisateur introuvable');

    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.updatedAt = new Date().toISOString();
    await db.put('users', user);

    if (SupabaseDataLayer.isAvailable()) {
      await SupabaseDataLayer.resetAdminUserPassword(userId, newPasswordRaw);
    }

    await recordAudit(
      'PASSWORD_RESET',
      'User',
      user.id,
      `Réinitialisation du mot de passe pour ${user.fullName} (${user.username})`
    );

    await refreshData();
  }, [currentUser, recordAudit, refreshData]);

  const changeOwnPassword = useCallback(async (newPasswordRaw: string): Promise<void> => {
    if (!currentUser) {
      throw new Error('Vous devez être connecté pour changer votre mot de passe.');
    }

    const db = await getDB();
    const user = await db.get('users', currentUser.id);
    if (!user) throw new Error('Utilisateur introuvable');

    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.updatedAt = new Date().toISOString();
    await db.put('users', user);

    if (SupabaseDataLayer.isAvailable()) {
      await SupabaseDataLayer.resetAdminUserPassword(currentUser.id, newPasswordRaw);
    }

    await recordAudit(
      'PASSWORD_CHANGED',
      'User',
      user.id,
      `Changement de mot de passe par l'utilisateur lui-même : ${user.fullName} (${user.username})`
    );

    await refreshData();
  }, [currentUser, recordAudit, refreshData]);

  const resetApplicationData = useCallback(async (): Promise<void> => {
    if (currentUser && currentUser.role !== 'ADMINISTRATEUR') {
      throw new Error('Seul l’administrateur est autorisé à réinitialiser l’application.');
    }

    if (SupabaseDataLayer.isAvailable()) {
      try {
        const supabase = (await import('../../../db/supabaseClient')).getSupabase();
        const session = (await supabase?.auth.getSession())?.data.session;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = await safeFetchJson<{ error?: string }>('/api/admin/reset', {
          method: 'POST',
          headers,
          body: JSON.stringify({ confirmationPhrase: 'CONFIRMER' }),
        });

        if (!res.ok) {
          throw new Error(res.error || 'Erreur lors de la réinitialisation de la base de données distante.');
        }
      } catch (err: any) {
        console.warn('[DataContext] Échec réinitialisation via API backend, repli direct Supabase client:', err?.message);
        try {
          const supabase = (await import('../../../db/supabaseClient')).getSupabase();
          if (supabase) {
            await supabase.from('controls').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('fraud_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('ticket_status_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('ticket_assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('remittance_adjustments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('remittances').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('login_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            try { await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch {}

            const { data: sLeft } = await supabase.from('sales').select('ticket_id');
            const lockedIds = (sLeft || []).map((s: any) => s.ticket_id).filter(Boolean);
            if (lockedIds.length > 0) {
              await supabase.from('tickets').delete().not('id', 'in', `(${lockedIds.join(',')})`);
              try { await supabase.from('tickets').update({ status: 'CANCELLED' }).in('id', lockedIds); } catch {}
            } else {
              await supabase.from('tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            }

            const { data: tLeft } = await supabase.from('tickets').select('carnet_id');
            const lockedCarnets = Array.from(new Set((tLeft || []).map((t: any) => t.carnet_id).filter(Boolean)));
            if (lockedCarnets.length > 0) {
              await supabase.from('carnets').delete().not('id', 'in', `(${lockedCarnets.join(',')})`);
              try { await supabase.from('carnets').update({ status: 'CANCELLED' }).in('id', lockedCarnets); } catch {}
            } else {
              await supabase.from('carnets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            }
          }
        } catch (dbErr: any) {
          console.error('[DataContext] Échec complet de la purge distante directe:', dbErr?.message);
        }
      }
    }

    const db = await getDB();
    const stores = [
      'carnets',
      'tickets',
      'sales',
      'controls',
      'fraud_reports',
      'remises',
      'expenses',
      'ticket_assignments',
      'notifications',
      'login_attempts',
    ];

    const tx = db.transaction(stores as any, 'readwrite');
    for (const store of stores) {
      if (db.objectStoreNames.contains(store as any)) {
        await tx.objectStore(store as any).clear();
      }
    }
    await tx.done;

    await db.put('settings', false, 'is_initialized');

    await recordAudit(
      'DATABASE_RESET',
      'System',
      'all',
      `Réinitialisation complète de l'application et de la base de données par l'administrateur.`
    );
  }, [currentUser, recordAudit]);

  return {
    users,
    setUsers,
    createUser,
    updateUser,
    toggleUserActive,
    resetUserPassword,
    changeOwnPassword,
    resetApplicationData,
  };
}
