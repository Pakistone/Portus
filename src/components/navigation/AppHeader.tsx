import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  ChevronRight,
  CloudUpload,
  LogOut,
  Bell,
  CheckCheck,
  X,
  User as UserIcon,
  KeyRound,
  AlertOctagon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { ORG_INFO } from '../../config/constants';
import { formatDateTime } from '../../utils/normalization';
import type { Role } from '../../types';

interface AppHeaderProps {
  onOpenSearch?: () => void;
  onTriggerSOS: () => void;
  onOpenPasswordModal: () => void;
}

const ROLE_WORKSPACE_LABELS: Record<Role, string> = {
  ADMINISTRATEUR: 'Direction & Administration Générale',
  RESPONSABLE: 'Supervision & Encaissement Terrain',
  AGENT: 'Espace Vente Terrain',
  CONTROLEUR: 'Poste de Contrôle QR & Trombinoscope',
  CAISSIER: 'Caisse',
  FINANCE: 'Finance',
  AUDITEUR: 'Audit',
};

const ROLE_BADGE_STYLES: Record<Role, string> = {
  ADMINISTRATEUR: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  RESPONSABLE: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  AGENT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  CONTROLEUR: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  CAISSIER: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
  FINANCE: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  AUDITEUR: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  onOpenSearch,
  onTriggerSOS,
  onOpenPasswordModal,
}) => {
  const { currentUser, logout } = useAuth();
  const {
    isOnline,
    isSimulatedOffline,
    toggleSimulatedOffline,
    isSyncing,
    pendingSyncCount,
    syncOfflineQueue,
    syncAllToSupabase,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
  } = useData();

  const [syncingCloud, setSyncingCloud] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'ADMINISTRATEUR';
  const isResponsable = currentUser.role === 'RESPONSABLE';
  const canUseGlobalSearch = (isAdmin || isResponsable) && Boolean(onOpenSearch);
  const canUseCloudSync = isAdmin || isResponsable;

  const myNotifications = notifications.filter((n) => {
    if (n.recipientId && n.recipientId !== currentUser.id) {
      if ((n.type === 'FRAUD_ALERT' || n.type === 'FINANCIAL_ALERT') && (isAdmin || isResponsable)) {
        return true;
      }
      return false;
    }
    return true;
  });

  const unreadCount = myNotifications.filter((n) => !n.isRead).length;

  const handleCloudSync = async () => {
    if (syncingCloud || !canUseCloudSync) return;
    setSyncingCloud(true);
    try {
      await syncAllToSupabase();
    } finally {
      setSyncingCloud(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-900/95 backdrop-blur-xl">
      {/* Bandeau tricolore officiel République de Côte d'Ivoire */}
      <div className="h-1 w-full bg-linear-to-r from-orange-500 via-white to-emerald-600" />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-4">
        {/* ZONE 1 : Identité PORTUS U.J.P.A.S. & Espace Rôle */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-full bg-slate-950 p-0.5 border border-emerald-500/50 flex items-center justify-center shadow-md">
            <img
              src={ORG_INFO.LOGO_PATH}
              alt="U.J.P.A.S."
              className="h-full w-full rounded-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs min-w-0">
              <span className="font-black text-white tracking-tight shrink-0">PORTUS</span>
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-300 border border-emerald-500/30 shrink-0">
                U.J.P.A.S.
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 hidden sm:inline shrink-0" />
              <span className="font-bold text-slate-200 truncate hidden sm:inline">
                {ROLE_WORKSPACE_LABELS[currentUser.role]}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate sm:hidden">
              {ROLE_WORKSPACE_LABELS[currentUser.role]}
            </p>
          </div>
        </div>

        {/* ZONE 2 : Recherche (Admin/Responsable uniquement), Connectivité & SOS */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 justify-end">
          {canUseGlobalSearch && (
            <button
              onClick={onOpenSearch}
              className="hidden md:flex items-center justify-between gap-3 max-w-xs w-full rounded-xl bg-slate-950/80 border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-emerald-500/40 transition cursor-pointer"
            >
              <div className="flex items-center gap-2 truncate">
                <Search className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Rechercher plaque, ticket, agent...</span>
              </div>
              <kbd className="rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-mono font-bold text-slate-400 border border-white/10">
                ⌘K
              </kbd>
            </button>
          )}

          {/* Bouton SOS Urgence Terrain */}
          <button
            onClick={onTriggerSOS}
            className="flex items-center gap-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-black px-2.5 py-1.5 text-[11px] shadow-md shadow-rose-950/50 border border-rose-400/30 transition cursor-pointer active:scale-95 shrink-0"
            title="Signaler un Incident / Déclencher Alerte SOS"
          >
            <AlertOctagon className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            <span className="hidden sm:inline">🚨 SOS</span>
          </button>

          {/* Indicateur de connectivité PWA */}
          <button
            onClick={toggleSimulatedOffline}
            title={
              isSimulatedOffline
                ? 'Mode hors-ligne simulé actif — Cliquer pour repasser en ligne'
                : 'Statut réseau terrain'
            }
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold border transition cursor-pointer shrink-0 ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">En ligne</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden lg:inline">Hors-ligne</span>
              </>
            )}
          </button>

          {/* Bouton Synchro File Offline si éléments en attente */}
          {pendingSyncCount > 0 && (
            <button
              onClick={syncOfflineQueue}
              disabled={!isOnline || isSyncing}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 px-2.5 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 transition cursor-pointer shrink-0"
              title="Synchroniser les opérations locales en attente"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{pendingSyncCount}</span>
            </button>
          )}

          {/* Bouton Synchro Supabase Cloud (Uniquement Admin & Responsable) */}
          {canUseCloudSync && (
            <button
              onClick={handleCloudSync}
              disabled={syncingCloud || !isOnline}
              className="hidden sm:flex items-center gap-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 disabled:opacity-50 transition cursor-pointer shrink-0"
              title="Synchroniser avec Supabase Cloud"
            >
              <CloudUpload className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-bounce' : ''}`} />
              <span className="hidden xl:inline">
                {syncingCloud ? 'Synchro...' : 'Sync Cloud'}
              </span>
            </button>
          )}
        </div>

        {/* ZONE 3 : Notifications, Profil Utilisateur & Déconnexion */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative">
          {/* Bouton Notifications */}
          <button
            onClick={() => setNotifOpen((prev) => !prev)}
            className="relative p-2 rounded-xl bg-slate-800/90 border border-white/10 text-slate-300 hover:text-white transition cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-4 h-4 text-amber-400" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-11 w-80 sm:w-96 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl z-50 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Notifications ({unreadCount} non lue{unreadCount > 1 ? 's' : ''})
                </span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllNotificationsAsRead(currentUser.id)}
                      className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Tout lire</span>
                    </button>
                  )}
                  <button
                    onClick={() => setNotifOpen(false)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {myNotifications.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    Aucune notification récente.
                  </p>
                ) : (
                  myNotifications.slice(0, 12).map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.isRead) markNotificationAsRead(n.id);
                        setNotifOpen(false);
                        window.dispatchEvent(
                          new CustomEvent('portus-notification-clicked', { detail: n })
                        );
                      }}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                        n.isRead
                          ? 'border-slate-800 bg-slate-950/60 text-slate-400'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-white font-semibold'
                      }`}
                    >
                      <p className="leading-snug">{n.message}</p>
                      <span className="block mt-1 text-[10px] font-mono text-slate-500">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Carte Profil Utilisateur & Actions Compte */}
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-white/10">
            <div className="hidden md:flex flex-col items-end mr-1">
              <span className="text-xs font-extrabold text-white leading-tight truncate max-w-[140px]">
                {currentUser.fullName}
              </span>
              <span
                className={`inline-block rounded border px-1.5 py-0.2 text-[9px] font-black uppercase ${
                  ROLE_BADGE_STYLES[currentUser.role]
                }`}
              >
                {currentUser.role}
              </span>
            </div>

            <button
              onClick={onOpenPasswordModal}
              className="h-8 w-8 rounded-full overflow-hidden border border-emerald-500/40 bg-slate-800 flex items-center justify-center cursor-pointer shrink-0"
              title={`${currentUser.fullName} (${currentUser.role}) — Changer mon mot de passe`}
            >
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.fullName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserIcon className="w-4 h-4 text-emerald-400" />
              )}
            </button>

            <button
              onClick={onOpenPasswordModal}
              className="hidden sm:flex p-2 rounded-xl bg-slate-800/90 border border-white/10 text-slate-300 hover:text-white transition cursor-pointer"
              title="Modifier mon mot de passe"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            <button
              onClick={() => logout()}
              className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 transition cursor-pointer"
              title="Déconnexion sécurisée"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
