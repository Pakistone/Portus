import React, { useState, useEffect } from 'react';
import {
  X,
  ShoppingCart,
  AlertTriangle,
  MapPin,
  Phone,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import {
  formatFCFA,
  normalizePlate,
  normalizePhone,
  formatPlateDisplay,
  formatDateTime,
} from '../../utils/normalization';
import type { Ticket, Sale } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultTicketId?: string;
  onSaleCompleted?: (sale: Sale) => void;
}

export const SaleFormModal: React.FC<Props> = ({
  isOpen,
  onClose,
  defaultTicketId,
  onSaleCompleted,
}) => {
  const { currentUser } = useAuth();
  const {
    tickets,
    sellTicket,
    checkDuplicatePlate,
    getRecentPlates,
    isOnline,
  } = useData();

  const [selectedTicketId, setSelectedTicketId] = useState(defaultTicketId || '');
  const [plateInput, setPlateInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // État de confirmation spéciale : Doublon actif < 7 jours
  const [duplicateWarning, setDuplicateWarning] = useState<{
    oldTicket: Ticket;
    daysRemaining: number;
  } | null>(null);

  // Vente réussie
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Tickets attribués à l'agent connecté et disponibles à la vente
  const availableTickets = tickets.filter(
    (t) => t.assignedAgentId === currentUser?.id && t.status === 'ASSIGNED_TO_AGENT'
  );

  useEffect(() => {
    if (defaultTicketId) {
      setSelectedTicketId(defaultTicketId);
    } else if (availableTickets.length > 0 && !selectedTicketId) {
      setSelectedTicketId(availableTickets[0].id);
    }
  }, [defaultTicketId, availableTickets, selectedTicketId]);

  if (!isOpen) return null;

  const recentPlates = getRecentPlates();
  const liveDuplicateCheck = plateInput.trim().length >= 3 ? checkDuplicatePlate(plateInput) : null;

  const handlePrevalidate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPlate = normalizePlate(plateInput);
    if (!cleanPlate) {
      setError('L’immatriculation est obligatoire.');
      return;
    }

    if (!selectedTicketId) {
      setError('Veuillez sélectionner un ticket disponible dans votre lot.');
      return;
    }

    // RÈGLE MÉTIER CRITIQUE : Vérifier si l'immatriculation possède un ticket actif vendu depuis < 7 jours
    const check = checkDuplicatePlate(cleanPlate);
    if (check.hasActiveTicket && check.activeTicket) {
      setDuplicateWarning({
        oldTicket: check.activeTicket,
        daysRemaining: check.daysRemaining,
      });
      return; // Suspend pour confirmation explicite obligatoire
    }

    // Pas de doublon récent : exécuter directement
    executeSale();
  };

  const executeSale = async (overrideOldTicketId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const sale = await sellTicket({
        ticketId: selectedTicketId,
        plateNumber: plateInput,
        driverPhone: phoneInput || undefined,
        overrideOldTicketId,
      });

      setCompletedSale(sale);
      setDuplicateWarning(null);
      if (onSaleCompleted) {
        onSaleCompleted(sale);
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’enregistrement de la vente.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setPlateInput('');
    setPhoneInput('');
    setDuplicateWarning(null);
    setCompletedSale(null);
    onClose();
  };

  const handleSelectRecentPlate = (p: string) => {
    setPlateInput(p);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-lg my-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 pb-28 sm:pb-32 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col overflow-y-auto">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Vente de Ticket sur le Terrain</h3>
              <p className="text-[11px] text-slate-400">
                Tarif fixe réglementaire : <strong className="text-white">{formatFCFA(TICKET_PRICE_FCFA)}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ÉCRAN DE CONFIRMATION : TICKET DÉJÀ VENDU DEPUIS MOINS DE 7 JOURS         */}
        {/* ========================================================================= */}
        {duplicateWarning ? (
          <div className="my-auto space-y-4 py-3">
            <div className="rounded-2xl border border-amber-500/50 bg-amber-500/15 p-4 space-y-3">
              <div className="flex items-start gap-2.5 text-amber-300 font-black text-sm">
                <AlertTriangle className="w-6 h-6 shrink-0 text-amber-400 mt-0.5 animate-pulse" />
                <span className="text-base tracking-wide">
                  ⚠️ CETTE IMMATRICULATION POSSÈDE DÉJÀ UN TICKET ACTIF RÉCENT.
                </span>
              </div>
              <div className="rounded-xl bg-slate-950/80 p-3.5 text-xs text-slate-200 space-y-2 border border-amber-500/30">
                <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                  <span className="text-slate-400">Immatriculation :</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatPlateDisplay(plateInput)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                  <span className="text-slate-400">Date de l'ancien ticket :</span>
                  <span className="font-mono font-bold text-amber-300">
                    {formatDateTime(duplicateWarning.oldTicket.soldAt)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                  <span className="text-slate-400">Numéro ancien ticket :</span>
                  <span className="font-mono font-bold text-white">
                    {duplicateWarning.oldTicket.ticketNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Validité restante :</span>
                  <span className="font-bold text-amber-400">
                    {duplicateWarning.daysRemaining} jour(s) restant(s)
                  </span>
                </div>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
                La vente doit continuer si vous confirmez. Si vous confirmez, <strong>l'ancien ticket deviendra immédiatement inactif</strong> et le nouveau ticket prendra le relais.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="flex-1 rounded-xl bg-slate-800 py-3.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => executeSale(duplicateWarning.oldTicket.id)}
                className="flex-1 rounded-xl bg-amber-600 py-3.5 text-xs font-black text-white hover:bg-amber-500 transition shadow-lg shadow-amber-950 disabled:opacity-50"
              >
                {loading ? 'Validation en cours...' : 'Confirmer et continuer la vente'}
              </button>
            </div>
          </div>
        ) : completedSale ? (
          /* ========================================================================= */
          /* ÉCRAN DE SUCCÈS VENTE                                                     */
          /* ========================================================================= */
          <div className="my-auto space-y-4 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-2">
                {completedSale.syncStatus === 'SYNCED' ? (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full">
                    🟢 VENTE SYNCHRONISÉE
                  </span>
                ) : (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full">
                    🟠 VENTE ENREGISTRÉE — SYNCHRONISATION EN ATTENTE
                  </span>
                )}
              </div>

              <h4 className="text-xl font-black text-white">{completedSale.ticketNumber}</h4>
              <p className="text-sm font-bold text-emerald-400 mt-1">
                Véhicule : {formatPlateDisplay(completedSale.plateNumber)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs text-slate-300 text-left space-y-2 font-mono">
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-1">
                <span className="text-slate-500 font-sans">Identifiant Vente (UUID) :</span>
                <span className="font-mono text-[11px] text-slate-300 truncate max-w-[200px]" title={completedSale.id}>
                  {completedSale.id}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-1">
                <span className="text-slate-500 font-sans">Montant :</span>
                <span className="font-bold text-white font-sans">{formatFCFA(completedSale.price)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-1">
                <span className="text-slate-500 font-sans">Date originale (immuable) :</span>
                <span className="text-emerald-300">{formatDateTime(completedSale.soldAt)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-1">
                <span className="text-slate-500 font-sans">Localisation GPS terrain :</span>
                <span className={completedSale.gpsStatus === 'AVAILABLE' ? 'text-emerald-400' : 'text-amber-400'}>
                  {completedSale.gpsStatus === 'AVAILABLE'
                    ? `${completedSale.gpsLatitude?.toFixed(5)}, ${completedSale.gpsLongitude?.toFixed(5)} (±${completedSale.gpsAccuracy}m)`
                    : 'GPS_UNAVAILABLE (Non bloquant)'}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-1">
                <span className="text-slate-500 font-sans">État synchronisation :</span>
                <span className={completedSale.syncStatus === 'SYNCED' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {completedSale.syncStatus === 'SYNCED' ? '🟢 SYNCED' : '🟠 PENDING_SYNC (IndexedDB)'}
                </span>
              </div>
              {completedSale.driverPhone && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans">Téléphone Chauffeur :</span>
                  <span className="text-white">{completedSale.driverPhone}</span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-500 shadow-md transition"
              >
                Terminer / Vente suivante
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* FORMULAIRE DE VENTE STANDARD                                              */
          /* ========================================================================= */
          <form onSubmit={handlePrevalidate} className="mt-4 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Choix du ticket dans le lot de l'agent */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ticket attribué à utiliser ({availableTickets.length} en stock)
                </label>
                {availableTickets.length === 0 ? (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    Vous n'avez aucun ticket disponible. Veuillez demander un carnet ou des tickets à votre responsable.
                  </div>
                ) : (
                  <select
                    required
                    value={selectedTicketId}
                    onChange={(e) => setSelectedTicketId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm font-mono text-white focus:border-emerald-500 focus:outline-hidden"
                  >
                    {availableTickets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.ticketNumber} ({t.carnetNumber})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Saisie obligatoire : Plaque d'immatriculation */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Plaque d’immatriculation <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Normalisation auto (ex: AB1234CD)
                  </span>
                </div>
                <input
                  id="input-sale-plate"
                  type="text"
                  required
                  autoFocus
                  value={plateInput}
                  onChange={(e) => setPlateInput(normalizePlate(e.target.value))}
                  placeholder="ex: AB1234CD"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 px-3 text-base font-mono font-bold tracking-wider text-white uppercase focus:border-emerald-500 focus:outline-hidden"
                />

                {/* Avertissement immédiat en cours de saisie si ticket actif < 7 jours */}
                {liveDuplicateCheck?.hasActiveTicket && liveDuplicateCheck.activeTicket && (
                  <div className="mt-2.5 rounded-xl border border-amber-500/50 bg-amber-500/15 p-3 text-xs text-amber-200 space-y-1 animate-fadeIn">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>⚠️ CETTE IMMATRICULATION POSSÈDE DÉJÀ UN TICKET ACTIF RÉCENT.</span>
                    </div>
                    <p className="text-[11px] text-amber-200/90 pl-5">
                      Ancien ticket n° <strong>{liveDuplicateCheck.activeTicket.ticketNumber}</strong> vendu le{' '}
                      <strong>{formatDateTime(liveDuplicateCheck.activeTicket.soldAt)}</strong>. Une confirmation explicite sera exigée lors de la validation.
                    </p>
                  </div>
                )}

                {/* Suggestions d'immatriculations récentes */}
                {recentPlates.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" /> Récents :
                    </span>
                    {recentPlates.map((rp) => (
                      <button
                        key={rp}
                        type="button"
                        onClick={() => handleSelectRecentPlate(rp)}
                        className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[11px] font-mono text-slate-300 hover:border-emerald-500 hover:text-white"
                      >
                        {formatPlateDisplay(rp)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Téléphone facultatif du chauffeur */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Téléphone du Chauffeur (Facultatif)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(normalizePhone(e.target.value))}
                    placeholder="Chiffres uniquement (ex: 0701020304)"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-9 pr-3 text-sm font-mono text-white focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Indicateurs automatiques terrain */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center gap-2 text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>GPS automatique lors de la validation (ne bloque pas si absent)</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    Date originale conservée même en mode hors ligne ({isOnline ? 'En ligne' : 'Hors connexion'})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="flex-1 rounded-xl bg-slate-800 py-3 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading || availableTickets.length === 0 || !plateInput.trim()}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-950 disabled:opacity-50"
              >
                {loading ? 'Validation...' : `Encaisser ${formatFCFA(TICKET_PRICE_FCFA)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
