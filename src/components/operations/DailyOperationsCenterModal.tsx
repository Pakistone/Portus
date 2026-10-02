import React, { useState, useMemo } from 'react';
import {
  X,
  Calendar,
  DollarSign,
  TrendingUp,
  Receipt,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Building2,
  Users,
  Wallet,
  Lock,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { submitDailyClosing, calculateNetCashSession } from '../../services/financeService';
import { formatDateTime } from '../../utils/normalization';
import type { DailyClosing, Expense, Remise } from '../../types';

interface DailyOperationsCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenExpenses?: () => void;
  onOpenRemises?: () => void;
}

export const DailyOperationsCenterModal: React.FC<DailyOperationsCenterModalProps> = ({
  isOpen,
  onClose,
  onOpenExpenses,
  onOpenRemises,
}) => {
  const { currentUser } = useAuth();
  const {
    sales,
    tickets,
    remises,
    expenses,
    dailyClosings,
    users,
    refreshData,
  } = useData();

  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'CLOSING' | 'HISTORY'>('SUMMARY');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Formulaire de clôture
  const [physicalCashInput, setPhysicalCashInput] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [isSubmittingClosing, setIsSubmittingClosing] = useState(false);
  const [closingError, setClosingError] = useState<string | null>(null);
  const [closingSuccess, setClosingSuccess] = useState<string | null>(null);

  // Filtrage par date sélectionnée
  const salesForDate = useMemo(() => {
    return sales.filter((s) => s.soldAt.slice(0, 10) === selectedDate);
  }, [sales, selectedDate]);

  const remisesForDate = useMemo(() => {
    return (remises || []).filter((r) => (r.createdAt || '').slice(0, 10) === selectedDate);
  }, [remises, selectedDate]);

  const expensesForDate = useMemo(() => {
    return (expenses || []).filter((e) => (e.expenseDate || e.createdAt || '').slice(0, 10) === selectedDate);
  }, [expenses, selectedDate]);

  // Calculs financiers
  const totalSalesAmount = useMemo(() => {
    return salesForDate.reduce((sum, s) => sum + s.price, 0);
  }, [salesForDate]);

  const validatedRemisesAmount = useMemo(() => {
    return remisesForDate
      .filter((r) => !r.status || r.status === 'VALIDE' || r.status === 'VALIDEE')
      .reduce((sum, r) => sum + (r.amount || r.montant || 0), 0);
  }, [remisesForDate]);

  const approvedExpensesAmount = useMemo(() => {
    return expensesForDate
      .filter((e) => e.status === 'VALIDATED' || e.status === 'VALIDEE' || e.status === 'PAYEE')
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expensesForDate]);

  // Solde théorique attendu en caisse
  const theoreticalBalance = useMemo(() => {
    return totalSalesAmount - approvedExpensesAmount;
  }, [totalSalesAmount, approvedExpensesAmount]);

  // Calcul du solde déclaré et écart
  const declaredCash = parseFloat(physicalCashInput) || 0;
  const cashDifference = physicalCashInput !== '' ? declaredCash - theoreticalBalance : 0;

  // Agents actifs aujourd'hui
  const activeAgentIds = useMemo(() => {
    const ids = new Set<string>();
    salesForDate.forEach((s) => ids.add(s.agentId));
    return Array.from(ids);
  }, [salesForDate]);

  // Vérification de clôture existante pour cette date
  const existingClosing = useMemo(() => {
    return (dailyClosings || []).find((c) => (c.date || c.closingDate) === selectedDate);
  }, [dailyClosings, selectedDate]);

  if (!isOpen) return null;

  const handleExecuteClosing = async () => {
    if (!currentUser) return;
    if (physicalCashInput === '') {
      setClosingError('Veuillez saisir le montant réel des espèces physiques comptées.');
      return;
    }

    setIsSubmittingClosing(true);
    setClosingError(null);
    setClosingSuccess(null);

    try {
      await submitDailyClosing({
        date: selectedDate,
        expectedBalance: theoreticalBalance,
        declaredCash,
        difference: cashDifference,
        totalSales: totalSalesAmount,
        totalExpenses: approvedExpensesAmount,
        totalRemises: validatedRemisesAmount,
        ticketCount: salesForDate.length,
        notes: closingNotes.trim() || undefined,
        closedBy: currentUser,
      });

      setClosingSuccess('La clôture journalière a été validée et enregistrée avec succès.');
      setPhysicalCashInput('');
      setClosingNotes('');
      await refreshData();
      setActiveTab('SUMMARY');
    } catch (err: any) {
      setClosingError(err.message || 'Erreur lors de la validation de la clôture.');
    } finally {
      setIsSubmittingClosing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Centre des Opérations & Caisse Journalière</h3>
                <span className="rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold">
                  U.J.S.R.V.
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Pilotage quotidien des encaissements, remises, dépenses et clôtures officielles
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

        {/* Barre de contrôle : Sélecteur de date & Onglets */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-3 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-300">Date d'opération :</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-white focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('SUMMARY')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'SUMMARY'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Vue Synthétique
            </button>
            <button
              onClick={() => setActiveTab('CLOSING')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'CLOSING'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Clôture de Caisse
            </button>
            <button
              onClick={() => setActiveTab('HISTORY')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'HISTORY'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Historique des Clôtures
            </button>
          </div>
        </div>

        {/* Corps des onglets */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {activeTab === 'SUMMARY' && (
            <div className="space-y-6">
              {/* Grille des KPI du Jour */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Recettes Ventes */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
                    <span>Recettes Ventes</span>
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-white">
                    {totalSalesAmount.toLocaleString('fr-FR')} FCFA
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {salesForDate.length} ticket(s) délivré(s)
                  </div>
                </div>

                {/* 2. Dépenses Validées */}
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-rose-400 font-semibold">
                    <span>Dépenses Validées</span>
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-white">
                    {approvedExpensesAmount.toLocaleString('fr-FR')} FCFA
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {expensesForDate.length} dépense(s) du jour
                  </div>
                </div>

                {/* 3. Solde Théorique de Caisse */}
                <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-blue-400 font-semibold">
                    <span>Solde Théorique</span>
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-white">
                    {theoreticalBalance.toLocaleString('fr-FR')} FCFA
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Ventes - Dépenses autorisées
                  </div>
                </div>

                {/* 4. Agents Actifs */}
                <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-purple-400 font-semibold">
                    <span>Agents Déployés</span>
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-white">
                    {activeAgentIds.length} actif(s)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Sur le corridor Vridi
                  </div>
                </div>
              </div>

              {/* État de Clôture du Jour */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-bold text-white text-sm">
                      Statut de Clôture pour le {selectedDate}
                    </h4>
                  </div>
                  {existingClosing ? (
                    <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-300">
                      CLÔTURE EFFECTUÉE
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-300">
                      EN COURS (NON CLÔTURÉ)
                    </span>
                  )}
                </div>

                {existingClosing ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900 p-3.5 rounded-xl border border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-400 block">Espèces Déclarées :</span>
                      <strong className="text-white font-mono text-sm">
                        {(existingClosing.declaredCash ?? existingClosing.declaredBalance ?? 0).toLocaleString('fr-FR')} FCFA
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Écart constaté :</span>
                      {(() => {
                        const diff = existingClosing.difference ?? existingClosing.discrepancy ?? 0;
                        return (
                          <strong
                            className={`font-mono text-sm ${
                              diff === 0
                                ? 'text-emerald-400'
                                : diff > 0
                                ? 'text-blue-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {diff > 0 ? '+' : ''}
                            {diff.toLocaleString('fr-FR')} FCFA
                          </strong>
                        );
                      })()}
                    </div>
                    <div>
                      <span className="text-slate-400 block">Clôturé par :</span>
                      <strong className="text-slate-200">
                        {existingClosing.closedByName || existingClosing.confirmedByName || existingClosing.cashierName || 'Caissier'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Heure de validation :</span>
                      <span className="text-slate-400">
                        {formatDateTime(existingClosing.closedAt || existingClosing.confirmedAt || existingClosing.updatedAt || existingClosing.createdAt)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300">
                    <span>
                      La caisse de cette journée n'est pas encore arrêtée. Vous pouvez procéder au comptage et à la clôture.
                    </span>
                    <button
                      onClick={() => setActiveTab('CLOSING')}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500 transition"
                    >
                      <span>Procéder à la Clôture</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Raccourcis Dépenses et Remises */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">Remises de Recettes</span>
                    {onOpenRemises && (
                      <button
                        onClick={onOpenRemises}
                        className="text-xs text-emerald-400 hover:underline font-semibold"
                      >
                        Gérer les Remises &rarr;
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {remisesForDate.length} remise(s) soumise(s) pour un total validé de{' '}
                    <strong className="text-slate-200">
                      {validatedRemisesAmount.toLocaleString('fr-FR')} FCFA
                    </strong>
                    .
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">Dépenses d'Exploitation</span>
                    {onOpenExpenses && (
                      <button
                        onClick={onOpenExpenses}
                        className="text-xs text-emerald-400 hover:underline font-semibold"
                      >
                        Gérer les Dépenses &rarr;
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {expensesForDate.length} dépense(s) enregistrée(s) pour un montant total de{' '}
                    <strong className="text-slate-200">
                      {approvedExpensesAmount.toLocaleString('fr-FR')} FCFA
                    </strong>
                    .
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'CLOSING' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 space-y-5">
                <div>
                  <h4 className="text-base font-bold text-white">Comptage & Validation de Caisse</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Arrêté des comptes pour la date du <strong className="text-emerald-400">{selectedDate}</strong>
                  </p>
                </div>

                {closingSuccess && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{closingSuccess}</span>
                  </div>
                )}
                {closingError && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{closingError}</span>
                  </div>
                )}

                {/* Récapitulatif théorique */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Recettes Ventes brutes :</span>
                    <strong className="text-white font-mono">{totalSalesAmount.toLocaleString('fr-FR')} FCFA</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Dépenses autorisées :</span>
                    <strong className="text-rose-400 font-mono">- {approvedExpensesAmount.toLocaleString('fr-FR')} FCFA</strong>
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm">
                    <span className="text-slate-200">Solde Théorique Attendu :</span>
                    <span className="text-emerald-400 font-mono">{theoreticalBalance.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                </div>

                {/* Champ Saisie physique */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    Espèces physiques comptées (FCFA) * :
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={physicalCashInput}
                    onChange={(e) => setPhysicalCashInput(e.target.value)}
                    placeholder="Ex: 75000"
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-base font-bold text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none font-mono"
                  />
                </div>

                {/* Calcul Écart en direct */}
                {physicalCashInput !== '' && (
                  <div
                    className={`rounded-xl border p-3.5 text-xs flex items-center justify-between ${
                      cashDifference === 0
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : cashDifference > 0
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        {cashDifference === 0
                          ? 'Caisse parfaite (Aucun écart)'
                          : cashDifference > 0
                          ? 'Excédent de caisse détecté'
                          : 'Déficit de caisse constaté'}
                      </span>
                    </div>
                    <strong className="font-mono text-sm">
                      {cashDifference > 0 ? '+' : ''}
                      {cashDifference.toLocaleString('fr-FR')} FCFA
                    </strong>
                  </div>
                )}

                {/* Observations */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 block">
                    Observations / Justificatif éventuel :
                  </label>
                  <textarea
                    rows={2}
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    placeholder="Préciser tout détail pertinent sur la journée..."
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                  />
                </div>

                {/* Bouton de validation */}
                <button
                  onClick={handleExecuteClosing}
                  disabled={isSubmittingClosing}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-950/50 disabled:opacity-50"
                >
                  {isSubmittingClosing ? 'Enregistrement de la clôture...' : 'Valider la Clôture Définitive'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'HISTORY' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Journal des Clôtures de Caisse ({dailyClosings.length})
              </h4>

              {dailyClosings.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs">
                  Aucune clôture enregistrée pour le moment.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Tickets</th>
                        <th className="p-3">Ventes</th>
                        <th className="p-3">Dépenses</th>
                        <th className="p-3">Théorique</th>
                        <th className="p-3">Espèces</th>
                        <th className="p-3">Écart</th>
                        <th className="p-3">Clôturé par</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {dailyClosings.map((c) => {
                        const diff = c.difference ?? c.discrepancy ?? 0;
                        const cDate = c.date || c.closingDate;
                        const tCount = c.ticketCount ?? 0;
                        const sTotal = c.totalSales ?? c.cashSalesAmount ?? 0;
                        const eTotal = c.totalExpenses ?? c.expensesAmount ?? 0;
                        const expBal = c.expectedBalance ?? 0;
                        const declCash = c.declaredCash ?? c.declaredBalance ?? 0;
                        const closedBy = c.closedByName || c.confirmedByName || c.cashierName || 'Caissier';

                        return (
                          <tr key={c.id} className="hover:bg-slate-800/30">
                            <td className="p-3 font-mono font-bold text-white">{cDate}</td>
                            <td className="p-3 text-slate-300">{tCount}</td>
                            <td className="p-3 font-mono text-emerald-400">{sTotal.toLocaleString('fr-FR')}</td>
                            <td className="p-3 font-mono text-rose-400">{eTotal.toLocaleString('fr-FR')}</td>
                            <td className="p-3 font-mono text-slate-200">{expBal.toLocaleString('fr-FR')}</td>
                            <td className="p-3 font-mono font-bold text-white">{declCash.toLocaleString('fr-FR')}</td>
                            <td className="p-3 font-mono font-bold">
                              <span
                                className={
                                  diff === 0
                                    ? 'text-emerald-400'
                                    : diff > 0
                                    ? 'text-blue-400'
                                    : 'text-rose-400'
                                }
                              >
                                {diff > 0 ? '+' : ''}
                                {diff.toLocaleString('fr-FR')}
                              </span>
                            </td>
                            <td className="p-3 text-slate-400">{closedBy}</td>
                          </tr>
                        );
                      })}
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
            Clôtures certifiées et enregistrées dans l'Audit Trail PORTUS
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
