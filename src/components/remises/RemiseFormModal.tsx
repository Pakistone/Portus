import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  HandCoins,
  AlertCircle,
  CheckCircle2,
  Printer,
  Calculator,
  RefreshCw,
  User as UserIcon,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA } from '../../utils/normalization';
import { generateRemiseReceiptPDF } from '../../utils/pdfGenerator';
import { prioritizeUncoveredTicketsForActor } from '../../context/data/hooks/useRemittances';
import type { Remise } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preselectedAgentId?: string;
}

export const RemiseFormModal: React.FC<Props> = ({
  isOpen,
  onClose,
  preselectedAgentId,
}) => {
  const { currentUser } = useAuth();
  const { users, carnets, tickets, remises, recordRemise, getAgentStats } = useData();

  const [selectedAgentId, setSelectedAgentId] = useState(preselectedAgentId || '');
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRemise, setCreatedRemise] = useState<Remise | null>(null);
  const isSubmittingRef = React.useRef(false);

  // States pour le calculateur de billets (Billetage assisté BCEAO)
  const [showCounter, setShowCounter] = useState(false);
  const [b10000, setB10000] = useState<string>('');
  const [b5000, setB5000] = useState<string>('');
  const [b2000, setB2000] = useState<string>('');
  const [b1000, setB1000] = useState<string>('');
  const [b500, setB500] = useState<string>('');

  const counterTotal =
    Number(b10000 || 0) * 10000 +
    Number(b5000 || 0) * 5000 +
    Number(b2000 || 0) * 2000 +
    Number(b1000 || 0) * 1000 +
    Number(b500 || 0) * 500;

  const applyCounterTotal = () => {
    setAmount(String(counterTotal));
    setShowCounter(false);
  };

  const resetCounter = () => {
    setB10000('');
    setB5000('');
    setB2000('');
    setB1000('');
    setB500('');
  };

  const isAdmin = currentUser?.role === 'ADMINISTRATEUR';
  const isResponsable = currentUser?.role === 'RESPONSABLE';

  // Liste des agents éligibles selon le rôle :
  // - ADMINISTRATEUR : tous les agents actifs
  // - RESPONSABLE : tous les agents actifs (priorité à ceux ayant des tickets/carnets gérés par ce responsable ou des ventes non couvertes)
  const eligibleAgents = useMemo(() => {
    if (!currentUser) return [];
    const activeAgents = users.filter((u) => u.role === 'AGENT' && u.isActive !== false);
    if (isAdmin) {
      return activeAgents;
    }
    if (isResponsable) {
      const respCarnetIds = new Set(
        carnets
          .filter(
            (c) =>
              c.assignedToResponsableId === currentUser.id ||
              (c as unknown as { assignedResponsableId?: string })?.assignedResponsableId ===
                currentUser.id
          )
          .map((c) => c.id)
      );

      // Si des agents ont des tickets liés aux carnets du responsable ou sans responsable renseigné, tous les agents actifs restent sélectionnables sans blocage de secteur
      return [...activeAgents].sort((a, b) => {
        const aHasManagedTickets = tickets.some(
          (t) =>
            t.assignedAgentId === a.id &&
            (t.assignedResponsableId === currentUser.id ||
              respCarnetIds.has(t.carnetId) ||
              !t.assignedResponsableId)
        );
        const bHasManagedTickets = tickets.some(
          (t) =>
            t.assignedAgentId === b.id &&
            (t.assignedResponsableId === currentUser.id ||
              respCarnetIds.has(t.carnetId) ||
              !t.assignedResponsableId)
        );
        if (aHasManagedTickets && !bHasManagedTickets) return -1;
        if (!aHasManagedTickets && bHasManagedTickets) return 1;
        return a.fullName.localeCompare(b.fullName);
      });
    }
    return [];
  }, [currentUser, users, carnets, tickets, isAdmin, isResponsable]);

  const computeAgentRemiseSummary = (agId: string) => {
    if (!agId || !currentUser) return null;
    const baseStats = getAgentStats(agId);

    const allUncovered = tickets.filter(
      (t) =>
        t.assignedAgentId === agId &&
        (t.status === 'SOLD' || t.status === 'CONTROLLED') &&
        !t.coveredByRemiseId
    );

    const eligibleUncovered = prioritizeUncoveredTicketsForActor(
      allUncovered,
      carnets,
      currentUser
    );

    const uncoveredAmount = eligibleUncovered.length * TICKET_PRICE_FCFA;
    const effectiveRemaining = Math.max(baseStats.remainingBalance, uncoveredAmount);

    return {
      ...baseStats,
      remainingBalance: effectiveRemaining,
      uncoveredTickets: eligibleUncovered,
      unremittedTicketsCount: Math.max(baseStats.unremittedTicketsCount, eligibleUncovered.length),
    };
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setCreatedRemise(null);
      if (preselectedAgentId) {
        setSelectedAgentId(preselectedAgentId);
        const summary = computeAgentRemiseSummary(preselectedAgentId);
        setAmount(
          summary && summary.remainingBalance > 0 ? String(summary.remainingBalance) : ''
        );
      }
    }
  }, [isOpen, preselectedAgentId]);

  if (!isOpen || !currentUser || (!isAdmin && !isResponsable)) return null;

  const selectedAgentUser = users.find((u) => u.id === selectedAgentId) || null;
  const agentStats = selectedAgentId ? computeAgentRemiseSummary(selectedAgentId) : null;

  const handleAgentChange = (agId: string) => {
    setSelectedAgentId(agId);
    setError(null);
    if (agId) {
      const summary = computeAgentRemiseSummary(agId);
      setAmount(summary && summary.remainingBalance > 0 ? String(summary.remainingBalance) : '');
    } else {
      setAmount('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || loading) return;

    setError(null);

    const numAmount = Number(amount || 0);
    if (!selectedAgentId) {
      setError('Veuillez sélectionner un agent.');
      return;
    }
    if (numAmount <= 0) {
      setError('Le montant doit être supérieur à zéro.');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const remise = await recordRemise({
        agentId: selectedAgentId,
        amount: numAmount,
        note: note.trim() || undefined,
      });
      setCreatedRemise(remise);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’enregistrement de la remise.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handlePrintReceipt = async () => {
    if (!createdRemise) return;
    await generateRemiseReceiptPDF(createdRemise);
  };

  const handleClose = () => {
    setCreatedRemise(null);
    setAmount('');
    setNote('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-lg my-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 pb-28 sm:pb-32 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
              <HandCoins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Encaisser une Remise Financière</h3>
              <p className="text-[11px] text-slate-400">
                Flux direct U.J.P.A.S. : Agent → Superviseur / Administrateur
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {createdRemise ? (
          <div className="my-6 space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-emerald-400">
                Remise Enregistrée
              </span>
              <h4 className="text-xl font-black text-white mt-0.5">{createdRemise.reference}</h4>
              <p className="text-sm font-semibold text-slate-300 mt-1">
                Montant :{' '}
                <strong className="text-emerald-400">{formatFCFA(createdRemise.amount)}</strong>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Agent : {createdRemise.agentName} • {createdRemise.ticketsCount} ticket(s) couvert(s)
              </p>
            </div>

            <div className="flex gap-2 pt-3">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-lg hover:bg-emerald-500 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Télécharger le Récépissé Officiel (PDF)</span>
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl bg-slate-800 px-4 py-3 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Choix de l'Agent */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Sélectionner l’Agent (Pool Mobile Global U.J.P.A.S.)
              </label>
              <select
                required
                value={selectedAgentId}
                onChange={(e) => handleAgentChange(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm text-white focus:border-blue-500 focus:outline-hidden"
              >
                <option value="">-- Choisir un agent --</option>
                {eligibleAgents.map((ag) => {
                  const agSummary = computeAgentRemiseSummary(ag.id);
                  const due = agSummary?.remainingBalance || 0;
                  return (
                    <option key={ag.id} value={ag.id}>
                      {ag.fullName} {due > 0 ? `• À remettre : ${formatFCFA(due)}` : '• À jour (0 FCFA)'}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Fiche d'état financier de l'Agent sélectionné */}
            {agentStats && selectedAgentUser && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    {selectedAgentUser.avatarUrl ? (
                      <img
                        src={selectedAgentUser.avatarUrl}
                        alt={selectedAgentUser.fullName}
                        className="w-9 h-9 rounded-full object-cover border border-emerald-500/40 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0">
                        <UserIcon className="w-4 h-4" />
                      </div>
                    )}
                    <div>
                      <span className="font-bold text-white block">
                        {selectedAgentUser.fullName}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {selectedAgentUser.phone || 'Téléphone non renseigné'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {formatFCFA(TICKET_PRICE_FCFA)} / ticket
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-400">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500">
                      Tickets Vendus
                    </p>
                    <p className="text-sm font-bold text-white font-mono">
                      {agentStats.soldCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500">
                      Montant Attendu
                    </p>
                    <p className="text-sm font-bold text-white font-mono">
                      {formatFCFA(agentStats.expectedAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500">
                      Montant Déjà Remis
                    </p>
                    <p className="text-sm font-bold text-emerald-400 font-mono">
                      {formatFCFA(agentStats.remittedAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500">
                      Solde Restant à Remettre
                    </p>
                    <p
                      className={`text-sm font-bold font-mono ${
                        agentStats.remainingBalance > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {formatFCFA(agentStats.remainingBalance)}
                    </p>
                  </div>
                </div>

                {agentStats.uncoveredTickets.length > 0 && (
                  <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Tickets vendus non couverts ({agentStats.uncoveredTickets.length}) :
                    </p>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {agentStats.uncoveredTickets.map((t) => (
                        <span
                          key={t.id}
                          className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono font-bold text-amber-300"
                        >
                          {t.ticketNumber}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {Number(amount || 0) > 0 && (
                  <div className="mt-2 rounded-lg bg-slate-900 border border-slate-800 p-2.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                      Impact après cette remise ({formatFCFA(Number(amount))}) :
                    </p>
                    {(() => {
                      const numAmt = Number(amount || 0);
                      const newBalance = Math.max(0, agentStats.remainingBalance - numAmt);
                      return (
                        <div className="flex items-center justify-between text-xs pt-0.5">
                          <span className="text-slate-300 font-medium">
                            Nouveau Solde Restant :
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              newBalance > 0 ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {newBalance === 0
                              ? '0 FCFA (Entièrement régularisé)'
                              : formatFCFA(newBalance)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Montant versé (remise partielle autorisée) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  Montant remis (FCFA) —{' '}
                  <span className="text-emerald-400 font-normal">Remise partielle autorisée</span>
                </label>
                <span className="text-[11px] text-slate-400 font-mono">
                  {Math.floor(Number(amount || 0) / TICKET_PRICE_FCFA)} ticket(s) couvert(s)
                </span>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={amount}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^\d]/g, '').replace(/^0+/, '');
                      setAmount(cleaned);
                    }}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-base font-bold font-mono text-white focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowCounter(!showCounter)}
                  className={`px-3 py-2.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer ${
                    showCounter
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-750'
                  }`}
                  title="Calculateur de coupures de billets BCEAO (billetage)"
                >
                  <Calculator className="w-4 h-4" />
                  <span>Coupures</span>
                </button>
              </div>

              {showCounter && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-black text-blue-400 flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5" />
                      <span>ASSISTANT COMPTAGE / BILLETAGE BCEAO</span>
                    </span>
                    <button
                      type="button"
                      onClick={resetCounter}
                      className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Réinitialiser</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <div className="w-3 h-6 rounded bg-indigo-700 border border-indigo-500 shadow-sm" />
                        <span className="font-mono font-bold text-indigo-300">10 000 FCFA</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={b10000}
                        onChange={(e) => setB10000(e.target.value.replace(/[^\d]/g, ''))}
                        className="w-16 rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-center font-mono font-bold text-white text-xs"
                      />
                      <span className="w-20 text-right font-mono font-semibold text-slate-400">
                        {b10000 ? formatFCFA(Number(b10000) * 10000) : '0 FCFA'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <div className="w-3 h-6 rounded bg-emerald-700 border border-emerald-500 shadow-sm" />
                        <span className="font-mono font-bold text-emerald-300">5 000 FCFA</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={b5000}
                        onChange={(e) => setB5000(e.target.value.replace(/[^\d]/g, ''))}
                        className="w-16 rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-center font-mono font-bold text-white text-xs"
                      />
                      <span className="w-20 text-right font-mono font-semibold text-slate-400">
                        {b5000 ? formatFCFA(Number(b5000) * 5000) : '0 FCFA'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <div className="w-3 h-6 rounded bg-cyan-700 border border-cyan-500 shadow-sm" />
                        <span className="font-mono font-bold text-cyan-300">2 000 FCFA</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={b2000}
                        onChange={(e) => setB2000(e.target.value.replace(/[^\d]/g, ''))}
                        className="w-16 rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-center font-mono font-bold text-white text-xs"
                      />
                      <span className="w-20 text-right font-mono font-semibold text-slate-400">
                        {b2000 ? formatFCFA(Number(b2000) * 2000) : '0 FCFA'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <div className="w-3 h-6 rounded bg-rose-700 border border-rose-500 shadow-sm" />
                        <span className="font-mono font-bold text-rose-300">1 000 FCFA</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={b1000}
                        onChange={(e) => setB1000(e.target.value.replace(/[^\d]/g, ''))}
                        className="w-16 rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-center font-mono font-bold text-white text-xs"
                      />
                      <span className="w-20 text-right font-mono font-semibold text-slate-400">
                        {b1000 ? formatFCFA(Number(b1000) * 1000) : '0 FCFA'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <div className="w-3 h-6 rounded bg-amber-700 border border-amber-500 shadow-sm" />
                        <span className="font-mono font-bold text-amber-300">500 FCFA</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={b500}
                        onChange={(e) => setB500(e.target.value.replace(/[^\d]/g, ''))}
                        className="w-16 rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-center font-mono font-bold text-white text-xs"
                      />
                      <span className="w-20 text-right font-mono font-semibold text-slate-400">
                        {b500 ? formatFCFA(Number(b500) * 500) : '0 FCFA'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-black">
                        Somme calculée
                      </p>
                      <p className="text-sm font-black text-emerald-400 font-mono">
                        {formatFCFA(counterTotal)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={applyCounterTotal}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
                    >
                      Appliquer le montant
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Note ou observation */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Observation / Note (Facultatif)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: Remise partielle de mi-journée ou solde complet"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-[11px] text-slate-400 flex items-start gap-2">
              <span className="text-blue-400 font-bold shrink-0">🔒 Immutabilité :</span>
              <span>
                Une fois validée, la remise met immédiatement à jour les tickets vendus couverts. Seul l'administrateur peut procéder à une correction exceptionnelle motivée.
              </span>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading || !selectedAgentId || Number(amount || 0) <= 0}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-500 transition shadow-md disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Enregistrement...' : 'Encaisser la Remise'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
