/**
 * Service Métier Supabase PostgreSQL pour PORTUS — U.J.S.R.V.
 * Fournit la couche d'accès aux données pour l'ensemble des tables :
 * profiles, roles, sectors, carnets, tickets, ticket_assignments,
 * sales, controls, fraud_reports, remittances, remittance_adjustments,
 * notifications, audit_logs, login_attempts, sync_queue, app_settings.
 */

import { getSupabase } from './supabaseClient';
import { safeFetchJson } from '../utils/safeApi';
import type {
  User,
  Carnet,
  Ticket,
  TicketStatus,
  Sale,
  Control,
  FraudReport,
  Remise,
  AuditLog,
  FinancialAlert,
  Expense,
  DailyClosing,
  Vehicle,
  TicketReprint,
} from '../types';

let rlsPermissionIssueDetected = false;
let lastRlsErrorMessage = '';

export function isRlsPermissionIssueDetected(): boolean {
  return rlsPermissionIssueDetected;
}

export function getLastRlsErrorMessage(): string {
  return lastRlsErrorMessage;
}

export function resetRlsPermissionIssue(): void {
  rlsPermissionIssueDetected = false;
  lastRlsErrorMessage = '';
}

const DEFAULT_ADMIN_UUID = 'db2145a8-bdd8-492c-a2b4-f20126881b30';

function sanitizeUuid(val?: string | null, defaultUuid = DEFAULT_ADMIN_UUID): string {
  if (!val) return defaultUuid;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(val)) return val;

  const sectorMap: Record<string, string> = {
    'sec-vridi-port': '3a87f0f7-6141-45c2-a8c8-028d3b6cd734',
    'sec-vridi-canal': 'e5dc1193-2741-4865-8379-4e8ab031cdfe',
    'sec-vridi-zi': '5ebd07c5-ff87-4d8c-a535-43d10580b506',
    'sec-vridi-sir': '6c8a2f18-ff61-416f-a1cf-a05edfdc8862',
  };
  if (sectorMap[val]) return sectorMap[val];

  return defaultUuid;
}

function sanitizeUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(val)) return val;

  const sectorMap: Record<string, string> = {
    'sec-vridi-port': '3a87f0f7-6141-45c2-a8c8-028d3b6cd734',
    'sec-vridi-canal': 'e5dc1193-2741-4865-8379-4e8ab031cdfe',
    'sec-vridi-zi': '5ebd07c5-ff87-4d8c-a535-43d10580b506',
    'sec-vridi-sir': '6c8a2f18-ff61-416f-a1cf-a05edfdc8862',
  };
  if (sectorMap[val]) return sectorMap[val];

  return null;
}

export interface SyncQueueItem {
  id?: string;
  clientMutationId: string;
  agentId: string;
  entityType: 'SALE' | 'CONTROL' | 'FRAUD_REPORT' | 'REMITTANCE';
  operation: 'INSERT' | 'UPDATE';
  payload: Record<string, any>;
  status?: 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED' | 'CONFLICT';
  retryCount?: number;
  errorMessage?: string | null;
  clientTimestamp: string;
  processedAt?: string | null;
}

export interface RemittanceAdjustment {
  id?: string;
  remittanceId: string;
  adminId: string;
  reason: string;
  oldAmount: number;
  newAmount: number;
  oldNote?: string;
  newNote?: string;
  adjustedAt?: string;
}

export interface NotificationItem {
  id?: string;
  recipientId: string;
  senderId?: string;
  title: string;
  message: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  type: 'FINANCIAL_ALERT' | 'ASSIGNMENT' | 'SYSTEM' | 'FRAUD_ALERT' | 'REMITTANCE' | 'SALE';
  metadata?: Record<string, any>;
  isRead?: boolean;
  createdAt?: string;
}

export const SupabaseDataLayer = {
  /**
   * Vérifie si Supabase est connecté et prêt
   */
  isAvailable(): boolean {
    return Boolean(getSupabase());
  },

  // ------------------------------------------------------------------
  // 1. PROFILS & UTILISATEURS
  // ------------------------------------------------------------------
  async fetchProfiles(): Promise<User[]> {
    // 1. Tenter d'abord l'API backend /api/users (contourne RLS sans restriction via Express/Vercel Serverless)
    try {
      const { ok, data } = await safeFetchJson<{ users: any[] }>('/api/users');
      if (ok && data && Array.isArray(data.users) && data.users.length > 0) {
        return data.users.map((row: any) => ({
          id: row.id,
          username: row.username,
          fullName: row.full_name,
          role: row.role,
          sectorId: row.sector_id,
          sectorName: row.sector?.name || row.sectors?.name,
          phone: row.phone,
          isActive: row.is_active,
          failedAttempts: row.failed_attempts || 0,
          lockedUntil: row.locked_until,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      }
    } catch {}

    // 2. Repli direct Supabase client
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('profiles')
      .select('*, sectors(name)')
      .order('full_name', { ascending: true });

    if (error) {
      console.warn('Supabase fetchProfiles error:', error.message);
      if (error.message?.includes('permission denied')) {
        rlsPermissionIssueDetected = true;
        lastRlsErrorMessage = error.message;
      }

      // Repli d'urgence pour le profil courant si RLS bloque SELECT *
      try {
        const { data: myProf } = await supabase.rpc('get_my_profile');
        if (myProf && typeof myProf === 'object') {
          return [{
            id: myProf.id,
            username: myProf.username,
            fullName: myProf.full_name,
            role: myProf.role,
            sectorId: myProf.sector_id,
            sectorName: myProf.sector_name,
            phone: myProf.phone,
            isActive: myProf.is_active,
            failedAttempts: myProf.failed_attempts || 0,
            createdAt: myProf.created_at,
            updatedAt: myProf.updated_at,
          }];
        }
      } catch {}

      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      role: row.role,
      sectorId: row.sector_id,
      sectorName: row.sectors?.name,
      phone: row.phone,
      isActive: row.is_active,
      failedAttempts: row.failed_attempts || 0,
      lockedUntil: row.locked_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  /**
   * Crée un utilisateur officiel dans Supabase Auth et public.profiles
   */
  async createAdminUser(userData: {
    username: string;
    fullName: string;
    role: string;
    sectorId?: string;
    phone?: string;
    passwordRaw: string;
  }): Promise<User> {
    const supabase = getSupabase();
    let token: string | null = null;
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || null;
    }
    if (!token && typeof sessionStorage !== 'undefined') {
      token = sessionStorage.getItem('portus_access_token');
    }
    if (!token && typeof localStorage !== 'undefined') {
      token = localStorage.getItem('portus_access_token');
    }

    // 1. Tenter via API backend autoritaire (Express / Vercel Serverless)
    if (token) {
      const { ok, data } = await safeFetchJson<{ user: any; error?: string }>('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(userData),
      });

      if (ok && data?.user) {
        const row = data.user;
        return {
          id: row.id,
          username: row.username,
          fullName: row.full_name,
          role: row.role,
          sectorId: row.sector_id,
          sectorName: row.sector?.name,
          phone: row.phone,
          isActive: row.is_active,
          failedAttempts: row.failed_attempts || 0,
          lockedUntil: row.locked_until,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      } else if (data?.error) {
        throw new Error(data.error);
      }
    }

    // 2. Repli direct client Supabase (si l'API serveur est non joignable)
    if (supabase) {
      const cleanUsername = userData.username.trim().toLowerCase();
      const email = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@portus.ujsrv.ci`;

      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email,
        password: userData.passwordRaw,
        options: {
          data: {
            username: cleanUsername,
            full_name: userData.fullName.trim(),
            role: userData.role,
          },
        },
      });

      if (signUpErr) {
        throw new Error(signUpErr.message);
      }

      if (signUpData?.user) {
        const newUserId = signUpData.user.id;
        const newProf: User = {
          id: newUserId,
          username: cleanUsername,
          fullName: userData.fullName.trim(),
          role: userData.role as any,
          sectorId: (userData.sectorId ? sanitizeUuidOrNull(userData.sectorId) : null) || undefined,
          phone: userData.phone?.trim() || undefined,
          isActive: true,
          failedAttempts: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await supabase.from('profiles').upsert({
          id: newProf.id,
          username: newProf.username,
          full_name: newProf.fullName,
          role: newProf.role,
          sector_id: newProf.sectorId,
          phone: newProf.phone || null,
          is_active: true,
          failed_attempts: 0,
          created_at: newProf.createdAt,
          updated_at: newProf.updatedAt,
        });

        return newProf;
      }
    }

    throw new Error('Erreur lors de la création de l’utilisateur dans Supabase.');
  },

  /**
   * Modifie un utilisateur dans Supabase profiles
   */
  async updateAdminUser(userId: string, updates: {
    username?: string;
    fullName?: string;
    phone?: string;
    sectorId?: string;
    role?: string;
    isActive?: boolean;
  }): Promise<User> {
    const supabase = getSupabase();
    let token: string | null = null;
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || null;
    }
    if (!token && typeof sessionStorage !== 'undefined') {
      token = sessionStorage.getItem('portus_access_token');
    }
    if (!token && typeof localStorage !== 'undefined') {
      token = localStorage.getItem('portus_access_token');
    }

    // 1. Tenter via API backend autoritaire
    if (token) {
      const { ok, data } = await safeFetchJson<{ user: any; error?: string }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (ok && data?.user) {
        const row = data.user;
        return {
          id: row.id,
          username: row.username,
          fullName: row.full_name,
          role: row.role,
          sectorId: row.sector_id,
          sectorName: row.sector?.name,
          phone: row.phone,
          isActive: row.is_active,
          failedAttempts: row.failed_attempts || 0,
          lockedUntil: row.locked_until,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      } else if (data?.error) {
        throw new Error(data.error);
      }
    }

    // 2. Repli direct client Supabase
    if (supabase) {
      const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName.trim();
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone?.trim() || null;
      if (updates.sectorId !== undefined) dbUpdates.sector_id = sanitizeUuidOrNull(updates.sectorId);
      if (updates.role !== undefined) dbUpdates.role = updates.role;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

      const { data: prof, error: updateErr } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('id', userId)
        .select('*, sectors(name)')
        .maybeSingle();

      if (!updateErr && prof) {
        return {
          id: prof.id,
          username: prof.username,
          fullName: prof.full_name,
          role: prof.role,
          sectorId: prof.sector_id,
          sectorName: prof.sectors?.name,
          phone: prof.phone,
          isActive: prof.is_active,
          failedAttempts: prof.failed_attempts || 0,
          lockedUntil: prof.locked_until,
          createdAt: prof.created_at,
          updatedAt: prof.updated_at,
        };
      }
    }

    throw new Error('Erreur lors de la mise à jour de l’utilisateur.');
  },

  /**
   * Réinitialise le mot de passe d'un utilisateur dans Supabase Auth
   */
  async resetAdminUserPassword(userId: string, newPasswordRaw: string): Promise<boolean> {
    const supabase = getSupabase();
    let token: string | null = null;
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || null;
    }
    if (!token && typeof sessionStorage !== 'undefined') {
      token = sessionStorage.getItem('portus_access_token');
    }
    if (!token && typeof localStorage !== 'undefined') {
      token = localStorage.getItem('portus_access_token');
    }

    // 1. Tenter via API backend autoritaire
    if (token) {
      const { ok, data } = await safeFetchJson<{ success?: boolean; error?: string }>(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPasswordRaw }),
      });

      if (ok && data?.success) return true;
      if (data?.error) throw new Error(data.error);
    }

    // 2. Repli si mot de passe de l'utilisateur connecté lui-même
    if (supabase) {
      const { data: currentUser } = await supabase.auth.getUser();
      if (currentUser?.user?.id === userId) {
        const { error } = await supabase.auth.updateUser({ password: newPasswordRaw });
        if (error) throw new Error(error.message);
        return true;
      }
    }

    throw new Error("La réinitialisation directe du mot de passe d'un tiers requiert le serveur backend avec privilèges de service.");
  },

  async upsertProfile(user: User): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        sector_id: user.sectorId || null,
        phone: user.phone || null,
        is_active: user.isActive,
        failed_attempts: user.failedAttempts,
        locked_until: user.lockedUntil || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase upsertProfile error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 2. SECTEURS & RÔLES
  // ------------------------------------------------------------------
  async fetchSectors(): Promise<Array<{ id: string; code: string; name: string; description?: string }>> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('sectors')
      .select('*')
      .order('code', { ascending: true });

    if (error) {
      console.warn('Supabase fetchSectors error:', error.message);
      return [];
    }
    return data || [];
  },

  async fetchRoles(): Promise<Array<{ id: string; name: string; label: string; permissions: any }>> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase.from('roles').select('*');
    if (error) {
      console.warn('Supabase fetchRoles error:', error.message);
      return [];
    }
    return data || [];
  },

  // ------------------------------------------------------------------
  // 3. CARNETS
  // ------------------------------------------------------------------
  async fetchCarnets(): Promise<Carnet[]> {
    // 1. Priorité API backend autoritaire (Express / Vercel Serverless)
    try {
      const { ok, data } = await safeFetchJson<{ carnets: Carnet[] }>('/api/carnets');
      if (ok && data && Array.isArray(data.carnets)) {
        return data.carnets;
      }
    } catch {}

    // 2. Repli direct Supabase client
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('carnets')
      .select('*, created_profile:profiles!created_by(full_name), resp_profile:profiles!assigned_to_responsable(full_name), sectors(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchCarnets error:', error.message);
      if (error.message?.includes('permission denied')) {
        rlsPermissionIssueDetected = true;
        lastRlsErrorMessage = error.message;
      }
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      carnetNumber: row.carnet_number,
      seriesPrefix: row.series_prefix,
      size: row.size,
      startNumber: row.start_number,
      endNumber: row.end_number,
      createdById: row.created_by,
      createdByName: row.created_profile?.full_name || 'ADMINISTRATEUR',
      assignedToResponsableId: row.assigned_to_responsable,
      assignedToResponsableName: row.resp_profile?.full_name,
      sectorId: row.sector_id,
      sectorName: row.sectors?.name,
      createdAt: row.created_at,
      status: row.status,
    }));
  },

  async insertCarnet(carnet: Carnet, tickets?: Ticket[]): Promise<boolean> {
    // 1. Envoi prioritaire via le proxy serveur autoritaire
    try {
      const { ok } = await safeFetchJson('/api/carnets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carnet, tickets: tickets || [] }),
      });
      if (ok) return true;
    } catch {}

    // 2. Repli client Supabase
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('carnets').upsert(
      {
        id: carnet.id,
        carnet_number: carnet.carnetNumber,
        series_prefix: carnet.seriesPrefix,
        generation_batch: 'GEN-1',
        size: carnet.size,
        start_number: carnet.startNumber,
        end_number: carnet.endNumber,
        created_by: sanitizeUuid(carnet.createdById),
        assigned_to_responsable: sanitizeUuidOrNull(carnet.assignedToResponsableId),
        sector_id: sanitizeUuidOrNull(carnet.sectorId),
        status: carnet.status,
        created_at: carnet.createdAt,
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase insertCarnet error:', error.message);
      return false;
    }

    if (tickets && tickets.length > 0) {
      const formatted = tickets.map((t) => ({
        id: sanitizeUuid(t.id),
        ticket_number: t.ticketNumber,
        carnet_id: sanitizeUuid(t.carnetId),
        generation_batch: 'GEN-1',
        qr_payload: t.qrPayload || t.ticketNumber,
        status: t.status || 'GENERATED',
        price: Number(t.price) || 5000,
        assigned_responsable_id: sanitizeUuidOrNull(t.assignedResponsableId),
        assigned_agent_id: sanitizeUuidOrNull(t.assignedAgentId),
        sector_id: sanitizeUuidOrNull(t.sectorId),
        created_at: t.createdAt || new Date().toISOString(),
      }));

      for (let i = 0; i < formatted.length; i += 50) {
        const chunk = formatted.slice(i, i + 50);
        const { error: tktErr } = await supabase.from('tickets').upsert(chunk, { onConflict: 'id' });
        if (tktErr) console.warn('Supabase insert tickets fallback error:', tktErr.message);
      }
    }

    return true;
  },

  async assignCarnet(carnetId: string, responsableId: string, sectorId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const { ok } = await safeFetchJson(`/api/carnets/${encodeURIComponent(carnetId)}/assign`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ responsableId, sectorId }),
      });

      if (ok) {
        return true;
      }
    } catch (err) {
      console.error('[SupabaseDataLayer] assignCarnet API error:', err);
    }

    // Fallback: Direct client-side update
    try {
      const { error: carnetErr } = await supabase
        .from('carnets')
        .update({
          assigned_to_responsable: sanitizeUuidOrNull(responsableId),
          sector_id: sanitizeUuidOrNull(sectorId),
          status: responsableId ? 'ASSIGNED_TO_RESPONSIBLE' : 'GENERATED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', carnetId);

      if (carnetErr) throw carnetErr;

      const { error: ticketErr } = await supabase
        .from('tickets')
        .update({
          assigned_responsable_id: sanitizeUuidOrNull(responsableId),
          sector_id: sanitizeUuidOrNull(sectorId),
          status: responsableId ? 'ASSIGNED_TO_RESPONSIBLE' : 'GENERATED',
          updated_at: new Date().toISOString(),
        })
        .eq('carnet_id', carnetId)
        .in('status', ['GENERATED', 'AVAILABLE']);

      if (ticketErr) throw ticketErr;

      return true;
    } catch (err: any) {
      console.warn('Supabase fallback assignCarnet error:', err.message);
      return false;
    }
  },

  async syncCarnetsBatch(carnets: Carnet[], tickets: Ticket[]): Promise<{ success: boolean; syncedCarnets: number; syncedTickets: number }> {
    let totalSyncedCarnets = 0;
    let totalSyncedTickets = 0;

    try {
      // 1. Synchronisation des carnets
      if (carnets.length > 0) {
        const { ok, data } = await safeFetchJson<{ syncedCarnets?: number }>('/api/carnets/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ carnets, tickets: [] }),
        });
        if (ok && data) {
          totalSyncedCarnets = data.syncedCarnets || carnets.length;
        }
      }

      // 2. Synchronisation des tickets par lots de 150 pour une performance réseau optimale
      const CHUNK_SIZE = 150;
      for (let i = 0; i < tickets.length; i += CHUNK_SIZE) {
        const chunk = tickets.slice(i, i + CHUNK_SIZE);
        const { ok, data } = await safeFetchJson<{ syncedTickets?: number }>('/api/carnets/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ carnets: [], tickets: chunk }),
        });
        if (ok && data) {
          totalSyncedTickets += data.syncedTickets || chunk.length;
        }
      }

      return {
        success: true,
        syncedCarnets: totalSyncedCarnets,
        syncedTickets: totalSyncedTickets,
      };
    } catch (err) {
      console.warn('Erreur syncCarnetsBatch:', err);
      return {
        success: totalSyncedCarnets > 0 || totalSyncedTickets > 0,
        syncedCarnets: totalSyncedCarnets,
        syncedTickets: totalSyncedTickets,
      };
    }
  },

  // ------------------------------------------------------------------
  // 4. TICKETS & AFFECTATIONS
  // ------------------------------------------------------------------
  async fetchTickets(): Promise<Ticket[]> {
    // 1. Priorité API backend autoritaire
    try {
      const { ok, data } = await safeFetchJson<{ tickets: Ticket[] }>('/api/carnets');
      if (ok && data && Array.isArray(data.tickets) && data.tickets.length > 0) {
        return data.tickets;
      }
    } catch {}

    // 2. Repli direct Supabase client
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('tickets')
      .select('*, carnets(carnet_number), resp:profiles!assigned_responsable_id(full_name), agent:profiles!assigned_agent_id(full_name, phone), sectors(name)')
      .order('ticket_number', { ascending: true });

    if (error) {
      console.warn('Supabase fetchTickets error:', error.message);
      if (error.message?.includes('permission denied')) {
        rlsPermissionIssueDetected = true;
        lastRlsErrorMessage = error.message;
      }
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      ticketNumber: row.ticket_number,
      carnetId: row.carnet_id,
      carnetNumber: row.carnets?.carnet_number || 'CARNET',
      qrPayload: row.qr_payload,
      status: row.status,
      price: row.price,
      assignedResponsableId: row.assigned_responsable_id,
      assignedResponsableName: row.resp?.full_name,
      assignedAgentId: row.assigned_agent_id,
      assignedAgentName: row.agent?.full_name,
      assignedAgentPhone: row.agent?.phone || undefined,
      sectorId: row.sector_id,
      sectorName: row.sectors?.name,
      saleId: row.sale_id,
      soldAt: row.sold_at,
      plateNumber: row.plate_number,
      driverPhone: row.driver_phone,
      isSuperseded: row.is_superseded,
      coveredByRemiseId: row.covered_by_remittance_id,
      controlCount: row.control_count,
      lastControlledAt: row.last_controlled_at,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      createdAt: row.created_at,
    }));
  },

  async fetchTicketForVerification(identifier: string): Promise<Ticket | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const clean = identifier.trim();
      // Recherche par ID ou par numéro de ticket
      const { data, error } = await supabase
        .from('tickets')
        .select('*, carnets(carnet_number), resp:profiles!assigned_responsable_id(full_name), agent:profiles!assigned_agent_id(full_name, phone), sectors(name)')
        .or(`id.eq.${clean},ticket_number.eq.${clean},ticket_number.ilike.${clean}`)
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      return {
        id: data.id,
        ticketNumber: data.ticket_number,
        carnetId: data.carnet_id,
        carnetNumber: data.carnets?.carnet_number || 'CARNET',
        qrPayload: data.qr_payload,
        status: data.status,
        price: data.price,
        assignedResponsableId: data.assigned_responsable_id,
        assignedResponsableName: data.resp?.full_name,
        assignedAgentId: data.assigned_agent_id,
        assignedAgentName: data.agent?.full_name,
        assignedAgentPhone: data.agent?.phone || undefined,
        sectorId: data.sector_id,
        sectorName: data.sectors?.name,
        saleId: data.sale_id,
        soldAt: data.sold_at,
        plateNumber: data.plate_number,
        driverPhone: data.driver_phone,
        isSuperseded: data.is_superseded,
        coveredByRemiseId: data.covered_by_remittance_id,
        controlCount: data.control_count,
        lastControlledAt: data.last_controlled_at,
        cancelledAt: data.cancelled_at,
        cancellationReason: data.cancellation_reason,
        createdAt: data.created_at,
      };
    } catch {
      return null;
    }
  },

  async fetchTicketsByPlate(plate: string): Promise<Ticket[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      const cleanPlate = plate.replace(/[\s\-_]/g, '').toUpperCase();
      const { data, error } = await supabase
        .from('tickets')
        .select('*, carnets(carnet_number), resp:profiles!assigned_responsable_id(full_name), agent:profiles!assigned_agent_id(full_name, phone), sectors(name)')
        .ilike('plate_number', `%${cleanPlate}%`)
        .order('sold_at', { ascending: false });

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        ticketNumber: row.ticket_number,
        carnetId: row.carnet_id,
        carnetNumber: row.carnets?.carnet_number || 'CARNET',
        qrPayload: row.qr_payload,
        status: row.status,
        price: row.price,
        assignedResponsableId: row.assigned_responsable_id,
        assignedResponsableName: row.resp?.full_name,
        assignedAgentId: row.assigned_agent_id,
        assignedAgentName: row.agent?.full_name,
        assignedAgentPhone: row.agent?.phone || undefined,
        sectorId: row.sector_id,
        sectorName: row.sectors?.name,
        saleId: row.sale_id,
        soldAt: row.sold_at,
        plateNumber: row.plate_number,
        driverPhone: row.driver_phone,
        isSuperseded: row.is_superseded,
        coveredByRemiseId: row.covered_by_remittance_id,
        controlCount: row.control_count,
        lastControlledAt: row.last_controlled_at,
        cancelledAt: row.cancelled_at,
        cancellationReason: row.cancellation_reason,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  },

  async insertTicketsBatch(tickets: Ticket[]): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase || tickets.length === 0) return false;

    const payload = tickets.map((t) => ({
      id: t.id,
      ticket_number: t.ticketNumber,
      carnet_id: t.carnetId,
      generation_batch: 'GEN-1',
      qr_payload: t.qrPayload,
      status: t.status,
      price: t.price || 5000,
      assigned_responsable_id: sanitizeUuidOrNull(t.assignedResponsableId),
      assigned_agent_id: sanitizeUuidOrNull(t.assignedAgentId),
      sector_id: sanitizeUuidOrNull(t.sectorId),
      created_at: t.createdAt,
    }));

    const { error } = await supabase
      .from('tickets')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('Supabase insertTicketsBatch error:', error.message);
      return false;
    }
    return true;
  },

  async updateTicketAssignment(
    ticketIds: string[],
    agentId: string,
    responsableId?: string
  ): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase
      .from('tickets')
      .update({
        assigned_agent_id: agentId,
        status: 'ASSIGNED_TO_AGENT',
        updated_at: new Date().toISOString(),
      })
      .in('id', ticketIds);

    if (error) {
      console.warn('Supabase updateTicketAssignment error:', error.message);
      return false;
    }

    // Enregistrer les mouvements dans ticket_assignments
    if (responsableId) {
      const assignments = ticketIds.map((tId) => ({
        ticket_id: tId,
        to_profile_id: agentId,
        assigned_by: responsableId,
        assignment_type: 'AGENT_ASSIGNMENT',
        assigned_at: new Date().toISOString(),
      }));
      await supabase.from('ticket_assignments').insert(assignments);
    }

    return true;
  },

  async updateTicketStatus(params: {
    ticketId: string;
    status?: TicketStatus;
    assignedResponsableId?: string | null;
    assignedAgentId?: string | null;
    isSuperseded?: boolean;
    supersededByTicketNumber?: string;
  }): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (params.status !== undefined) {
      updatePayload.status = params.status;
    }
    if (params.assignedResponsableId !== undefined) {
      updatePayload.assigned_responsable_id = params.assignedResponsableId;
    }
    if (params.assignedAgentId !== undefined) {
      updatePayload.assigned_agent_id = params.assignedAgentId;
    }
    if (params.isSuperseded !== undefined) {
      updatePayload.is_superseded = params.isSuperseded;
    }
    if (params.supersededByTicketNumber !== undefined) {
      updatePayload.superseded_by_ticket_number = params.supersededByTicketNumber;
    }

    const { error } = await supabase
      .from('tickets')
      .update(updatePayload)
      .eq('id', params.ticketId);

    if (error) {
      console.warn('Supabase updateTicketStatus error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 5. VENTES (IDEMPOTENTES & OFFLINE READY)
  // ------------------------------------------------------------------
  async fetchSales(): Promise<Sale[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('sales')
      .select('*, agent:profiles!agent_id(full_name), sectors(name)')
      .order('sold_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchSales error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      ticketId: row.ticket_id,
      ticketNumber: row.ticket_number,
      agentId: row.agent_id,
      agentName: row.agent?.full_name || 'AGENT',
      sectorId: row.sector_id,
      sectorName: row.sectors?.name,
      plateNumber: row.plate_number,
      driverPhone: row.driver_phone,
      soldAt: row.sold_at,
      gpsLatitude: row.gps_latitude,
      gpsLongitude: row.gps_longitude,
      gpsAccuracy: row.gps_accuracy,
      gpsStatus: row.gps_status,
      syncedAt: row.synced_at,
      syncStatus: 'SYNCED',
      price: row.price,
      coveredByRemiseId: row.covered_by_remittance_id,
    }));
  },

  /**
   * Insère une vente de façon strictement idempotente.
   * Utilise ticket_id UNIQUE et sync_idempotency_key UNIQUE pour éviter tout doublon.
   */
  async insertSaleIdempotent(sale: Sale): Promise<{ success: boolean; isDuplicate: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, isDuplicate: false, error: 'Supabase non configuré' };

    // Vérifier si la vente existe déjà par son id ou ticket_id
    const { data: existing } = await supabase
      .from('sales')
      .select('id, ticket_id')
      .or(`id.eq.${sale.id},ticket_id.eq.${sale.ticketId}`)
      .maybeSingle();

    if (existing) {
      // Déjà présent en base distante -> considérer comme succès idempotent
      return { success: true, isDuplicate: true };
    }

    const { error } = await supabase.from('sales').insert({
      id: sale.id,
      ticket_id: sale.ticketId,
      ticket_number: sale.ticketNumber,
      agent_id: sale.agentId,
      sector_id: sale.sectorId || null,
      plate_number: sale.plateNumber,
      driver_phone: sale.driverPhone || null,
      sold_at: sale.soldAt, // Date originale préservée
      synced_at: new Date().toISOString(),
      sync_idempotency_key: sale.id, // Utilise l'ID de vente généré comme clé d'idempotence
      gps_latitude: sale.gpsLatitude,
      gps_longitude: sale.gpsLongitude,
      gps_accuracy: sale.gpsAccuracy,
      gps_status: sale.gpsStatus,
      price: sale.price || 5000,
    });

    if (error) {
      // Vérifier si violation de contrainte d'unicité (idempotence)
      if (error.code === '23505') {
        return { success: true, isDuplicate: true };
      }
      return { success: false, isDuplicate: false, error: error.message };
    }

    return { success: true, isDuplicate: false };
  },

  // ------------------------------------------------------------------
  // 6. REMISES (REMITTANCES) & HISTORIQUE DES AJUSTEMENTS
  // ------------------------------------------------------------------
  async fetchRemittances(): Promise<Remise[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data: remisesData, error } = await supabase
      .from('remittances')
      .select('*, agent:profiles!agent_id(full_name), resp:profiles!responsable_id(full_name), sectors(name), remittance_adjustments(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchRemittances error:', error.message);
      return [];
    }

    return (remisesData || []).map((row: any) => ({
      id: row.id,
      reference: row.reference,
      agentId: row.agent_id,
      agentName: row.agent?.full_name || 'AGENT',
      responsableId: row.responsable_id,
      responsableName: row.resp?.full_name || 'RESPONSABLE',
      sectorId: row.sector_id,
      sectorName: row.sectors?.name || 'VRIDI',
      amount: row.amount,
      date: row.date,
      time: row.time,
      createdAt: row.created_at,
      note: row.note,
      ticketIdsCovered: row.ticket_ids_covered || [],
      ticketsCount: row.tickets_count,
      isCorrected: row.is_corrected,
      history: (row.remittance_adjustments || []).map((adj: any) => ({
        id: adj.id,
        modifiedAt: adj.adjusted_at,
        modifiedById: adj.admin_id,
        modifiedByName: 'ADMINISTRATEUR',
        reason: adj.reason,
        oldAmount: adj.old_amount,
        newAmount: adj.new_amount,
        oldNote: adj.old_note,
        newNote: adj.new_note,
      })),
    }));
  },

  async insertRemittance(remise: Remise): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('remittances').upsert(
      {
        id: remise.id,
        reference: remise.reference,
        agent_id: remise.agentId,
        responsable_id: remise.responsableId,
        sector_id: remise.sectorId,
        amount: remise.amount,
        tickets_count: remise.ticketsCount,
        ticket_ids_covered: remise.ticketIdsCovered,
        date: remise.date,
        time: remise.time,
        note: remise.note || null,
        is_corrected: remise.isCorrected || false,
        created_at: remise.createdAt,
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase insertRemittance error:', error.message);
      return false;
    }
    return true;
  },

  /**
   * Enregistre un ajustement administratif de remise avec traçabilité immuable
   */
  async recordRemittanceAdjustment(adjustment: RemittanceAdjustment): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    // 1. Insérer la nouvelle trace dans remittance_adjustments
    const { error: adjError } = await supabase.from('remittance_adjustments').insert({
      remittance_id: adjustment.remittanceId,
      admin_id: adjustment.adminId,
      reason: adjustment.reason,
      old_amount: adjustment.oldAmount,
      new_amount: adjustment.newAmount,
      old_note: adjustment.oldNote || null,
      new_note: adjustment.newNote || null,
      adjusted_at: new Date().toISOString(),
    });

    if (adjError) {
      console.warn('Supabase recordRemittanceAdjustment error:', adjError.message);
      return false;
    }

    // 2. Mettre à jour le montant dans remittances en marquant is_corrected = true
    const { error: remError } = await supabase
      .from('remittances')
      .update({
        amount: adjustment.newAmount,
        note: adjustment.newNote || null,
        is_corrected: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adjustment.remittanceId);

    if (remError) {
      console.warn('Supabase update remittance error:', remError.message);
      return false;
    }

    return true;
  },

  // ------------------------------------------------------------------
  // 7. CONTRÔLES & FRAUDES
  // ------------------------------------------------------------------
  async fetchControls(): Promise<Control[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('controls')
      .select('*, controleur:profiles!controleur_id(full_name)')
      .order('controlled_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchControls error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      ticketId: row.ticket_id,
      ticketNumber: row.ticket_number,
      plateNumber: row.plate_number,
      controleurId: row.controleur_id,
      controleurName: row.controleur?.full_name || 'CONTRÔLEUR',
      controlledAt: row.controlled_at,
      isValid: row.is_valid,
      validationMessage: row.validation_message,
      gpsLatitude: row.gps_latitude,
      gpsLongitude: row.gps_longitude,
      gpsAccuracy: row.gps_accuracy,
      gpsStatus: row.gps_status,
      syncStatus: 'SYNCED',
    }));
  },

  async insertControl(ctrl: Control): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('controls').upsert(
      {
        id: ctrl.id,
        ticket_id: ctrl.ticketId || null,
        ticket_number: ctrl.ticketNumber,
        plate_number: ctrl.plateNumber,
        controleur_id: ctrl.controleurId,
        controlled_at: ctrl.controlledAt,
        is_valid: ctrl.isValid,
        validation_message: ctrl.validationMessage,
        gps_latitude: ctrl.gpsLatitude,
        gps_longitude: ctrl.gpsLongitude,
        gps_accuracy: ctrl.gpsAccuracy,
        gps_status: ctrl.gpsStatus,
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase insertControl error:', error.message);
      return false;
    }
    return true;
  },

  async fetchFraudReports(): Promise<FraudReport[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('fraud_reports')
      .select('*, controleur:profiles!controleur_id(full_name)')
      .order('reported_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchFraudReports error:', error.message);
      return [];
    }

    const reasonLabels: Record<string, string> = {
      CAMION_DIFFERENT: 'CAMION DIFFÉRENT',
      TICKET_SUSPECT: 'TICKET SUSPECT',
      TICKET_FALSIFIE: 'TICKET FALSIFIÉ',
      TICKET_DEJA_PRESENTE: 'TICKET DÉJÀ PRÉSENTÉ',
      AUTRE: 'AUTRE',
      FAUX_TICKET: 'TICKET FALSIFIÉ',
      IMMATRICULATION_NON_CONFORME: 'CAMION DIFFÉRENT',
      TICKET_EXPIRE: 'TICKET SUSPECT',
      REUTILISATION_FRAUDULEUSE: 'TICKET DÉJÀ PRÉSENTÉ',
    };

    return (data || []).map((row: any) => {
      let parsedPhotos: string[] = [];
      if (Array.isArray(row.photos)) {
        parsedPhotos = row.photos;
      } else if (typeof row.photos === 'string') {
        try {
          parsedPhotos = JSON.parse(row.photos);
        } catch {
          parsedPhotos = row.photo_url ? [row.photo_url] : [];
        }
      } else if (row.photo_url) {
        parsedPhotos = [row.photo_url];
      }

      const repDate = row.reported_at ? row.reported_at.split('T')[0] : new Date().toISOString().split('T')[0];
      const repTime = row.reported_at && row.reported_at.includes('T') ? row.reported_at.split('T')[1].slice(0, 8) : '12:00:00';

      return {
        id: row.id,
        ticketNumber: row.ticket_number,
        plateNumber: row.plate_number,
        controleurId: row.controleur_id,
        controleurName: row.controleur?.full_name || 'CONTRÔLEUR',
        type: (row.fraud_type || row.reason || 'AUTRE') as any,
        typeLabel: reasonLabels[row.fraud_type || row.reason] || row.reason || 'Infraction',
        reason: row.reason,
        reasonLabel: reasonLabels[row.reason] || row.reason,
        comment: row.comment,
        photos: parsedPhotos,
        photoDataUrl: parsedPhotos[0] || row.photo_url,
        reportedAt: row.reported_at,
        reportedDate: repDate,
        reportedTime: repTime,
        gpsLatitude: row.gps_latitude,
        gpsLongitude: row.gps_longitude,
        gpsStatus: row.gps_latitude != null ? 'AVAILABLE' : 'UNAVAILABLE',
        status: (row.status || 'NOUVEAU') as any,
        processingHistory: Array.isArray(row.processing_history) ? row.processing_history : [],
        adminDecisionNote: row.admin_decision_note,
        adminDecisionBy: row.admin_decision_by,
        adminDecisionByName: row.admin_decision_by_name,
        adminDecisionAt: row.admin_decision_at,
        syncStatus: 'SYNCED',
        syncedAt: row.updated_at || row.reported_at,
      };
    });
  },

  async insertFraudReport(report: FraudReport): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    // Diffusion broadcast instantanée via Supabase Realtime
    this.broadcastIncident(report).catch(() => {});

    const { error } = await supabase.from('fraud_reports').upsert(
      {
        id: report.id,
        ticket_number: report.ticketNumber || null,
        plate_number: report.plateNumber,
        controleur_id: report.controleurId,
        reason: report.type || report.reason || 'AUTRE',
        comment: report.comment,
        photo_url: report.photos?.[0] || report.photoDataUrl || null,
        reported_at: report.reportedAt,
        gps_latitude: report.gpsLatitude,
        gps_longitude: report.gpsLongitude,
        status: report.status || 'NOUVEAU',
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase insertFraudReport error:', error.message);
      return false;
    }
    return true;
  },

  /**
   * Diffusion broadcast en temps réel d'un nouvel incident de sécurité routière
   */
  async broadcastIncident(incident: FraudReport): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
      const channel = supabase.channel('road_safety_realtime_feed');
      await channel.send({
        type: 'broadcast',
        event: 'new_incident',
        payload: incident,
      });
    } catch (err) {
      console.warn('[PORTUS Realtime] Erreur broadcast incident:', err);
    }
  },

  /**
   * Abonnement en direct Supabase Realtime aux incidents de sécurité routière
   * (Écoute simultanée des postgres_changes sur fraud_reports et des broadcasts)
   */
  subscribeToRoadSafetyIncidents(onIncidentReceived: (incident: FraudReport) => void): (() => void) | null {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const channel = supabase
        .channel('road_safety_realtime_feed')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'fraud_reports' },
          (payload) => {
            const row = payload.new as any;
            if (!row || !row.id) return;
            const incident: FraudReport = {
              id: row.id,
              ticketNumber: row.ticket_number || undefined,
              plateNumber: row.plate_number,
              sectorId: row.sector_id || undefined,
              controleurId: row.controleur_id || 'ctrl-remote',
              controleurName: row.controleur_name || 'Équipe Contrôle Terrain',
              type: (row.reason as any) || 'AUTRE',
              typeLabel: row.reason || 'Incident de Sécurité',
              comment: row.comment || '',
              photos: row.photo_url ? [row.photo_url] : [],
              photoDataUrl: row.photo_url || undefined,
              reportedAt: row.reported_at || new Date().toISOString(),
              reportedDate: (row.reported_at || new Date().toISOString()).slice(0, 10),
              reportedTime: (row.reported_at || new Date().toISOString()).slice(11, 19),
              gpsLatitude: row.gps_latitude,
              gpsLongitude: row.gps_longitude,
              status: row.status || 'NOUVEAU',
              syncStatus: 'SYNCED',
              syncedAt: new Date().toISOString(),
            };
            onIncidentReceived(incident);
          }
        )
        .on('broadcast', { event: 'new_incident' }, ({ payload }) => {
          if (payload && payload.id) {
            onIncidentReceived(payload as FraudReport);
          }
        })
        .subscribe((status) => {
          console.log('[PORTUS Realtime] Statut abonnement incidents sécurité:', status);
        });

      return () => {
        try {
          supabase.removeChannel(channel);
        } catch {}
      };
    } catch (err) {
      console.warn('[PORTUS Realtime] Erreur initialisation abonnement:', err);
      return null;
    }
  },

  async updateFraudReportStatus(
    fraudId: string,
    status: FraudReport['status'],
    adminNote?: string,
    adminId?: string
  ): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase
      .from('fraud_reports')
      .update({
        status,
        admin_decision_note: adminNote || null,
        admin_decision_by: adminId || null,
        admin_decision_at: new Date().toISOString(),
      })
      .eq('id', fraudId);

    if (error) {
      console.warn('Supabase updateFraudReportStatus error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 8. AUDIT LOGS (APPEND-ONLY)
  // ------------------------------------------------------------------
  async fetchAuditLogs(): Promise<AuditLog[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('Supabase fetchAuditLogs error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      actorId: row.actor_id,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      action: row.action,
      timestamp: row.timestamp,
      targetEntity: row.target_entity,
      targetId: row.target_id,
      oldValue: row.old_value,
      newValue: row.new_value,
      gpsLatitude: row.gps_latitude,
      gpsLongitude: row.gps_longitude,
      details: row.details,
    }));
  },

  async insertAuditLog(log: AuditLog): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('audit_logs').insert({
      id: log.id,
      actor_id: log.actorId.startsWith('usr-') ? null : log.actorId, // Supabase UUID guard
      actor_name: log.actorName,
      actor_role: log.actorRole,
      action: log.action,
      timestamp: log.timestamp,
      target_entity: log.targetEntity,
      target_id: log.targetId,
      old_value: log.oldValue || null,
      new_value: log.newValue || null,
      gps_latitude: log.gpsLatitude || null,
      gps_longitude: log.gpsLongitude || null,
      details: log.details || null,
    });

    if (error) {
      console.warn('Supabase insertAuditLog error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 9. FILE D'ATTENTE DE SYNCHRONISATION IDEMPOTENTE (SYNC_QUEUE)
  // ------------------------------------------------------------------
  async pushToSyncQueue(item: SyncQueueItem): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('sync_queue').insert({
      client_mutation_id: item.clientMutationId,
      agent_id: item.agentId,
      entity_type: item.entityType,
      operation: item.operation,
      payload: item.payload,
      status: 'PENDING',
      client_timestamp: item.clientTimestamp,
    });

    if (error) {
      if (error.code === '23505') {
        // Mutation déjà reçue (idempotence)
        return true;
      }
      console.warn('Supabase pushToSyncQueue error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 10. NOTIFICATIONS & ALERTES DE SEUILS
  // ------------------------------------------------------------------
  async fetchNotifications(userId: string): Promise<NotificationItem[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchNotifications error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      recipientId: row.recipient_id,
      senderId: row.sender_id,
      title: row.title,
      message: row.message,
      level: row.level,
      type: row.type,
      metadata: row.metadata,
      isRead: row.is_read,
      createdAt: row.created_at,
    }));
  },

  async insertNotification(notif: NotificationItem): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('notifications').insert({
      recipient_id: notif.recipientId,
      sender_id: notif.senderId || null,
      title: notif.title,
      message: notif.message,
      level: notif.level,
      type: notif.type,
      metadata: notif.metadata || {},
      is_read: false,
    });

    if (error) {
      console.warn('Supabase insertNotification error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 11. TENTATIVES DE CONNEXION (LOGIN_ATTEMPTS) & VERROUILLAGE SERVEUR
  // ------------------------------------------------------------------
  async recordLoginAttempt(params: {
    username: string;
    profileId?: string;
    isSuccessful: boolean;
    failureReason?: string;
  }): Promise<{ isLocked?: boolean; remainingSeconds?: number; attemptsLeft?: number } | void> {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      // 1. Appel prioritaire à la RPC serveur
      const { data, error } = await supabase.rpc('record_login_attempt', {
        p_identifier: params.username,
        p_is_success: params.isSuccessful,
        p_failure_reason: params.failureReason || null,
        p_ip: null,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });

      if (!error && data) {
        return {
          isLocked: data.is_locked,
          remainingSeconds: data.remaining_seconds,
          attemptsLeft: data.attempts_left,
        };
      }
    } catch {
      // Fallback
    }

    try {
      await supabase.from('login_attempts').insert({
        username: params.username,
        profile_id: params.profileId || null,
        is_successful: params.isSuccessful,
        failure_reason: params.failureReason || null,
        attempted_at: new Date().toISOString(),
      });
    } catch {
      // Silencieux
    }
  },

  async getAccountLockoutStatus(identifier: string): Promise<{ isLocked: boolean; remainingSeconds: number }> {
    const supabase = getSupabase();
    if (!supabase) return { isLocked: false, remainingSeconds: 0 };

    try {
      const { data, error } = await supabase.rpc('get_account_lockout_status', {
        p_identifier: identifier,
      });

      if (!error && data) {
        return {
          isLocked: Boolean(data.is_locked),
          remainingSeconds: data.remaining_seconds || 0,
        };
      }
    } catch (err) {
      console.warn('Erreur getAccountLockoutStatus:', err);
    }

    return { isLocked: false, remainingSeconds: 0 };
  },

  // ------------------------------------------------------------------
  // 12. RPC SÉCURISÉES POUR TICKETS, VENTES ET CONTRÔLES (HMAC-SHA256)
  // ------------------------------------------------------------------
  async verifyTicketSecureRPC(params: {
    identifier: string;
    scannedToken?: string;
    plateNumber?: string;
  }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase.rpc('verify_ticket_secure', {
        p_ticket_identifier: params.identifier.trim(),
        p_scanned_token: params.scannedToken ? params.scannedToken.trim() : null,
        p_plate_number: params.plateNumber ? params.plateNumber.trim() : null,
      });

      if (error) {
        console.warn('Supabase verify_ticket_secure RPC error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Exception verifyTicketSecureRPC:', err);
      return null;
    }
  },

  async recordControlSecureRPC(params: {
    identifier: string;
    scannedToken?: string;
    plateNumber?: string;
    location?: string;
    notes?: string;
  }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase.rpc('record_control_secure', {
      p_ticket_identifier: params.identifier.trim(),
      p_scanned_token: params.scannedToken ? params.scannedToken.trim() : null,
      p_plate_number: params.plateNumber ? params.plateNumber.trim() : null,
      p_location: params.location ? params.location.trim() : null,
      p_notes: params.notes ? params.notes.trim() : null,
    });

    if (error) {
      console.warn('Supabase record_control_secure RPC error:', error.message);
      throw new Error(error.message);
    }
    return data;
  },

  async sellTicketSecureRPC(params: {
    ticketId: string;
    plateNumber: string;
    driverPhone?: string;
    syncIdempotencyKey?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    soldAt?: string;
  }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase.rpc('sell_ticket_secure', {
      p_ticket_id: params.ticketId,
      p_plate_number: params.plateNumber.trim().toUpperCase(),
      p_driver_phone: params.driverPhone ? params.driverPhone.trim() : null,
      p_sync_idempotency_key: params.syncIdempotencyKey || null,
      p_latitude: params.latitude || null,
      p_longitude: params.longitude || null,
      p_accuracy: params.accuracy || null,
      p_sold_at: params.soldAt || null,
    });

    if (error) {
      console.warn('Supabase sell_ticket_secure RPC error:', error.message);
      throw new Error(error.message);
    }
    return data;
  },

  async assignTicketsSecureRPC(params: {
    agentId: string;
    ticketIds: string[];
  }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase.rpc('assign_tickets_to_agent_secure', {
      p_agent_id: params.agentId,
      p_ticket_ids: params.ticketIds,
    });

    if (error) {
      console.warn('Supabase assign_tickets_to_agent_secure RPC error:', error.message);
      throw new Error(error.message);
    }
    return data;
  },

  async supersedeTicketSecureRPC(params: {
    oldTicketId: string;
    newTicketId: string;
    reason: string;
  }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase.rpc('supersede_ticket_secure', {
      p_old_ticket_id: params.oldTicketId,
      p_new_ticket_id: params.newTicketId,
      p_reason: params.reason,
    });

    if (error) {
      console.warn('Supabase supersede_ticket_secure RPC error:', error.message);
      throw new Error(error.message);
    }
    return data;
  },

  // ------------------------------------------------------------------
  // 13. PARAMÈTRES APPLICATIFS (APP_SETTINGS)
  // ------------------------------------------------------------------
  async fetchAppSettings(): Promise<Record<string, any>> {
    const supabase = getSupabase();
    if (!supabase) return {};

    const { data, error } = await supabase.from('app_settings').select('key, value');
    if (error) {
      console.warn('Supabase fetchAppSettings error:', error.message);
      return {};
    }

    const settings: Record<string, any> = {};
    (data || []).forEach((row: any) => {
      settings[row.key] = row.value;
    });
    return settings;
  },

  // ------------------------------------------------------------------
  // 14. DÉPENSES (EXPENSES)
  // ------------------------------------------------------------------
  async fetchExpenses(): Promise<Expense[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, creator:profiles!created_by(full_name, role), approver:profiles!approved_by(full_name), resp:profiles!responsible_id(full_name), sectors(name)')
        .order('expense_date', { ascending: false });

      if (error) {
        console.warn('Supabase fetchExpenses error:', error.message);
        return [];
      }

      return (data || []).map((r: any) => ({
        id: r.id,
        expenseNumber: r.expense_number,
        amount: r.amount,
        category: r.category,
        description: r.description,
        beneficiary: r.beneficiary,
        paymentMethod: r.payment_method,
        expenseDate: r.expense_date,
        receiptUrl: r.receipt_url,
        status: r.status,
        createdBy: r.created_by,
        createdByName: r.creator?.full_name || 'Utilisateur',
        createdByRole: r.creator?.role || 'AGENT',
        responsibleId: r.responsible_id,
        responsibleName: r.resp?.full_name,
        sectorId: r.sector_id,
        sectorName: r.sectors?.name,
        approvedBy: r.approved_by,
        approvedByName: r.approver?.full_name,
        approvedAt: r.approved_at,
        rejectionReason: r.rejection_reason,
        cancellationReason: r.cancellation_reason,
        correctionReason: r.correction_reason,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        syncedAt: r.updated_at,
      }));
    } catch {
      return [];
    }
  },

  async insertExpense(expense: Expense): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) return;

    await supabase.from('expenses').upsert({
      id: sanitizeUuid(expense.id),
      expense_number: expense.expenseNumber,
      amount: expense.amount,
      category: expense.category,
      description: expense.description,
      beneficiary: expense.beneficiary || null,
      payment_method: expense.paymentMethod || 'ESPECES',
      expense_date: expense.expenseDate,
      receipt_url: expense.receiptUrl || null,
      status: expense.status,
      created_by: sanitizeUuid(expense.createdBy),
      responsible_id: sanitizeUuidOrNull(expense.responsibleId),
      sector_id: sanitizeUuidOrNull(expense.sectorId),
      created_at: expense.createdAt,
      updated_at: expense.updatedAt,
    }, { onConflict: 'id' });
  },

  async updateExpenseStatus(params: {
    expenseId: string;
    status: Expense['status'];
    approvedBy?: string;
    reason?: string;
  }): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) return;

    const updates: Record<string, any> = {
      status: params.status,
      updated_at: new Date().toISOString(),
    };

    if (params.approvedBy) {
      updates.approved_by = sanitizeUuid(params.approvedBy);
      updates.approved_at = new Date().toISOString();
    }
    if (params.status === 'REJECTED') {
      updates.rejection_reason = params.reason;
    } else if (params.status === 'CANCELLED') {
      updates.cancellation_reason = params.reason;
    }

    await supabase.from('expenses').update(updates).eq('id', sanitizeUuid(params.expenseId));
  },

  // ------------------------------------------------------------------
  // 15. CLÔTURES JOURNALIÈRES (DAILY CLOSINGS)
  // ------------------------------------------------------------------
  async fetchDailyClosings(): Promise<DailyClosing[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('daily_closings')
        .select('*, cashier:profiles!cashier_id(full_name), confirm:profiles!confirmed_by(full_name), sectors(name)')
        .order('closing_date', { ascending: false });

      if (error) {
        console.warn('Supabase fetchDailyClosings error:', error.message);
        return [];
      }

      return (data || []).map((r: any) => ({
        id: r.id,
        closingReference: r.closing_reference,
        closingDate: r.closing_date,
        cashierId: r.cashier_id,
        cashierName: r.cashier?.full_name || 'Caissier',
        sectorId: r.sector_id,
        sectorName: r.sectors?.name,
        openingBalance: r.opening_balance,
        cashSalesAmount: r.cash_sales_amount,
        digitalSalesAmount: r.digital_sales_amount,
        refundsAmount: r.refunds_amount,
        expensesAmount: r.expenses_amount,
        expectedBalance: r.expected_balance,
        declaredBalance: r.declared_balance,
        discrepancy: r.discrepancy,
        notes: r.notes,
        status: r.status,
        confirmedBy: r.confirmed_by,
        confirmedByName: r.confirm?.full_name,
        confirmedAt: r.confirmed_at,
        isLocked: r.is_locked,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch {
      return [];
    }
  },

  async insertDailyClosing(closing: DailyClosing): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) return;

    await supabase.from('daily_closings').upsert({
      id: sanitizeUuid(closing.id),
      closing_reference: closing.closingReference,
      closing_date: closing.closingDate,
      cashier_id: sanitizeUuid(closing.cashierId),
      sector_id: sanitizeUuidOrNull(closing.sectorId),
      opening_balance: closing.openingBalance,
      cash_sales_amount: closing.cashSalesAmount,
      digital_sales_amount: closing.digitalSalesAmount,
      refunds_amount: closing.refundsAmount,
      expenses_amount: closing.expensesAmount,
      expected_balance: closing.expectedBalance,
      declared_balance: closing.declaredBalance,
      discrepancy: closing.discrepancy,
      notes: closing.notes || null,
      status: closing.status,
      is_locked: closing.isLocked,
      created_at: closing.createdAt,
      updated_at: closing.updatedAt,
    }, { onConflict: 'id' });
  },

  // ------------------------------------------------------------------
  // 16. VÉHICULES (VEHICLES REGISTRY)
  // ------------------------------------------------------------------
  async fetchVehicles(): Promise<Vehicle[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase.from('vehicles').select('*').order('last_seen_at', { ascending: false });
      if (error) return [];
      return (data || []).map((r: any) => ({
        id: r.id,
        plateNumber: r.plate_number,
        vehicleType: r.vehicle_type,
        makeModel: r.make_model,
        driverName: r.driver_name,
        driverPhone: r.driver_phone,
        companyName: r.company_name,
        isFlaggedFraud: r.is_flagged_fraud,
        flagReason: r.flag_reason,
        lastSeenAt: r.last_seen_at,
        totalTicketsCount: r.total_tickets_count || 0,
        totalControlsCount: r.total_controls_count || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch {
      return [];
    }
  },

  async upsertVehicle(vehicle: Vehicle): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) return;

    await supabase.from('vehicles').upsert({
      id: sanitizeUuid(vehicle.id),
      plate_number: vehicle.plateNumber.toUpperCase().trim(),
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
