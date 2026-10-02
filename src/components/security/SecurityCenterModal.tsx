import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  AlertTriangle,
  QrCode,
  Smartphone,
  RefreshCw,
  Clock,
  Download,
  CheckCircle2,
  FileText,
  UserX,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { getDB } from '../../db/indexedDb';
import { formatDateTime } from '../../utils/normalization';
import type { LoginAttempt, AuditLog } from '../../types';

interface SecurityCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityCenterModal: React.FC<SecurityCenterModalProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const { auditLogs, controls, fraudReports, refreshData } = useData();

  const [activeTab, setActiveTab] = useState<'LOGINS' | 'QR_CONTROLS' | 'PRIVILEGED_OPS' | 'ANOMALIES'>('LOGINS');
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [loadingLogins, setLoadingLogins] = useState(false);

  // Charger l'historique des tentatives de connexion depuis IndexedDB
  useEffect(() => {
    if (!isOpen) return;

    const loadAttempts = async () => {
      setLoadingLogins(true);
      try {
        const db = await getDB();
        if (db.objectStoreNames.contains('login_attempts')) {
          const all = await db.getAll('login_attempts');
          setLoginAttempts(
            all.sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime())
          );
        }
      } catch (err) {
        console.warn('Erreur chargement login_attempts:', err);
      } finally {
        setLoadingLogins(false);
      }
    };

    loadAttempts();
  }, [isOpen]);

  // Statistiques de sécurité
  const failedLoginsCount = useMemo(() => {
    return loginAttempts.filter((a) => !a.isSuccessful).length;
  }, [loginAttempts]);

  const recentReplaysCount = useMemo(() => {
    // Contrôles multiples sur le même ticket
    const countMap = new Map<string, number>();
    controls.forEach((c) => {
      const current = countMap.get(c.ticketNumber) || 0;
      countMap.set(c.ticketNumber, current + 1);
    });
    return Array.from(countMap.values()).filter((cnt) => cnt > 1).length;
  }, [controls]);

  // Opérations privilégiées (annulations, créations d'utilisateurs, réimpressions)
  const privilegedLogs = useMemo(() => {
    return auditLogs.filter((a) => {
      const act = a.action.toUpperCase();
      return (
        act.includes('CANCEL') ||
        act.includes('DELETE') ||
        act.includes('REPRINT') ||
        act.includes('USER_CREATED') ||
        act.includes('USER_DEACTIVATED') ||
        act.includes('PASSWORD') ||
        act.includes('CONFIG')
      );
    });
  }, [auditLogs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Centre de Sécurité & Surveillance Cryptographique</h3>
                <span className="rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 text-[11px] font-bold">
                  SÉCURITÉ PORTUS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Détection des tentatives d'intrusion, rejeux de QR code et traçabilité des opérations sensibles
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Métriques clés */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-800 p-5 bg-slate-950/60">
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 space-y-1">
            <span className="text-[11px] text-rose-400 font-semibold block">Tentatives échouées</span>
            <span className="text-lg font-black text-white">{failedLoginsCount}</span>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 space-y-1">
            <span className="text-[11px] text-amber-400 font-semibold block">Tickets Scannés Multiples (Rejeu)</span>
            <span className="text-lg font-black text-white">{recentReplaysCount}</span>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3 space-y-1">
            <span className="text-[11px] text-blue-400 font-semibold block">Actes Privilégiés tracés</span>
            <span className="text-lg font-black text-white">{privilegedLogs.length}</span>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1">
            <span className="text-[11px] text-emerald-400 font-semibold block">Signalements Fraude</span>
            <span className="text-lg font-black text-white">{fraudReports.length}</span>
          </div>
        </div>

        {/* Barre d'onglets */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-6 py-2 bg-slate-900">
          <button
            onClick={() => setActiveTab('LOGINS')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'LOGINS'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Connexions & Échecs ({loginAttempts.length})
          </button>
          <button
            onClick={() => setActiveTab('QR_CONTROLS')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'QR_CONTROLS'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Contrôles QR & Rejeux ({controls.length})
          </button>
          <button
            onClick={() => setActiveTab('PRIVILEGED_OPS')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === 'PRIVILEGED_OPS'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Opérations Privilégiées ({privilegedLogs.length})
          </button>
        </div>

        {/* Corps des onglets */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
          {activeTab === 'LOGINS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Journal des Tentatives d'Authentification
                </h4>
                <span className="text-[11px] text-slate-500">
                  Règle : Verrouillage 15 min après 5 échecs consécutifs
                </span>
              </div>

              {loadingLogins ? (
                <div className="py-10 text-center text-slate-500 text-xs">Chargement...</div>
              ) : loginAttempts.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs">
                  Aucune tentative de connexion enregistrée.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Horodatage</th>
                        <th className="p-3">Identifiant</th>
                        <th className="p-3">Résultat</th>
                        <th className="p-3">Motif / Contexte</th>
                        <th className="p-3">Terminal / User-Agent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {loginAttempts.slice(0, 50).map((a) => (
                        <tr key={a.id} className="hover:bg-slate-800/30">
                          <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                            {formatDateTime(a.attemptedAt)}
                          </td>
                          <td className="p-3 font-bold text-white">{a.username}</td>
                          <td className="p-3">
                            {a.isSuccessful ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3" />
                                SUCCÈS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold">
                                <AlertTriangle className="w-3 h-3" />
                                ÉCHEC
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-300 text-xs">
                            {a.failureReason || 'Authentifié avec succès'}
                          </td>
                          <td className="p-3 text-slate-500 text-[11px] truncate max-w-xs" title={a.userAgent}>
                            {a.userAgent || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'QR_CONTROLS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Vérifications QR Routières & Détection des Rejeux
                </h4>
                <span className="text-[11px] text-slate-500">
                  Un ticket scanné plusieurs fois déclenche une alerte de rejeu immédiate
                </span>
              </div>

              {controls.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs">
                  Aucun contrôle routier enregistré pour l'instant.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Date & Heure</th>
                        <th className="p-3">Numéro Ticket</th>
                        <th className="p-3">Plaque Scannée</th>
                        <th className="p-3">Contrôleur</th>
                        <th className="p-3">Résultat Scan</th>
                        <th className="p-3">Statut Rejeu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {controls.map((ctrl) => {
                        const totalTimesScanned = controls.filter((c) => c.ticketNumber === ctrl.ticketNumber).length;
                        const isReplay = totalTimesScanned > 1;

                        return (
                          <tr key={ctrl.id} className="hover:bg-slate-800/30">
                            <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                              {formatDateTime(ctrl.controlledAt)}
                            </td>
                            <td className="p-3 font-mono font-bold text-white">{ctrl.ticketNumber}</td>
                            <td className="p-3 font-mono text-emerald-400">{ctrl.plateNumber}</td>
                            <td className="p-3 text-slate-300">{ctrl.controleurName}</td>
                            <td className="p-3">
                              {ctrl.isValid ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                                  VALIDE
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 text-rose-300 px-2 py-0.5 text-[10px] font-bold">
                                  INVALIDÉ
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              {isReplay ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold">
                                  <AlertTriangle className="w-3 h-3" />
                                  REJEU ({totalTimesScanned} scans)
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-500">Scan unique</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'PRIVILEGED_OPS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Journal des Actions Sensibles & Administratives
                </h4>
                <span className="text-[11px] text-slate-500">
                  Enregistré de manière inaltérable dans IndexedDB et Supabase
                </span>
              </div>

              {privilegedLogs.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs">
                  Aucune opération privilégiée enregistrée.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Action</th>
                        <th className="p-3">Opérateur</th>
                        <th className="p-3">Rôle</th>
                        <th className="p-3">Cible</th>
                        <th className="p-3">Détails</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {privilegedLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/30">
                          <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                            {formatDateTime(log.timestamp)}
                          </td>
                          <td className="p-3 font-mono font-bold text-amber-400">{log.action}</td>
                          <td className="p-3 font-semibold text-white">{log.actorName}</td>
                          <td className="p-3 text-slate-400">{log.actorRole}</td>
                          <td className="p-3 font-mono text-slate-300">{log.targetId || '—'}</td>
                          <td className="p-3 text-slate-400 text-[11px] max-w-xs truncate" title={JSON.stringify(log.details || {})}>
                            {JSON.stringify(log.details || {})}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 p-4 bg-slate-900/50">
          <div className="text-[11px] text-slate-500">
            Intégrité et audit cryptographique certifiés par PORTUS
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
