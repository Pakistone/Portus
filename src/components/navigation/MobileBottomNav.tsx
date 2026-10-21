import React, { useState } from 'react';
import {
  BarChart3,
  ShoppingCart,
  HandCoins,
  QrCode,
  Grid,
  X,
  Layers,
  Users,
  Printer,
  Search,
  FileText,
  ShieldAlert,
  Settings,
  Zap,
  Building2,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { Role } from '../../types';

interface MobileBottomNavProps {
  activeTab?: string;
  onSelectTab?: (tabKey: string) => void;
  onOpenSale?: () => void;
  onOpenRemise?: () => void;
  onOpenScan?: () => void;
  onOpenCarnets?: () => void;
  onOpenUsers?: () => void;
  onOpenBadges?: () => void;
  onOpenSearch?: () => void;
  onOpenAudit?: () => void;
  onOpenFrauds?: () => void;
  onOpenSettings?: () => void;
  onTriggerSOS?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab = 'home',
  onSelectTab,
  onOpenSale,
  onOpenRemise,
  onOpenScan,
  onOpenCarnets,
  onOpenUsers,
  onOpenBadges,
  onOpenSearch,
  onOpenAudit,
  onOpenFrauds,
  onOpenSettings,
  onTriggerSOS,
}) => {
  const { currentUser, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!currentUser) return null;

  const role = currentUser.role;

  const roleBadgeStyles: Record<Role, string> = {
    ADMINISTRATEUR: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    RESPONSABLE: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    AGENT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    CONTROLEUR: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    CAISSIER: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    FINANCE: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    AUDITEUR: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  };

  const handleActionAndCloseDrawer = (action?: () => void) => {
    setDrawerOpen(false);
    action?.();
  };

  return (
    <>
      {/* BARRE DE NAVIGATION TACTILE BASSE FIXE (MOBILE ONLY) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-slate-900/95 backdrop-blur-xl border-t border-white/10 p-1.5 px-3 select-none shadow-2xl">
        <div className="grid grid-cols-5 gap-1 items-center max-w-md mx-auto">
          {/* 1. ACCUEIL / TABLEAU DE BORD */}
          <button
            onClick={() => onSelectTab?.('home')}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition cursor-pointer ${
              activeTab === 'home'
                ? 'text-orange-400 font-black bg-orange-500/10 border border-orange-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-5 h-5 shrink-0" />
            <span className="text-[10px] font-bold tracking-tight mt-0.5">Accueil</span>
          </button>

          {/* 2. VENTE (OU SCAN SI CONTROLEUR) - BOUTON MAJEUR DESTACAT */}
          {role === 'CONTROLEUR' ? (
            <button
              onClick={onOpenScan}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-amber-400 bg-amber-500/10 border border-amber-500/30 font-black shadow-md cursor-pointer"
            >
              <QrCode className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-bold tracking-tight mt-0.5">Scan 14J</span>
            </button>
          ) : (
            <button
              onClick={onOpenSale}
              className="relative -top-2 flex flex-col items-center justify-center p-2.5 rounded-2xl bg-linear-to-r from-orange-600 to-amber-500 text-white font-black shadow-lg shadow-orange-950/60 border border-orange-400/40 cursor-pointer active:scale-95 transition"
            >
              <ShoppingCart className="w-5 h-5 shrink-0 text-white" />
              <span className="text-[9px] font-black uppercase tracking-wider mt-0.5">Vente</span>
            </button>
          )}

          {/* 3. REMISES (OU INCIDENTS SI CONTROLEUR) */}
          {role === 'CONTROLEUR' ? (
            <button
              onClick={onOpenFrauds}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-rose-400 hover:text-rose-300 font-bold transition cursor-pointer"
            >
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-bold tracking-tight mt-0.5">Incidents</span>
            </button>
          ) : (
            <button
              onClick={onOpenRemise}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition cursor-pointer ${
                activeTab === 'remise'
                  ? 'text-emerald-400 font-black bg-emerald-500/10 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <HandCoins className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-bold tracking-tight mt-0.5">Remises</span>
            </button>
          )}

          {/* 4. CONTRÔLE SCAN QR */}
          <button
            onClick={onOpenScan}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition cursor-pointer ${
              activeTab === 'scan'
                ? 'text-amber-400 font-black bg-amber-500/10 border border-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-5 h-5 shrink-0" />
            <span className="text-[10px] font-bold tracking-tight mt-0.5">Contrôle</span>
          </button>

          {/* 5. TIROIR "PLUS" */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-slate-400 hover:text-slate-200 font-bold transition cursor-pointer"
          >
            <Grid className="w-5 h-5 shrink-0 text-purple-400" />
            <span className="text-[10px] font-bold tracking-tight mt-0.5">Plus</span>
          </button>
        </div>
      </nav>

      {/* TIROIR MODULAIRE SLIDE-OVER "PLUS" (MOBILE SHEET) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-md animate-fadeIn sm:hidden">
          <div className="w-full bg-slate-900 border-t border-white/10 rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto text-slate-100 shadow-2xl">
            {/* EN-TÊTE TIROIR */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Grid className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Menu Outils PORTUS</h3>
                  <p className="text-[11px] text-slate-400">
                    Services modulaires adaptés au rôle {role}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ACTION URGENTE SOS EN TÊTE DU TIROIR */}
            <button
              onClick={() => handleActionAndCloseDrawer(onTriggerSOS)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-500 py-3 px-4 font-black text-xs text-white shadow-lg shadow-rose-950/40 border border-rose-400/30 cursor-pointer"
            >
              <Zap className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>🚨 DÉCLENCHER ALERTE SOS TERRAIN</span>
            </button>

            {/* GRILLE 2 COLONNES DES MODULES SECONDAIRES */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {(role === 'ADMINISTRATEUR' || role === 'RESPONSABLE') && (
                <button
                  onClick={() => handleActionAndCloseDrawer(onOpenCarnets)}
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left hover:border-orange-500/40 transition cursor-pointer"
                >
                  <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-white">Carnets</span>
                    <span className="text-[10px] text-slate-400">Stock &amp; Lots</span>
                  </div>
                </button>
              )}

              {(role === 'ADMINISTRATEUR' || role === 'RESPONSABLE' || role === 'CONTROLEUR') && (
                <button
                  onClick={() => handleActionAndCloseDrawer(onOpenUsers)}
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left hover:border-blue-500/40 transition cursor-pointer"
                >
                  <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-white">Équipe</span>
                    <span className="text-[10px] text-slate-400">Trombinoscope</span>
                  </div>
                </button>
              )}

              {(role === 'ADMINISTRATEUR' || role === 'RESPONSABLE') && (
                <button
                  onClick={() => handleActionAndCloseDrawer(onOpenBadges)}
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left hover:border-amber-500/40 transition cursor-pointer"
                >
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-white">Badges Pro</span>
                    <span className="text-[10px] text-slate-400">85 × 120 mm</span>
                  </div>
                </button>
              )}

              <button
                onClick={() => handleActionAndCloseDrawer(onOpenSearch)}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left hover:border-emerald-500/40 transition cursor-pointer"
              >
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-white">Recherches</span>
                  <span className="text-[10px] text-slate-400">Filtres &amp; Exports</span>
                </div>
              </button>

              <button
                onClick={() => handleActionAndCloseDrawer(onOpenFrauds)}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left hover:border-rose-500/40 transition cursor-pointer"
              >
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-white">Incidents</span>
                  <span className="text-[10px] text-slate-400">Signalements SOS</span>
                </div>
              </button>

              {role === 'ADMINISTRATEUR' && (
                <button
                  onClick={() => handleActionAndCloseDrawer(onOpenAudit)}
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left hover:border-purple-500/40 transition cursor-pointer"
                >
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-white">Audit Logs</span>
                    <span className="text-[10px] text-slate-400">Traces inaltérables</span>
                  </div>
                </button>
              )}

              {role === 'ADMINISTRATEUR' && (
                <button
                  onClick={() => handleActionAndCloseDrawer(onOpenSettings)}
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left hover:border-slate-500/40 transition cursor-pointer"
                >
                  <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-white">Paramètres</span>
                    <span className="text-[10px] text-slate-400">Tarifs &amp; System</span>
                  </div>
                </button>
              )}
            </div>

            {/* INFOS COMPTE EN BAS DE TIROIR */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center">
                  {currentUser.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt={currentUser.fullName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-white">{currentUser.fullName.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{currentUser.fullName}</p>
                  <p className="text-[10px] text-slate-400">@{currentUser.username}</p>
                </div>
              </div>

              <button
                onClick={() => logout()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
