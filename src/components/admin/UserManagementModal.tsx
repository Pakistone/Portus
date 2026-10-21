import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  UserPlus,
  KeyRound,
  Check,
  Shield,
  Power,
  Edit3,
  AlertTriangle,
  RotateCcw,
  Clock,
  UserCheck,
  Camera,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { DEFAULT_SECTORS } from '../../config/constants';
import { compressAvatarImage } from '../../utils/imageCompression';
import type { Role, User } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const UserManagementModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    users,
    tickets,
    carnets,
    createUser,
    updateUser,
    toggleUserActive,
    resetUserPassword,
    refreshData,
  } = useData();

  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE'>('LIST');

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen, refreshData]);

  // Formulaire création
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('AGENT');
  const [sectorId, setSectorId] = useState(DEFAULT_SECTORS[0].id);
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [passwordRaw, setPasswordRaw] = useState('');
  const createFileInputRef = useRef<HTMLInputElement | null>(null);

  // Modification utilisateur
  const [editTargetUser, setEditTargetUser] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<Role>('AGENT');
  const [editSectorId, setEditSectorId] = useState(DEFAULT_SECTORS[0].id);
  const [editAvatarUrl, setEditAvatarUrl] = useState<string>('');
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

  // Réinitialisation mot de passe
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [newPasswordRaw, setNewPasswordRaw] = useState('');

  // Confirmation désactivation
  const [deactivateTargetUser, setDeactivateTargetUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(false);
  const [compressingPhoto, setCompressingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handlePhotoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'CREATE' | 'EDIT'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressingPhoto(true);
    setError(null);
    try {
      const compressedDataUrl = await compressAvatarImage(file, 320, 0.8);
      if (mode === 'CREATE') {
        setAvatarUrl(compressedDataUrl);
      } else {
        setEditAvatarUrl(compressedDataUrl);
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la compression de la photo.');
    } finally {
      setCompressingPhoto(false);
      e.target.value = '';
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!username.trim() || !fullName.trim() || !passwordRaw) {
      setError('Tous les champs obligatoires doivent être renseignés.');
      return;
    }

    if (passwordRaw.length < 6) {
      setError('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }

    setLoading(true);
    try {
      // RÈGLE MÉTIER CRITIQUE : Le mot de passe est transmis BRUT sans aucune normalisation
      // Les agents font partie du Pool Global Mobile U.J.P.A.S. (pas de secteur fixe obligatoire)
      await createUser({
        username: username.trim(),
        fullName: fullName.trim(),
        role,
        sectorId: role === 'RESPONSABLE' ? sectorId : undefined,
        phone: phone.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
        passwordRaw,
      });

      setSuccessMessage(`Utilisateur "${username}" créé avec succès.`);
      setUsername('');
      setFullName('');
      setPasswordRaw('');
      setPhone('');
      setAvatarUrl('');
      setActiveTab('LIST');
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la création du compte.');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (u: User) => {
    setEditTargetUser(u);
    setEditFullName(u.fullName);
    setEditPhone(u.phone || '');
    setEditRole(u.role);
    setEditSectorId(u.sectorId || DEFAULT_SECTORS[0].id);
    setEditAvatarUrl(u.avatarUrl || '');
    setError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetUser) return;

    if (!editFullName.trim()) {
      setError('Le nom complet est obligatoire.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await updateUser(editTargetUser.id, {
        fullName: editFullName.trim(),
        phone: editPhone.trim() || undefined,
        role: editRole,
        sectorId: editRole === 'RESPONSABLE' ? editSectorId : undefined,
        avatarUrl: editAvatarUrl,
      });
      setSuccessMessage(`Informations mises à jour pour "${editFullName}"`);
      setEditTargetUser(null);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la mise à jour.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser || !newPasswordRaw) return;

    if (newPasswordRaw.length < 6) {
      setError('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await resetUserPassword(resetTargetUser.id, newPasswordRaw);
      setSuccessMessage(
        `Mot de passe réinitialisé pour ${resetTargetUser.fullName}. Le compte est débloqué.`
      );
      setResetTargetUser(null);
      setNewPasswordRaw('');
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la réinitialisation.');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (u: User) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await toggleUserActive(u.id);
      setSuccessMessage(`Compte "${u.fullName}" réactivé avec succès.`);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la réactivation.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeactivation = async () => {
    if (!deactivateTargetUser) return;
    setLoading(true);
    setError(null);
    try {
      await toggleUserActive(deactivateTargetUser.id);
      if (deactivateTargetUser.role === 'AGENT') {
        setSuccessMessage(
          `Agent ${deactivateTargetUser.fullName} désactivé. Ses tickets non vendus ont été automatiquement retournés à son superviseur. Ventes et audits préservés.`
        );
      } else if (deactivateTargetUser.role === 'RESPONSABLE') {
        setSuccessMessage(
          `Responsable ${deactivateTargetUser.fullName} désactivé. Ses tickets non vendus et carnets ont été transférés à l’administrateur. Historique conservé.`
        );
      } else {
        setSuccessMessage(`Compte ${deactivateTargetUser.fullName} désactivé.`);
      }
      setDeactivateTargetUser(null);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la désactivation.');
    } finally {
      setLoading(false);
    }
  };

  const roleBadge = (r: Role) => {
    switch (r) {
      case 'ADMINISTRATEUR':
        return (
          <span className="rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold">
            ADMINISTRATEUR
          </span>
        );
      case 'RESPONSABLE':
        return (
          <span className="rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold">
            RESPONSABLE
          </span>
        );
      case 'AGENT':
        return (
          <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">
            AGENT MOBILE
          </span>
        );
      case 'CONTROLEUR':
        return (
          <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold">
            CONTRÔLEUR
          </span>
        );
    }
  };

  const getDeactivationDetails = (u: User) => {
    if (u.role === 'AGENT') {
      const unsold = tickets.filter(
        (t) =>
          (t.assignedAgentId === u.id || (t as any).assignedAgent === u.id) &&
          t.status !== 'SOLD' &&
          t.status !== 'CANCELLED'
      ).length;
      return { unsoldTickets: unsold, carnets: 0 };
    }
    if (u.role === 'RESPONSABLE') {
      const unsold = tickets.filter(
        (t) =>
          (t.assignedResponsableId === u.id || (t as any).assignedResponsable === u.id) &&
          t.status !== 'SOLD' &&
          t.status !== 'CANCELLED'
      ).length;
      const respCarnets = carnets.filter((c) => c.assignedToResponsableId === u.id).length;
      return { unsoldTickets: unsold, carnets: respCarnets };
    }
    return { unsoldTickets: 0, carnets: 0 };
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deactivateTargetUser) {
          setDeactivateTargetUser(null);
        } else if (resetTargetUser) {
          setResetTargetUser(null);
        } else if (editTargetUser) {
          setEditTargetUser(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, deactivateTargetUser, resetTargetUser, editTargetUser, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-white">
                Gestion des Comptes, Photos &amp; Accès U.J.P.A.S.
              </h3>
              <p className="text-[11px] text-slate-400">
                Droits exclusifs Administrateur : comptes, photos trombinoscope et pool global d’agents mobiles
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Onglets */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setActiveTab('LIST')}
            className={`py-1.5 px-3 text-xs font-bold rounded-lg transition cursor-pointer ${
              activeTab === 'LIST'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Liste des Utilisateurs ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('CREATE')}
            className={`py-1.5 px-3 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'CREATE'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Nouveau Compte / Agent</span>
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Contenu de l'onglet actif */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-2">
          {activeTab === 'LIST' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3">Agent / Membre</th>
                    <th className="py-2.5 px-3">Identifiant</th>
                    <th className="py-2.5 px-3">Rôle</th>
                    <th className="py-2.5 px-3">Affectation</th>
                    <th className="py-2.5 px-3">Téléphone</th>
                    <th className="py-2.5 px-3">Statut</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((u) => {
                    const isLocked =
                      u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now();
                    const initials = u.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <tr key={u.id} className="hover:bg-slate-900/60 transition">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            {u.avatarUrl ? (
                              <img
                                src={u.avatarUrl}
                                alt={u.fullName}
                                className="w-8 h-8 rounded-full object-cover border border-emerald-500/40 shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-black text-emerald-400 shrink-0">
                                {initials || <UserIcon className="w-3.5 h-3.5" />}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-white">{u.fullName}</div>
                              {u.avatarUrl && (
                                <span className="text-[9px] text-emerald-400 font-semibold">
                                  📸 Photo certifiée
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                          {u.username}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">{roleBadge(u.role)}</td>
                        <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                          {u.role === 'AGENT' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                              Pool Mobile Global
                            </span>
                          ) : (
                            u.sectorName || 'Tous secteurs'
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                          {u.phone || '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                              Verrouillé (15 min)
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                u.isActive
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {u.isActive ? 'Actif' : 'Désactivé'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(u)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition cursor-pointer"
                              title="Modifier profil & photo"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setResetTargetUser(u);
                                setNewPasswordRaw('');
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                              title="Réinitialiser le mot de passe"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            {u.isActive ? (
                              <button
                                onClick={() => setDeactivateTargetUser(u)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                                title="Désactiver le compte"
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivate(u)}
                                disabled={loading}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer disabled:opacity-50"
                                title="Réactiver le compte"
                              >
                                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Formulaire de création */
            <form onSubmit={handleCreateSubmit} className="p-4 space-y-4 max-w-lg mx-auto">
              {/* Photo d'identité / Trombinoscope */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 flex items-center gap-4">
                <div className="relative w-16 h-16 rounded-2xl bg-slate-800 border-2 border-emerald-500/40 flex items-center justify-center overflow-hidden shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Aperçu photo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera className="w-6 h-6 text-slate-500" />
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="text-xs font-bold text-white">
                    Photo Officielle (Trombinoscope &amp; Badge U.J.P.A.S.)
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Visible par les contrôleurs lors du scan QR et par les superviseurs pour l'identification terrain.
                  </p>
                  <div className="flex items-center gap-2 pt-0.5">
                    <input
                      ref={createFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoFileChange(e, 'CREATE')}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => createFileInputRef.current?.click()}
                      disabled={compressingPhoto}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-600/30 transition cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{compressingPhoto ? 'Compression...' : avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}</span>
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 border border-rose-500/30 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/25 transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Retirer</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nom d’utilisateur <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ex: agent_kone"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Sans espaces, minuscules recommandées.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nom complet &amp; Prénoms <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="ex: KONÉ IBRAHIM"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Rôle hiérarchique <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
                  >
                    <option value="AGENT">AGENT DE TERRAIN (Pool Mobile)</option>
                    <option value="RESPONSABLE">RESPONSABLE / SUPERVISEUR</option>
                    <option value="CONTROLEUR">CONTRÔLEUR ROUTIER</option>
                    <option value="ADMINISTRATEUR">ADMINISTRATEUR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Secteur de rattachement
                  </label>
                  {role === 'RESPONSABLE' ? (
                    <select
                      value={sectorId}
                      onChange={(e) => setSectorId(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
                    >
                      {DEFAULT_SECTORS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 px-3 text-xs text-emerald-400 font-semibold">
                      {role === 'AGENT'
                        ? 'Pool Mobile Global (Tous secteurs)'
                        : 'Zone Portuaire & Industrielle (Global)'}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Téléphone (Recommandé)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0701020304"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mot de passe initial <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={passwordRaw}
                    onChange={(e) => setPasswordRaw(e.target.value)}
                    placeholder="Min. 6 caractères"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-400 space-y-1">
                <p className="font-semibold text-slate-300">Règles de gouvernance U.J.P.A.S. :</p>
                <p>• Les agents de terrain appartiennent au Pool Mobile Global et peuvent recevoir des tickets de tout Responsable ou de l'Administrateur.</p>
                <p>• La photo de l'agent est compressée hors-ligne (320×320 JPEG) pour un affichage instantané lors des contrôles QR.</p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || compressingPhoto}
                  className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Création en cours...' : 'Créer le Compte Utilisateur'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* MODAL MODIFIER INFORMATIONS AUTORISÉES */}
        {editTargetUser && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl">
              <h4 className="text-base font-bold text-white mb-1">
                Modifier le profil : {editTargetUser.username}
              </h4>
              <p className="text-xs text-slate-400 mb-4">
                Mise à jour d'identité, photo trombinoscope et rôle.
              </p>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                {/* Photo dans l'édition */}
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-emerald-500/40 flex items-center justify-center overflow-hidden shrink-0">
                    {editAvatarUrl ? (
                      <img
                        src={editAvatarUrl}
                        alt={editFullName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Camera className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="text-xs font-bold text-white block">
                      Photo d'identification officielle
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoFileChange(e, 'EDIT')}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        disabled={compressingPhoto}
                        className="rounded-lg bg-blue-600/20 border border-blue-500/40 px-2.5 py-1 text-[11px] font-bold text-blue-300 hover:bg-blue-600/30 transition cursor-pointer"
                      >
                        {compressingPhoto ? 'Compression...' : 'Choisir une photo'}
                      </button>
                      {editAvatarUrl && (
                        <button
                          type="button"
                          onClick={() => setEditAvatarUrl('')}
                          className="rounded-lg bg-rose-500/15 border border-rose-500/30 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/25 transition cursor-pointer"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nom &amp; Prénoms
                  </label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Rôle
                    </label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as Role)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-xs text-white focus:border-blue-500 focus:outline-hidden"
                    >
                      <option value="AGENT">AGENT MOBILE</option>
                      <option value="RESPONSABLE">RESPONSABLE</option>
                      <option value="CONTROLEUR">CONTRÔLEUR</option>
                      <option value="ADMINISTRATEUR">ADMINISTRATEUR</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="0701020304"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {editRole === 'RESPONSABLE' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Secteur de supervision
                    </label>
                    <select
                      value={editSectorId}
                      onChange={(e) => setEditSectorId(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-xs text-white focus:border-blue-500 focus:outline-hidden"
                    >
                      {DEFAULT_SECTORS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-[11px] text-emerald-400">
                    ✓ Pool Mobile Global U.J.P.A.S. (Sans restriction de secteur fixe)
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditTargetUser(null)}
                    className="flex-1 rounded-xl bg-slate-800 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading || compressingPhoto}
                    className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500 transition disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL RÉINITIALISATION MOT DE PASSE */}
        {resetTargetUser && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl">
              <h4 className="text-base font-bold text-white mb-1">
                Réinitialisation Mot de Passe
              </h4>
              <p className="text-xs text-slate-400 mb-3">
                Utilisateur : <span className="text-white font-bold">{resetTargetUser.fullName}</span> ({resetTargetUser.username})
              </p>
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
                Le mot de passe brut (min. 6 caractères) est stocké sans altération. La réinitialisation débloque automatiquement le compte.
              </div>
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nouveau mot de passe
                  </label>
                  <input
                    type="password"
                    required
                    autoFocus
                    value={newPasswordRaw}
                    onChange={(e) => setNewPasswordRaw(e.target.value)}
                    placeholder="Min. 6 caractères"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setResetTargetUser(null)}
                    className="flex-1 rounded-xl bg-slate-800 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !newPasswordRaw}
                    className="flex-1 rounded-xl bg-amber-600 py-2 text-xs font-bold text-white hover:bg-amber-500 transition disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Mise à jour...' : 'Confirmer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL CONFIRMATION DÉSACTIVATION AVEC RÈGLES MÉTIER */}
        {deactivateTargetUser && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4">
            <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6 text-slate-100 shadow-2xl">
              <div className="flex items-center gap-2 text-rose-400 mb-3">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h4 className="text-base font-bold text-white">
                  Confirmer la désactivation
                </h4>
              </div>

              <p className="text-xs text-slate-300 mb-3">
                Êtes-vous sûr de vouloir désactiver le compte de{' '}
                <span className="font-bold text-white">{deactivateTargetUser.fullName}</span> (
                {deactivateTargetUser.role}) ?
              </p>

              {deactivateTargetUser.role === 'AGENT' && (
                <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 space-y-1.5 leading-relaxed">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-amber-400" />
                    Règle de désactivation d’un AGENT :
                  </p>
                  <p>
                    • Ses <strong>{getDeactivationDetails(deactivateTargetUser).unsoldTickets} ticket(s) non vendu(s)</strong> retourneront automatiquement au stock superviseur.
                  </p>
                  <p>• Ses ventes historiques resteront définitivement liées à cet agent.</p>
                  <p>• Toutes ses données d’audit restent intégralement conservées.</p>
                </div>
              )}

              {deactivateTargetUser.role === 'RESPONSABLE' && (
                <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 space-y-1.5 leading-relaxed">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-amber-400" />
                    Règle de désactivation d’un RESPONSABLE :
                  </p>
                  <p>
                    • Ses <strong>{getDeactivationDetails(deactivateTargetUser).unsoldTickets} ticket(s) non vendu(s)</strong> et ses <strong>{getDeactivationDetails(deactivateTargetUser).carnets} carnet(s)</strong> sont automatiquement transférés à l’administrateur.
                  </p>
                  <p>• L’historique des remises, ventes et audits reste intégralement conservé.</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeactivateTargetUser(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeactivation}
                  disabled={loading}
                  className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-500 transition disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Désactivation...' : 'Désactiver le compte'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
