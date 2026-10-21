import React, { useState } from 'react';
import {
  ShieldAlert,
  LogOut,
  Users,
  Wifi,
  WifiOff,
  Database,
  Menu,
  X,
  FileText,
  Bell,
  CheckCheck,
  Search,
  Stamp,
  Building2,
  Sparkles,
  Truck,
  History,
  Shield,
  KeyRound,
  CloudUpload,
  Printer,
  LayoutGrid,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ORG_INFO } from '../../config/constants';
import { formatDateTime } from '../../utils/normalization';
import type { Role } from '../../types';

import { showToast } from './ToastNotification';

interface HeaderProps {
  onOpenAudit?: () => void;
  onOpenUsers?: () => void;
  onOpenSupabase?: () => void;
  onOpenSearch?: () => void;
  onOpenStamp?: () => void;
  onOpenDailyOps?: () => void;
  onOpenSecurityCenter?: () => void;
  onOpenVehicles?: () => void;
  onOpenAssistant?: () => void;
  onOpenTimeline?: () => void;
  onOpenBadge?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAudit,
  onOpenUsers,
  onOpenSupabase,
  onOpenSearch,
  onOpenStamp,
  onOpenDailyOps,
  onOpenSecurityCenter,
  onOpenVehicles,
  onOpenAssistant,
  onOpenTimeline,
  onOpenBadge,
}) => {
  const { currentUser, logout } = useAuth();
  const { isOnline, notifications, markNotificationAsRead, markAllNotificationsAsRead, triggerSOSAlert, syncAllToSupabase, isRlsPermissionIssue, lastRlsError } = useData();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);

  // States pour SOS d'Urgence
  const [sosConfirmOpen, setSosConfirmOpen] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const [sosMessage, setSosMessage] = useState('Urgence terrain / agression ou menace sur l\'agent');

  const handleTriggerSOS = async () => {
    setSosSending(true);
    try {
      await triggerSOSAlert(sosMessage);
      setSosConfirmOpen(false);
      showToast('success', 'Alerte SOS transmise', "Les coordinateurs et superviseurs ont été notifiés de votre position GPS.");
    } catch (err: any) {
      showToast('error', "Échec de l'alerte SOS", err.message || 'Erreur inconnue');
    } finally {
      setSosSending(false);
    }
  };

  const handleNotificationClick = (n: any) => {
    if (!n.isRead) {
      markNotificationAsRead(n.id);
    }
    setNotifModalOpen(false);
    window.dispatchEvent(new CustomEvent('portus-notification-clicked', { detail: n }));
  };

  const myNotifications = notifications.filter((n) => {
    if (!currentUser) return false;
    if (n.recipientId && n.recipientId !== currentUser.id) {
      if (n.type === 'FRAUD_ALERT' && (currentUser.role === 'ADMINISTRATEUR' || currentUser.role === 'RESPONSABLE')) return true;
      if (n.type === 'FINANCIAL_ALERT' && (currentUser.role === 'ADMINISTRATEUR' || currentUser.role === 'RESPONSABLE')) return true;
      return false;
    }
    return true;
  });

  const unreadCount = myNotifications.filter((n) => !n.isRead).length;

  const roleColors: Record<Role, string> = {
    ADMINISTRATEUR: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    RESPONSABLE: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    AGENT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    CONTROLEUR: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    CAISSIER: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    FINANCE: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    AUDITEUR: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  };

  const roleLabels: Record<Role, string> = {
    ADMINISTRATEUR: 'ADMINISTRATEUR',
    RESPONSABLE: 'RESPONSABLE SECTEUR',
    AGENT: 'AGENT DE TERRAIN',
    CONTROLEUR: 'CONTRÔLEUR ROUTIER',
    CAISSIER: 'CAISSIER',
    FINANCE: 'FINANCE & AUDIT',
    AUDITEUR: 'AUDITEUR INDÉPENDANT',
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-xl">
      {/* Ruban officiel tricolore Côte d'Ivoire */}
      <div className="h-1 w-full bg-linear-to-r from-orange-500 via-white to-emerald-600" />

      {isRlsPermissionIssue && currentUser?.role === 'ADMINISTRATEUR' && (
        <div className="bg-rose-950/95 border-b border-rose-500/50 px-4 py-2 text-xs text-rose-200 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
            </span>
            <span>
              <strong>Base Supabase :</strong> Permissions PostgreSQL (RLS) manquantes ({lastRlsError || 'permission denied'}).
            </span>
          </div>
          {onOpenSupabase && (
            <button
              onClick={onOpenSupabase}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow shrink-0 cursor-pointer"
            >
              <span>Corriger RLS SQL</span>
            </button>
          )}
        </div>
      )}

      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2.5 sm:px-6">
        {/* Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative h-10 w-10 shrink-0 rounded-full p-0.5 bg-slate-900 border border-emerald-500/50 shadow-md flex items-center justify-center">
            <img
              src={ORG_INFO.LOGO_PATH}
              alt="Logo UJPAS"
              className="h-full w-full rounded-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black tracking-tight text-white whitespace-nowrap">
                PORTUS <span className="text-emerald-400 font-extrabold">— U.J.P.A.S.</span>
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium whitespace-nowrap hidden sm:block">
              Gestion Portuaire &amp; Sécurité Routière
            </p>
          </div>
        </div>

        {/* Navigation / Action Bar Center (Desktop) */}
        <div className="hidden lg:flex items-center gap-2">
          {/* Quick Search */}
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 rounded-xl bg-slate-800/80 border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:border-amber-500/40 transition cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>Recherche</span>
            </button>
          )}

          {/* Menu Outils Opérationnels (Unified Dropdown containing all specialized modals) */}
          <div className="relative">
            <button
              onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
              className="flex items-center gap-2 rounded-xl bg-slate-800/80 border border-white/10 px-3.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 hover:border-emerald-500/40 transition cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
              <span>Outils Opérationnels</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${toolsMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {toolsMenuOpen && (
              <div 
                className="absolute left-0 mt-2 w-72 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl z-50 grid grid-cols-1 gap-1 animate-in fade-in-50 zoom-in-95"
                onClick={() => setToolsMenuOpen(false)}
              >
                {onOpenDailyOps && (currentUser?.role === 'ADMINISTRATEUR' || currentUser?.role === 'RESPONSABLE' || currentUser?.role === 'CAISSIER' || currentUser?.role === 'FINANCE') && (
                  <button onClick={onOpenDailyOps} className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                    <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-bold text-white">Caisse &amp; Clôtures</p>
                      <p className="text-[10px] text-slate-400">Point financier journalier</p>
                    </div>
                  </button>
                )}

                {onOpenVehicles && (
                  <button onClick={onOpenVehicles} className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                    <Truck className="w-4 h-4 text-teal-400 shrink-0" />
                    <div>
                      <p className="font-bold text-white">Registre Véhicules</p>
                      <p className="text-[10px] text-slate-400">Flotte poids lourds &amp; camions</p>
                    </div>
                  </button>
                )}

                {onOpenTimeline && (
                  <button onClick={onOpenTimeline} className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                    <History className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <p className="font-bold text-white">Traçabilité Timeline</p>
                      <p className="text-[10px] text-slate-400">Suivi chronologique par ticket</p>
                    </div>
                  </button>
                )}

                {onOpenSecurityCenter && (
                  <button onClick={onOpenSecurityCenter} className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                    <Shield className="w-4 h-4 text-rose-400 shrink-0" />
                    <div>
                      <p className="font-bold text-white">Centre de Sécurité</p>
                      <p className="text-[10px] text-slate-400">Surveillance &amp; verrous RLS</p>
                    </div>
                  </button>
                )}

                {onOpenBadge && (currentUser?.role === 'ADMINISTRATEUR' || currentUser?.role === 'RESPONSABLE') && (
                  <button onClick={onOpenBadge} className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                    <Printer className="w-4 h-4 text-orange-400 shrink-0" />
                    <div>
                      <p className="font-bold text-white">Badges Pro (85×120)</p>
                      <p className="text-[10px] text-slate-400">Impression cartes avec QR</p>
                    </div>
                  </button>
                )}

                {currentUser?.role === 'ADMINISTRATEUR' && (
                  <>
                    {onOpenUsers && (
                      <button onClick={onOpenUsers} className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                        <Users className="w-4 h-4 text-blue-400 shrink-0" />
                        <div>
                          <p className="font-bold text-white">Gestion des Comptes</p>
                          <p className="text-[10px] text-slate-400">Utilisateurs &amp; rôles actifs</p>
                        </div>
                      </button>
                    )}
                    {onOpenAudit && (
                      <button onClick={onOpenAudit} className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                        <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                        <div>
                          <p className="font-bold text-white">Journal d'Audit</p>
                          <p className="text-[10px] text-slate-400">Logs inaltérables Append-only</p>
                        </div>
                      </button>
                    )}
                    {onOpenSupabase && (
                      <button onClick={onOpenSupabase} className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer">
                        <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <p className="font-bold text-white">Console Supabase SQL</p>
                          <p className="text-[10px] text-slate-400">Scripts &amp; schémas DB</p>
                        </div>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section Droite Header (Statut, Bell, SOS, Profil) */}
        <div className="hidden lg:flex items-center gap-3">
          {/* Status Réseau */}
          <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-slate-800 border border-white/10 text-slate-300">
            {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-amber-400" />}
            <span className="font-mono">{isOnline ? 'En ligne' : 'Hors ligne'}</span>
          </div>

          <PWAInstallButton />

          {/* Cloche Notifications */}
          <button
            onClick={() => setNotifModalOpen(true)}
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

          {/* Bouton SOS */}
          <button
            onClick={() => setSosConfirmOpen(true)}
            className="flex h-9 px-3 items-center justify-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-md shadow-rose-950/50 transition cursor-pointer"
            title="DÉCLENCHER ALERTE SOS TERRAIN"
          >
            <ShieldAlert className="w-4 h-4 text-white" />
            <span>SOS</span>
          </button>

          {/* User Profile */}
          {currentUser && (
            <div className="flex items-center gap-2 border-l border-white/10 pl-3">
              <div className="text-right">
                <p className="text-xs font-bold text-white leading-tight">
                  {currentUser.fullName}
                </p>
                <p className="text-[10px] text-emerald-400 font-mono">
                  {roleLabels[currentUser.role]}
                </p>
              </div>

              <button
                onClick={() => setChangePasswordOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition cursor-pointer"
                title="Changer mot de passe"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => logout()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition cursor-pointer"
                title="Déconnexion"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Bouton Mobile Hamburger */}
        <div className="flex items-center gap-2 lg:hidden">
          {/* Bouton SOS Mobile de détresse */}
          <button
            onClick={() => setSosConfirmOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 text-white animate-pulse shadow-md shadow-rose-600/20 active:scale-95 transition"
            title="DÉCLENCHER UNE ALERTE SOS"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>

          <button
            onClick={() => setNotifModalOpen(true)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <PWAInstallButton />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
            title="Menu de navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Modal / Panneau des Notifications */}
      {notifModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setNotifModalOpen(false)}
        >
          <div 
            className="w-full max-w-md my-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col space-y-3 animate-in fade-in-50 zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Notifications & Alertes</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-500/20 text-rose-300 px-2 py-0.5 text-xs font-bold border border-rose-500/30">
                    {unreadCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setNotifModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {unreadCount > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => markAllNotificationsAsRead()}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition py-1 px-2 rounded bg-slate-800/60"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tout marquer comme lu</span>
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[60vh]">
              {myNotifications.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  Aucune notification pour le moment.
                </div>
              ) : (
                myNotifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition space-y-1 ${
                      n.isRead
                        ? 'border-slate-800/80 bg-slate-950/40 text-slate-400'
                        : n.level === 'CRITICAL'
                        ? 'border-rose-500/40 bg-rose-950/20 text-rose-200 shadow-sm'
                        : 'border-slate-700 bg-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-white text-xs leading-snug">
                        {n.title}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">
                      {n.message}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-800 pt-3 text-center">
              <button
                type="button"
                onClick={() => setNotifModalOpen(false)}
                className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menu Déroulant Mobile */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-800 bg-slate-900 p-4 lg:hidden space-y-4">
          {currentUser && (
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <p className="text-sm font-bold text-white">{currentUser.fullName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                      roleColors[currentUser.role]
                    }`}
                  >
                    {roleLabels[currentUser.role]}
                  </span>
                  {currentUser.sectorName && (
                    <span className="text-[11px] text-slate-400">
                      {currentUser.sectorName}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setChangePasswordOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Mot de passe</span>
                </button>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-300"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Quitter</span>
                </button>
              </div>
            </div>
          )}

          {/* Bouton Recherche Avancée en Mobile */}
          {onOpenSearch && (
            <button
              onClick={() => {
                onOpenSearch();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600/20 border border-amber-500/40 p-2.5 text-xs font-bold text-amber-300 hover:bg-amber-600/30 transition cursor-pointer"
            >
              <Search className="w-4 h-4 text-amber-400" />
              <span>Recherches Avancées & Filtres</span>
            </button>
          )}

          {/* Assistant en Mobile */}
          {onOpenAssistant && (
            <button
              onClick={() => {
                onOpenAssistant();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600/20 border border-indigo-500/40 p-2.5 text-xs font-bold text-indigo-300 hover:bg-indigo-600/30 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Assistant Opérationnel PORTUS</span>
            </button>
          )}

          {/* Caisse & Clôture en Mobile */}
          {onOpenDailyOps && (currentUser?.role === 'ADMINISTRATEUR' || currentUser?.role === 'RESPONSABLE' || currentUser?.role === 'CAISSIER' || currentUser?.role === 'FINANCE' || currentUser?.role === 'AUDITEUR') && (
            <button
              onClick={() => {
                onOpenDailyOps();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 p-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>Centre Opérations & Caisse Journalière</span>
            </button>
          )}

          {/* Badges Pro en Mobile */}
          {onOpenBadge && (currentUser?.role === 'ADMINISTRATEUR' || currentUser?.role === 'RESPONSABLE') && (
            <button
              onClick={() => {
                onOpenBadge();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600/20 border border-orange-500/40 p-2.5 text-xs font-bold text-orange-300 hover:bg-orange-600/30 transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-orange-400" />
              <span>Badges Professionnels (85 × 120 mm)</span>
            </button>
          )}

          {/* Véhicules en Mobile */}
          {onOpenVehicles && (currentUser?.role === 'ADMINISTRATEUR' || currentUser?.role === 'RESPONSABLE' || currentUser?.role === 'CONTROLEUR' || currentUser?.role === 'AUDITEUR') && (
            <button
              onClick={() => {
                onOpenVehicles();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600/20 border border-teal-500/40 p-2.5 text-xs font-bold text-teal-300 hover:bg-teal-600/30 transition cursor-pointer"
            >
              <Truck className="w-4 h-4 text-teal-400" />
              <span>Registre Véhicules & Citernes</span>
            </button>
          )}

          {/* Timeline Ticket en Mobile */}
          {onOpenTimeline && (
            <button
              onClick={() => {
                onOpenTimeline();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 p-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
            >
              <History className="w-4 h-4 text-slate-400" />
              <span>Traçabilité Chronologique Ticket</span>
            </button>
          )}

          {/* Centre Sécurité en Mobile */}
          {onOpenSecurityCenter && (currentUser?.role === 'ADMINISTRATEUR' || currentUser?.role === 'RESPONSABLE' || currentUser?.role === 'AUDITEUR') && (
            <button
              onClick={() => {
                onOpenSecurityCenter();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600/20 border border-rose-500/40 p-2.5 text-xs font-bold text-rose-300 hover:bg-rose-600/30 transition cursor-pointer"
            >
              <Shield className="w-4 h-4 text-rose-400" />
              <span>Centre Sécurité & Traçabilité QR</span>
            </button>
          )}

          {/* Bouton Modèle & Cachet UJPAS en Mobile (Seul l'administrateur peut voir le spécimen) */}
          {onOpenStamp && currentUser?.role === 'ADMINISTRATEUR' && (
            <button
              onClick={() => {
                onOpenStamp();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 border border-emerald-500/40 p-2.5 text-xs font-bold text-emerald-300 hover:bg-slate-700 transition cursor-pointer"
            >
              <Stamp className="w-4 h-4 text-emerald-400" />
              <span>Modèle de Ticket & Cachet UJPAS</span>
            </button>
          )}

          {/* Menus Admin en Mobile */}
          {currentUser?.role === 'ADMINISTRATEUR' && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              {onOpenUsers && (
                <button
                  onClick={() => {
                    onOpenUsers();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl bg-slate-800 p-2.5 text-xs font-semibold text-slate-200"
                >
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>Gestion des Utilisateurs</span>
                </button>
              )}
              {onOpenAudit && (
                <button
                  onClick={() => {
                    onOpenAudit();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl bg-slate-800 p-2.5 text-xs font-semibold text-slate-200"
                >
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>Journal d’Audit Trail</span>
                </button>
              )}
              {onOpenSupabase && (
                <button
                  onClick={() => {
                    onOpenSupabase();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl bg-slate-800 p-2.5 text-xs font-semibold text-emerald-300"
                >
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Schéma Supabase SQL</span>
                </button>
              )}
              <button
                onClick={async () => {
                  setSyncingCloud(true);
                  try {
                    const res = await syncAllToSupabase();
                    showToast('success', 'Synchronisation Supabase', res.message);
                  } catch (e: any) {
                    showToast('error', 'Échec de la synchronisation', e.message || 'Erreur réseau');
                  } finally {
                    setSyncingCloud(false);
                    setMobileMenuOpen(false);
                  }
                }}
                disabled={syncingCloud}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 p-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900 transition disabled:opacity-50"
              >
                <CloudUpload className={`w-4 h-4 text-emerald-400 ${syncingCloud ? 'animate-spin' : ''}`} />
                <span>{syncingCloud ? 'Synchronisation Cloud...' : 'Synchroniser avec le Cloud Supabase'}</span>
              </button>
            </div>
          )}
        </div>
      )}
      
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />

      {/* Modale de confirmation SOS d'Urgence Extrême */}
      {sosConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl border-2 border-rose-500 bg-slate-900 p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/40 animate-bounce">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                ⚠️ DÉCLENCHER UNE ALERTE SOS ?
              </h3>
              <p className="text-xs text-rose-300 font-medium leading-relaxed">
                Cette action transmettra immédiatement un signal de détresse avec votre identité, rôle et coordonnées GPS précises à tous les superviseurs et administrateurs.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Motif de l'urgence (Optionnel)
              </label>
              <select
                value={sosMessage}
                onChange={(e) => setSosMessage(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-850 py-2 px-2.5 text-xs text-white focus:border-rose-500 focus:outline-hidden"
              >
                <option value="Urgence terrain / agression ou menace sur l'agent">⚠️ Menace physique / Agression</option>
                <option value="Accident routier grave sur le corridor">🚗 Accident routier grave</option>
                <option value="Contestation virulente / altercation chauffeur bloquant">Altercation / Chauffeur récalcitrant</option>
                <option value="Panne d'équipement ou problème réseau critique">Disponibilité terrain bloquée</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-855">
              <button
                type="button"
                onClick={() => setSosConfirmOpen(false)}
                disabled={sosSending}
                className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleTriggerSOS}
                disabled={sosSending}
                className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 py-2.5 text-xs font-black text-white shadow-lg shadow-rose-950 transition active:scale-98 flex items-center justify-center gap-1.5"
              >
                {sosSending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Envoi...</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5 animate-pulse" />
                    <span>LANCER SOS</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
