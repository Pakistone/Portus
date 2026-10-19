import { useState, useCallback } from 'react';
import type { AuditLog, User } from '../../../types';
import { getDB } from '../../../db/indexedDb';
import { generateUUID } from '../../../utils/uuid';
import { SupabaseDataLayer } from '../../../db/supabaseService';

export function useAuditLogs() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const recordAudit = useCallback(async (
    action: AuditLog['action'],
    targetEntity: string,
    targetId: string,
    details?: string,
    oldValue?: any,
    newValue?: any,
    currentUser?: User | null
  ) => {
    try {
      const db = await getDB();
      const log: AuditLog = {
        id: generateUUID(),
        actorId: currentUser?.id || '00000000-0000-0000-0000-000000000000',
        actorName: currentUser?.fullName || 'SYSTÈME',
        actorRole: currentUser?.role || 'ADMINISTRATEUR',
        action,
        timestamp: new Date().toISOString(),
        targetEntity,
        targetId,
        oldValue,
        newValue,
        details,
      };
      await db.put('audit_logs', log);
      setAuditLogs((prev) => [log, ...prev]);

      // Enregistrer dans Supabase si connecté (Append-only)
      if (SupabaseDataLayer.isAvailable()) {
        SupabaseDataLayer.insertAuditLog(log).catch((e) => console.warn('Supabase audit sync warning:', e));
      }
    } catch (err) {
      console.error('Erreur écriture audit log', err);
    }
  }, []);

  return {
    auditLogs,
    setAuditLogs,
    recordAudit,
  };
}
