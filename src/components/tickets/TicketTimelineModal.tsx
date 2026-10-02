import React, { useState, useMemo } from 'react';
import {
  X,
  History,
  CheckCircle2,
  Clock,
  User,
  ShieldCheck,
  AlertTriangle,
  Printer,
  Truck,
  Phone,
  QrCode,
  FileText,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import { recordTicketReprint } from '../../services/ticketService';
import type { Ticket, TicketStatus } from '../../types';

interface TicketTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId?: string | null;
  ticketNumber?: string | null;
}

export const TicketTimelineModal: React.FC<TicketTimelineModalProps> = ({
  isOpen,
  onClose,
  ticketId,
  ticketNumber,
}) => {
  const { currentUser } = useAuth();
  const { tickets, carnets, sales, auditLogs, refreshData } = useData();

  const [copiedToken, setCopiedToken] = useState(false);
  const [reprintReason, setReprintReason] = useState('');
  const [showReprintDialog, setShowReprintDialog] = useState(false);
  const [isSubmittingReprint, setIsSubmittingReprint] = useState(false);
  const [reprintSuccessMsg, setReprintSuccessMsg] = useState<string | null>(null);
  const [reprintErrorMsg, setReprintErrorMsg] = useState<string | null>(null);

  // Rechercher le ticket par ID ou par Numéro
  const ticket = useMemo<Ticket | undefined>(() => {
    if (!isOpen) return undefined;
    if (ticketId) {
      return tickets.find((t) => t.id === ticketId);
    }
    if (ticketNumber) {
      const normalized = ticketNumber.trim().toUpperCase();
      return tickets.find((t) => t.ticketNumber.toUpperCase() === normalized);
    }
    return undefined;
  }, [isOpen, ticketId, ticketNumber, tickets]);

  const carnet = useMemo(() => {
    if (!ticket) return undefined;
    return carnets.find((c) => c.id === ticket.carnetId);
  }, [ticket, carnets]);

  const sale = useMemo(() => {
    if (!ticket) return undefined;
    return sales.find((s) => s.ticketId === ticket.id || s.ticketNumber === ticket.ticketNumber);
  }, [ticket, sales]);

  const ticketAudits = useMemo(() => {
    if (!ticket) return [];
    return auditLogs
      .filter((a) => {
        const matchesTarget = a.targetId === ticket.id || a.targetId === ticket.ticketNumber;
        const matchesDetails = JSON.stringify(a.details || {}).includes(ticket.ticketNumber);
        return matchesTarget || matchesDetails;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [ticket, auditLogs]);

  if (!isOpen) return null;

  const handleCopyToken = () => {
    if (!ticket?.securityToken) return;
    navigator.clipboard.writeText(ticket.securityToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleTriggerReprint = async () => {
    if (!ticket || !currentUser) return;
    if (!reprintReason.trim()) {
      setReprintErrorMsg('Veuillez indiquer le motif obligatoire de réimpression.');
      return;
    }

    setIsSubmittingReprint(true);
    setReprintErrorMsg(null);
    setReprintSuccessMsg(null);

    try {
      const updated = await recordTicketReprint({
        ticket,
        actor: currentUser,
        reason: reprintReason.trim(),
      });

      setReprintSuccessMsg(
        `Réimpression autorisée et enregistrée dans le journal d'audit (Occurrences totales : ${updated.reprintCount}).`
      );
      setShowReprintDialog(false);
      setReprintReason('');
      await refreshData();
    } catch (err: any) {
      setReprintErrorMsg(err.message || 'Échec de la validation de la réimpression.');
    } finally {
      setIsSubmittingReprint(false);
    }
  };

  const statusStyles: Record<TicketStatus, { bg: string; text: string; label: string }> = {
    GENERATED: { bg: 'bg-slate-500/20', text: 'text-slate-300 border-slate-500/30', label: 'GÉNÉRÉ' },
    ASSIGNED_TO_RESPONSIBLE: { bg: 'bg-blue-500/20', text: 'text-blue-300 border-blue-500/30', label: 'AFFECTÉ RESPONSABLE' },
    AVAILABLE: { bg: 'bg-sky-500/20', text: 'text-sky-300 border-sky-500/30', label: 'DISPONIBLE' },
    ASSIGNED_TO_AGENT: { bg: 'bg-amber-500/20', text: 'text-amber-300 border-amber-500/30', label: 'AFFECTÉ AGENT' },
    SOLD: { bg: 'bg-emerald-500/20', text: 'text-emerald-300 border-emerald-500/30', label: 'VENDU' },
    CONTROLLED: { bg: 'bg-purple-500/20', text: 'text-purple-300 border-purple-500/30', label: 'CONTRÔLÉ' },
    CANCELLED: { bg: 'bg-rose-500/20', text: 'text-rose-300 border-rose-500/30', label: 'ANNULÉ' },
  };

  const currentStatusInfo = ticket ? statusStyles[ticket.status] || { bg: 'bg-slate-800', text: 'text-slate-300', label: ticket.status } : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Chronologie & Traçabilité Ticket</h3>
                {ticket && currentStatusInfo && (
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${currentStatusInfo.bg} ${currentStatusInfo.text}`}
                  >
                    {currentStatusInfo.label}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Cycle de vie certifié, signature cryptographique et journal des réimpressions
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

        {/* Corps */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {!ticket ? (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <AlertTriangle className="w-10 h-10 mx-auto text-amber-400" />
              <p className="font-semibold text-white">Aucun ticket sélectionné ou ticket introuvable</p>
              <p className="text-xs">
                Vérifiez la référence (ex: {ticketNumber || 'TKT-...'}).
              </p>
            </div>
          ) : (
            <>
              {/* Carte Récapitulative du Ticket */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div>
                  <div className="text-[11px] text-slate-400">Numéro de Ticket</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">{ticket.ticketNumber}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Carnet Source</div>
                  <div className="text-sm font-semibold text-slate-200 font-mono">
                    {carnet?.carnetNumber || ticket.carnetNumber || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Tarif Officiel</div>
                  <div className="text-sm font-bold text-white">{ticket.price.toLocaleString('fr-FR')} FCFA</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Réimpressions</div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-sm font-bold font-mono ${
                        (ticket.reprintCount || 0) > 0 ? 'text-amber-400' : 'text-slate-300'
                      }`}
                    >
                      {ticket.reprintCount || 0}
                    </span>
                    {(ticket.reprintCount || 0) > 0 && (
                      <span className="rounded bg-amber-500/20 text-amber-300 px-1 py-0.2 text-[9px] font-bold">
                        DUPLICATA
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Message de succès ou erreur réimpression */}
              {reprintSuccessMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{reprintSuccessMsg}</span>
                </div>
              )}
              {reprintErrorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{reprintErrorMsg}</span>
                </div>
              )}

              {/* Sécurité Cryptographique & QR Token */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Empreinte Cryptographique (HMAC-SHA256)</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Protocole PORTUS v1</span>
                </div>
                <div className="flex items-center gap-2 bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 break-all">
                  <span className="flex-1 truncate">{ticket.securityToken || 'Généré à la vente'}</span>
                  {ticket.securityToken && (
                    <button
                      onClick={handleCopyToken}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition"
                      title="Copier le token"
                    >
                      {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Chronologie Étape par Étape */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Étapes du Cycle de Vie
                </h4>

                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                  {/* Étape 1 : Génération */}
                  <div className="relative">
                    <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      <FileText className="w-3 h-3" />
                    </div>
                    <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-xs">1. Génération du ticket</span>
                        <span className="text-[11px] text-slate-500">
                          {formatDateTime(ticket.createdAt || carnet?.createdAt || '')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Créé dans le lot du carnet <span className="font-mono text-slate-300">{ticket.carnetNumber}</span>
                      </p>
                    </div>
                  </div>

                  {/* Étape 2 : Affectation Responsable */}
                  {ticket.assignedResponsableName && (
                    <div className="relative">
                      <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        <User className="w-3 h-3" />
                      </div>
                      <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs">2. Remise au Responsable de Secteur</span>
                          <span className="text-[11px] text-slate-500">
                            {formatDateTime(carnet?.assignedToResponsableAt || '')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Responsable récepteur : <strong className="text-slate-200">{ticket.assignedResponsableName}</strong>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Étape 3 : Affectation Agent */}
                  {ticket.assignedAgentName && (
                    <div className="relative">
                      <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <User className="w-3 h-3" />
                      </div>
                      <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs">3. Dotation à l'Agent de Terrain</span>
                          <span className="text-[11px] text-slate-500">
                            {formatDateTime(ticket.assignedAt || '')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Agent assigné : <strong className="text-slate-200">{ticket.assignedAgentName}</strong>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Étape 4 : Vente */}
                  {ticket.status === 'SOLD' || ticket.status === 'CONTROLLED' || ticket.soldAt ? (
                    <div className="relative">
                      <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                      <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs">4. Vente & Enregistrement au Poste</span>
                          <span className="text-[11px] text-slate-500">
                            {formatDateTime(ticket.soldAt || sale?.soldAt || '')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>
                              Plaque :{' '}
                              <strong className="font-mono text-white">
                                {formatPlateDisplay(ticket.plateNumber || sale?.plateNumber || '—')}
                              </strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>
                              Chauffeur : <strong>{ticket.driverPhone || sale?.driverPhone || 'Non renseigné'}</strong>
                            </span>
                          </div>
                        </div>
                        {sale?.vehicleCategory && (
                          <div className="text-[11px] text-slate-400">
                            Catégorie : <span className="font-semibold text-slate-200">{sale.vehicleCategory}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Étape 5 : Contrôles Routiers */}
                  {ticket.status === 'CONTROLLED' || (ticket.controlledAt) ? (
                    <div className="relative">
                      <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                        <ShieldCheck className="w-3 h-3" />
                      </div>
                      <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs">5. Contrôle Routier Validé</span>
                          <span className="text-[11px] text-slate-500">
                            {formatDateTime(ticket.controlledAt || '')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Contrôleur validateur :{' '}
                          <strong className="text-slate-200">{ticket.controlledByName || 'Contrôle Corridor'}</strong>
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {/* Étape Réimpressions (si > 0) */}
                  {(ticket.reprintCount || 0) > 0 && (
                    <div className="relative">
                      <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <RotateCcw className="w-3 h-3" />
                      </div>
                      <div className="bg-amber-950/20 p-3.5 rounded-xl border border-amber-500/30 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-300 text-xs">
                            Réimpression Contrôlée ({ticket.reprintCount} fois)
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Dernière : {formatDateTime(ticket.lastReprintAt || '')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">
                          Motif consigné : <em>"{ticket.reprintReason || 'Non spécifié'}"</em>
                        </p>
                        {ticket.lastReprintBy && (
                          <p className="text-[11px] text-slate-400">
                            Opérateur : <strong className="text-slate-200">{ticket.lastReprintByName || ticket.lastReprintBy}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Étape Annulation (si annulé) */}
                  {ticket.status === 'CANCELLED' && (
                    <div className="relative">
                      <div className="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        <AlertTriangle className="w-3 h-3" />
                      </div>
                      <div className="bg-rose-950/20 p-3.5 rounded-xl border border-rose-500/30 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-300 text-xs">Ticket Annulé</span>
                          <span className="text-[11px] text-slate-400">
                            {formatDateTime(ticket.cancelledAt || '')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">
                          Motif : <em>"{ticket.cancelledReason || 'Annulation administrative'}"</em>
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Auteur : <strong className="text-slate-200">{ticket.cancelledByName || 'Admin'}</strong>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Journal d'audit détaillé */}
              {ticketAudits.length > 0 && (
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Traces d'Audit & Événements Bruts ({ticketAudits.length})
                  </h4>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-xl bg-slate-950/80 p-3 border border-slate-800 text-[11px]">
                    {ticketAudits.map((a) => (
                      <div key={a.id} className="flex items-start justify-between gap-2 border-b border-slate-800/50 pb-1.5">
                        <div>
                          <span className="font-mono text-emerald-400 font-semibold">{a.action}</span>
                          <span className="text-slate-400 ml-2">par {a.actorName} ({a.actorRole})</span>
                        </div>
                        <span className="text-slate-500 whitespace-nowrap">{formatDateTime(a.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Boîte de dialogue de Réimpression Contrôlée */}
              {showReprintDialog && (
                <div className="rounded-xl border border-amber-500/40 bg-slate-950 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                    <RotateCcw className="w-4 h-4 text-amber-400" />
                    <span>Demande d'autorisation de réimpression</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Toute réimpression est consignée de manière inaltérable et incrémente le compteur de duplicata du ticket.
                  </p>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Motif obligatoire :
                    </label>
                    <input
                      type="text"
                      value={reprintReason}
                      onChange={(e) => setReprintReason(e.target.value)}
                      placeholder="Ex: Problème d'imprimante thermique, papier coincé..."
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowReprintDialog(false)}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition"
                      disabled={isSubmittingReprint}
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleTriggerReprint}
                      disabled={isSubmittingReprint}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 transition disabled:opacity-50"
                    >
                      {isSubmittingReprint ? 'Validation...' : 'Confirmer & Réimprimer'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 p-4 bg-slate-900/50">
          <div>
            {ticket && (ticket.status === 'SOLD' || ticket.status === 'CONTROLLED') && (
              <button
                onClick={() => setShowReprintDialog(true)}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Réimpression Contrôlée</span>
              </button>
            )}
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
