import React, { useState } from 'react';
import {
  Search,
  Wifi,
  WifiOff,
  CloudUpload,
  Bell,
  Zap,
  User as UserIcon,
  ChevronRight,
  Building2,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { ORG_INFO } from '../../config/constants';
import type { Role } from '../../types';

interface AppHeaderProps {
  currentModuleName?: string;
  onOpenSearch?: () => void;
  onOpenAudit?: () => void;
  onOpenUsers?: () => void;
  onOpenSupabase?: () => void;
  onOpenNotifications?: () => void;
  onTriggerSOS?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentModuleName = 'Tableau de Bord',
  onOpenSearch,
  onOpenAudit,
  onOpenUsers,
  onOpenSupabase,
  onOpenNotifications,
  onTriggerSOS,
}) => {
  const { currentUser } = useAuth();
  const { isOnline, notifications, syncAllToSupabase } = useData();
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  if (!currentUser) return null;

  const role = currentUser.role;

  const myNotifications = notifications.filter((n) => {
    if (!currentUser) return false;
    if (n.recipientId && n.recipientId !== currentUser.id) {
      if (n.type === 'FRAUD_ALERT' && (role === 'ADMINISTRATEUR' || role === 'RESPONSABLE')) return true;
      return false;
    }
    return true;
  });

  const unreadCount = myNotifications.filter((n) => !n.isRead).length;

  const handleSyncCloud = async () => {
    if (syncingCloud) return;
    setSyncingCloud(true);
    const res = await syncAllToSupabase();
    setSyncingCloud(false);
    setSyncMessage(res.message);
    setTimeout(() => setSyncMessage(null), 5000);
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-white/10 select-none">
      {/* Ruban tricolore officiel Côte d'Ivoire */}
      <div className="h-1 w-full bg-linear-to-r from-orange-500 via-white to-emerald-600" />

      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2 sm:px-6 gap-3">
        {/* ZONE 1 : FIL D'ARIANE DYNAMIQUE & IDENTITÉ */}
        <div className="flex items-center gap-2 text-xs text-slate-400 overflow-hidden">
          <div className="flex items-center gap-1.5 font-bold text-white shrink-0">
            <span className="text-orange-400">{ORG_INFO.NAME}</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <span className="hidden sm:inline-block font-medium text-slate-300 truncate">
            {currentUser.sectorName || "Zone Portuaire Abidjan"}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600 hidden sm:inline-block shrink-0" />
          <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 truncate">
            {currentModuleName}
          </span>
        </div>

        {/* ZONE 2 : RECHERCHE RAPIDE, STATUT PWA & SYNCHRO CLOUD */}
        <div className="flex items-center gap-2 shrink-0">
          {/* BARRE DE RECHERCHE RAPIDE */}
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800/80 border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-500/50 hover:bg-slate-800 transition cursor-pointer shadow-xs"
              title="Recherches multicritères et filtres"
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Recherche...</span>
            </button>
          )}

          {/* INDICATEUR DE CONNECTIVITÉ PWA */}
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}
            title={isOnline ? 'Connecté à Internet & Supabase' : 'Mode Hors-Ligne Actif'}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 animate-pulse" />}
            <span className="hidden sm:inline">{isOnline ? 'En ligne' : 'Hors-ligne'}</span>
          </div>

          {/* BOUTON SYNCHRO SUPABASE CLOUD (ADMIN & RESPONSABLE) */}
          {(role === 'ADMINISTRATEUR' || role === 'RESPONSABLE') && (
            <button
              onClick={handleSyncCloud}
              disabled={syncingCloud}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900/80 transition cursor-pointer disabled:opacity-50 shadow-xs"
              title="Synchroniser vers Supabase PostgreSQL Cloud"
            >
              <CloudUpload className={`w-3.5 h-3.5 text-emerald-400 ${syncingCloud ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{syncingCloud ? 'Synchro...' : 'Synchro Cloud'}</span>
            </button>
          )}
        </div>

        {/* ZONE 3 : NOTIFICATIONS, DÉCLENCHEUR SOS & PROFIL */}
        <div className="flex items-center gap-2 shrink-0">
          {/* CLOCHE NOTIFICATIONS */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
            title="Notifications & alertes"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white animate-bounce shadow-md">
                {unreadCount}
              </span>
            )}
          </button>

          {/* DÉCLENCHEUR SOS RAPIDE TOPBAR */}
          <button
            onClick={onTriggerSOS}
            className="flex items-center gap-1 rounded-xl bg-rose-600/20 border border-rose-500/40 px-2.5 py-1.5 text-xs font-black text-rose-300 hover:bg-rose-600/30 transition cursor-pointer shadow-xs"
            title="Déclencher une alerte SOS d'urgence"
          >
            <Zap className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            <span className="hidden sm:inline">SOS</span>
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="bg-emerald-500/15 border-t border-emerald-500/30 px-4 py-1.5 text-[11px] font-bold text-emerald-300 flex items-center gap-2 justify-center animate-fadeIn">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{syncMessage}</span>
        </div>
      )}
    </header>
  );
};
