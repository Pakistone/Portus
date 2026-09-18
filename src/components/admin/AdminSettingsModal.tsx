import React, { useState } from 'react';
import { X, Settings, DollarSign, KeyRound, Check, AlertCircle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { formatFCFA } from '../../utils/normalization';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminSettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { ticketPrice, updateTicketPrice, resetUserPassword } = useData();
  const { currentUser } = useAuth();

  const [priceInput, setPriceInput] = useState(String(ticketPrice));
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePriceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const num = Number(priceInput);
    if (isNaN(num) || num <= 0) {
      setError('Veuillez saisir un prix valide supérieur à zéro.');
      return;
    }
    setLoading(true);
    try {
      await updateTicketPrice(num);
      setSuccess(`Prix unitaire du ticket mis à jour avec succès : ${formatFCFA(num)}`);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la mise à jour du prix.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!newAdminPassword || newAdminPassword.length < 4) {
      setError('Le mot de passe doit contenir au moins 4 caractères.');
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!currentUser) return;

    setLoading(true);
    try {
      await resetUserPassword(currentUser.id, newAdminPassword);
      setSuccess('Mot de passe administrateur réinitialisé avec succès !');
      setNewAdminPassword('');
      setConfirmAdminPassword('');
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la réinitialisation du mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Paramètres Système & Sécurité Admin</h3>
              <p className="text-[11px] text-slate-400">
                Configuration du tarif et réinitialisation des accès
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        <div className="mt-4 space-y-6">
          {/* Section 1 : Prix du Ticket */}
          <form onSubmit={handlePriceSubmit} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Tarif Unitaire du Ticket
              </h4>
            </div>
            <p className="text-[11px] text-slate-400">
              Modifiez le prix officiel appliqué lors de l'enregistrement des ventes de tickets.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Prix unitaire (FCFA)
              </label>
              <input
                type="number"
                min="100"
                step="100"
                required
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm font-bold font-mono text-white focus:border-emerald-500 focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Enregistrement...' : 'Mettre à jour le Tarif'}
            </button>
          </form>

          {/* Section 2 : Réinitialisation Mot de Passe Admin */}
          <form onSubmit={handlePasswordResetSubmit} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <KeyRound className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Réinitialisation Mot de Passe Administrateur
              </h4>
            </div>
            <p className="text-[11px] text-slate-400">
              Définissez un nouveau mot de passe sécurisé pour votre compte administrateur ({currentUser?.username}).
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                required
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="Nouveau mot de passe"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                required
                value={confirmAdminPassword}
                onChange={(e) => setConfirmAdminPassword(e.target.value)}
                placeholder="Confirmer le nouveau mot de passe"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Réinitialisation...' : 'Réinitialiser le Mot de Passe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
