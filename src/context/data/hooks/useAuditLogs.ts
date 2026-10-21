import { useState, useCallback } from 'react';
import type { AuditLog, AuditAction, User } from '../../../types';
import { getDB } from '../../../db/indexedDb';
import { generateUUID } from '../../../utils/uuid';
import { SupabaseDataLayer } from '../../../db/supabaseService';

export type AuditLogValue = Record<string, unknown> | string | number | boolean | null;

/**
 * Hook de gestion du journal d'audit immuable de PORTUS — U.J.P.A.S.
 * Union des Jeunes du Port pour l'Assistance et la Sécurité — Zone Portuaire & Industrielle d'Abidjan
 * Typage strict sans aucun 'any' et gestion explicite des erreurs réseau/stockage.
 */
export function useAuditLogs() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const recordAudit = useCallback(
    async (
      action: AuditAction,
      targetEntity: string,
      targetId: string,
      details?: string,
      oldValue?: AuditLogValue,
      newValue?: AuditLogValue,
      currentUser?: User | null
    ): Promise<void> => {
      const log: AuditLog = {
        id: generateUUID(),
        actorId: currentUser?.id || '00000000-0000-0000-0000-000000000000',
        actorName: currentUser?.fullName || 'SYSTÈME U.J.P.A.S.',
        actorRole: currentUser?.role || 'ADMINISTRATEUR',
        action,
        timestamp: new Date().toISOString(),
        targetEntity,
        targetId,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
        details: details ?? null,
      };

      try {
        const db = await getDB();
        await db.put('audit_logs', log);
        setAuditLogs((prev) => [log, ...prev]);
      } catch (storageError: unknown) {
        const message =
          storageError instanceof Error ? storageError.message : 'Erreur IndexedDB inconnue';
        console.warn(`[PORTUS — U.J.P.A.S. Audit] Échec d’écriture locale du log (${action}): ${message}`);
      }

      if (SupabaseDataLayer.isAvailable()) {
        try {
          await SupabaseDataLayer.insertAuditLog(log);
        } catch (networkError: unknown) {
          const message =
            networkError instanceof Error ? networkError.message : 'Erreur réseau Supabase';
          console.warn(
            `[PORTUS — U.J.P.A.S. Audit] Synchronisation différée du log (${action}): ${message}`
          );
        }
      }
    },
    []
  );

  return {
    auditLogs,
    setAuditLogs,
    recordAudit,
  };
}
