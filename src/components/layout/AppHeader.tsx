import React, { useState } from 'react';
import {
  Bell,
  Search,
  Wifi,
  WifiOff,
  ShieldAlert,
  LogOut,
  KeyRound,
  CloudUpload,
  User,
  ChevronDown,
  LayoutGrid,
  Menu,
  X,
  Database,
  Building2,
  Truck,
  History,
  Shield,
  Printer,
  Users,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { ChangePasswordModal } from '../common/ChangePasswordModal';
import { ORG_INFO } from '../../config/constants';
import type { Role } from '../../types';

interface AppHeaderProps {
  currentModuleTitle: string;
  onOpenSearch: () => void;
  onOpenAudit: () => void;
  onOpenUsers: () => void;
  onOpenSupabase: () => void;
  onOpenDailyOps: () => void;
  onOpenSecurityCenter: () => void;
  onOpenVehicles: () => void;
  onOpenTimeline: () => void;
  onOpenBadge: () => void;
  onTriggerSOS: () => void;
  onOpenMobileMenu: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentModuleTitle,
  onOpenSearch,
  onOpenAudit,
  onOpenUsers,
  onOpenSupabase,
  onOpenDailyOps,
  onOpenSecurityCenter,
  onOpenVehicles,
  onOpenTimeline,
  onOpenBadge,
  onTriggerSOS,
  onOpenMobileMenu,
}) => {
  const { currentUser, logout } = useAuth();
  const {
    isOnline,
    notifications,
    syncAllToSupabase,
    isRlsPermissionIssue,
    lastRlsError,
  } = useData();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const roleLabels: Record<Role, string> = {
    ADMINISTRATEUR: 'ADMINISTRATEUR',
    RESPONSABLE: 'RESPONSABLE SECTEUR',
    AGENT: 'AGENT DE TERRAIN',
    CONTROLEUR: 'CONTRÔLEUR ROUTIER',
    CAISSIER: 'CAISSIER',
    FINANCE: 'FINANCE & AUDIT',
    AUDITEUR: 'AUDITEUR INDÉPENDANT',
  };

  const handleManualSync = async () => {
    setSyncingCloud(true);
    try {
      await syncAllToSupabase();
    } finally {
      setSyncingCloud(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-lg">
      {/* Dynamic Warning for PostgreSQL RLS issues */}
      {isRlsPermissionIssue && currentUser?.role === 'ADMINISTRATEUR' && (
        <div className="bg-rose-950/95 border-b border-rose-500/50 px-4 py-1.5 text-xs text-rose-200 flex items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            <span className="truncate">
              <strong>Base PostgreSQL :</strong> Permissions RLS Supabase à mettre à jour ({lastRlsError || 'permission denied'}).
            </span>
          </div>
          <button
            onClick={onOpenSupabase}
            className="px-2.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition shrink-0 cursor-pointer"
          >
            Résoudre RLS
          </button>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6 gap-4">
        {/* Mobile Header Brand & Drawer Toggle */}
        <div className="flex items-center gap-3 lg:hidden">
          <button
            onClick={onOpenMobileMenu}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
            title="Menu de navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img
              src={ORG_INFO.LOGO_PATH}
              alt="UJPAS Logo"
              className="h-8 w-8 rounded-full object-contain bg-slate-950 p-0.5 border border-emerald-500/40"
              referrerPolicy="no-referrer"
            />
            <div>
              <span className="text-xs font-black text-white tracking-tight">PORTUS</span>
              <p className="text-[9px] text-emerald-400 font-bold truncate">U.J.P.A.S. Abidjan</p>
            </div>
          </div>
        </div>

        {/* Desktop Breadcrumbs & Module Title */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <span className="hover:text-slate-200 transition">PORTUS</span>
            <span>/</span>
            <span className="hover:text-slate-200 transition">Zone Portuaire Vridi</span>
            <span>/</span>
            <span className="text-white font-bold text-sm tracking-tight">{currentModuleTitle}</span>
          </div>
        </div>

        {/* Universal Search & Quick Action Center */}
        <div className="flex items-center gap-2.5">
          {/* Quick Search Button */}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 rounded-xl bg-slate-800/80 border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:border-amber-500/40 transition cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Recherche Rapide</span>
          </button>

          {/* Outils Opérationnels Dropdown */}
          <div className="relative">
            <button
              onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800/80 border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 hover:border-emerald-500/40 transition cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="hidden md:inline">Outils</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${toolsDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {toolsDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl z-50 grid grid-cols-1 gap-1 animate-in fade-in-50 zoom-in-95"
                onClick={() => setToolsDropdownOpen(false)}
              >
                <button onClick={onOpenDailyOps} className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                  <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white">Caisse & Clôtures</p>
                    <p className="text-[10px] text-slate-400">Point financier journalier</p>
                  </div>
                </button>

                <button onClick={onOpenVehicles} className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                  <Truck className="w-4 h-4 text-teal-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white">Registre Véhicules</p>
                    <p className="text-[10px] text-slate-400">Poids lourds & Citernes</p>
                  </div>
                </button>

                <button onClick={onOpenTimeline} className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                  <History className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white">Traçabilité Timeline</p>
                    <p className="text-[10px] text-slate-400">Suivi chronologique ticket</p>
                  </div>
                </button>

                <button onClick={onOpenSecurityCenter} className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                  <Shield className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white">Centre de Sécurité</p>
                    <p className="text-[10px] text-slate-400">Surveillance & Verrous</p>
                  </div>
                </button>

                {currentUser?.role === 'ADMINISTRATEUR' && (
                  <>
                    <button onClick={onOpenBadge} className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                      <Printer className="w-4 h-4 text-orange-400 shrink-0" />
                      <div>
                        <p className="font-bold text-white">Badges Pro (85×120)</p>
                        <p className="text-[10px] text-slate-400">Impression cartes avec QR</p>
                      </div>
                    </button>
                    <button onClick={onOpenUsers} className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                      <Users className="w-4 h-4 text-blue-400 shrink-0" />
                      <div>
                        <p className="font-bold text-white">Gestion Utilisateurs</p>
                        <p className="text-[10px] text-slate-400">Comptes & Rôles</p>
                      </div>
                    </button>
                    <button onClick={onOpenAudit} className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                      <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                      <div>
                        <p className="font-bold text-white">Journal d'Audit</p>
                        <p className="text-[10px] text-slate-400">Logs inaltérables</p>
                      </div>
                    </button>
                    <button onClick={onOpenSupabase} className="flex items-center gap-2.5 rounded-xl p-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                      <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <p className="font-bold text-white">Console Supabase</p>
                        <p className="text-[10px] text-slate-400">Schéma SQL & RLS</p>
                      </div>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Sync Button */}
          {currentUser?.role === 'ADMINISTRATEUR' && (
            <button
              onClick={handleManualSync}
              disabled={syncingCloud}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-white/10 px-2.5 py-1.5 text-xs font-bold text-emerald-400 hover:bg-slate-700 transition disabled:opacity-50 cursor-pointer"
              title="Synchroniser avec Supabase"
            >
              <CloudUpload className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
            </button>
          )}

          {/* Network Badge */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-slate-800 border border-white/10 text-slate-300">
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="font-mono text-[10px]">{isOnline ? 'En ligne' : 'Hors ligne'}</span>
          </div>

          <PWAInstallButton />

          {/* Notification Bell */}
          <button
            onClick={onOpenSearch}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 border border-white/10 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* SOS Button */}
          <button
            onClick={onTriggerSOS}
            className="flex h-9 px-3 items-center justify-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-md shadow-rose-950/50 transition cursor-pointer active:scale-95"
            title="DÉCLENCHER ALERTE SOS TERRAIN"
          >
            <ShieldAlert className="w-4 h-4 text-white" />
            <span className="hidden sm:inline">SOS</span>
          </button>

          {/* User Profile Dropdown */}
          {currentUser && (
            <div className="relative border-l border-white/10 pl-2">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 rounded-xl p-1 hover:bg-slate-800 transition cursor-pointer"
              >
                <div className="h-8 w-8 rounded-full bg-slate-800 border border-emerald-500/40 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {currentUser.fullName.charAt(0)}
                </div>
                <div className="hidden lg:block text-left">
                  <p className="text-xs font-bold text-white leading-tight truncate max-w-[120px]">
                    {currentUser.fullName}
                  </p>
                  <p className="text-[9px] text-emerald-400 font-mono leading-none">
                    {roleLabels[currentUser.role]}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
              </button>

              {userDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl z-50 space-y-1 animate-in fade-in-50 zoom-in-95"
                  onClick={() => setUserDropdownOpen(false)}
                >
                  <div className="p-2 border-b border-white/10">
                    <p className="text-xs font-bold text-white">{currentUser.fullName}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">Identifiant: {currentUser.username}</p>
                  </div>

                  <button
                    onClick={() => setChangePasswordOpen(true)}
                    className="w-full flex items-center gap-2 rounded-xl p-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition text-left cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span>Changer mot de passe</span>
                  </button>

                  <button
                    onClick={() => logout()}
                    className="w-full flex items-center gap-2 rounded-xl p-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10 transition text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    <span>Déconnexion</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </header>
  );
};
