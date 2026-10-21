import React from 'react';
import {
  X,
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Truck,
  ShieldCheck,
  Users,
  ShieldAlert,
  FileText,
  Sparkles,
  Building2,
  Printer,
  Database,
  Search,
  KeyRound,
  LogOut,
  Shield,
  History,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { ActiveNavTab } from './AppSidebar';
import type { Role } from '../../types';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  onOpenSearch: () => void;
  onOpenDailyOps: () => void;
  onOpenSecurityCenter: () => void;
  onOpenVehicles: () => void;
  onOpenTimeline: () => void;
  onOpenBadge: () => void;
  onOpenUsers: () => void;
  onOpenAudit: () => void;
  onOpenSupabase: () => void;
  onChangePassword: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  onOpenSearch,
  onOpenDailyOps,
  onOpenSecurityCenter,
  onOpenVehicles,
  onOpenTimeline,
  onOpenBadge,
  onOpenUsers,
  onOpenAudit,
  onOpenSupabase,
  onChangePassword,
}) => {
  const { currentUser, logout } = useAuth();

  if (!isOpen || !currentUser) return null;

  const roleLabels: Record<Role, string> = {
    ADMINISTRATEUR: 'ADMINISTRATEUR',
    RESPONSABLE: 'RESPONSABLE SECTEUR',
    AGENT: 'AGENT DE TERRAIN',
    CONTROLEUR: 'CONTRÔLEUR ROUTIER',
    CAISSIER: 'CAISSIER',
    FINANCE: 'FINANCE & AUDIT',
    AUDITEUR: 'AUDITEUR INDÉPENDANT',
  };

  const handleNavClick = (tab: ActiveNavTab) => {
    onSelectTab(tab);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-xs animate-in fade-in-50 lg:hidden">
      <div
        className="fixed inset-0"
        onClick={onClose}
      />

      <div className="relative w-full max-w-xs bg-slate-900 border-l border-white/10 h-full flex flex-col z-10 shadow-2xl p-4 overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="text-sm font-black text-white">Menu & Navigation</h2>
            <p className="text-[10px] text-emerald-400 font-bold">PORTUS — U.J.P.A.S.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-3 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-white">{currentUser.fullName}</p>
            <p className="text-[10px] text-emerald-400 font-mono">
              {roleLabels[currentUser.role]}
            </p>
          </div>
          <button
            onClick={() => {
              onChangePassword();
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800 text-amber-400 hover:bg-amber-500/20 transition cursor-pointer"
            title="Changer mot de passe"
          >
            <KeyRound className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Search */}
        <button
          onClick={() => {
            onOpenSearch();
            onClose();
          }}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
        >
          <Search className="w-4 h-4 text-amber-400" />
          <span>Recherche Avancée Ticket / Plaque</span>
        </button>

        {/* Primary Views Section */}
        <div className="space-y-1 pt-2">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2">
            Espaces de Travail
          </p>

          <button
            onClick={() => handleNavClick('dashboard')}
            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold transition text-left cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-200 hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-emerald-400" />
            <span>Tableau de Bord Principal</span>
          </button>

          <button
            onClick={() => handleNavClick('sales')}
            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold transition text-left cursor-pointer ${
              activeTab === 'sales'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ShoppingCart className="w-4 h-4 text-amber-400" />
            <span>Gestion Ventes & Carnets</span>
          </button>

          <button
            onClick={() => handleNavClick('remises')}
            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold transition text-left cursor-pointer ${
              activeTab === 'remises'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4 text-teal-400" />
            <span>Remises & Caisse Agent</span>
          </button>

          <button
            onClick={() => handleNavClick('vehicles')}
            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold transition text-left cursor-pointer ${
              activeTab === 'vehicles'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Truck className="w-4 h-4 text-blue-400" />
            <span>Registre Flotte Véhicules</span>
          </button>

          <button
            onClick={() => handleNavClick('controls')}
            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold transition text-left cursor-pointer ${
              activeTab === 'controls'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-200 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <span>Contrôles Routiers & Scans</span>
          </button>
        </div>

        {/* Specialized Operational Centers */}
        <div className="space-y-1 pt-2 border-t border-white/10">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2">
            Centres Opérationnels
          </p>

          <button
            onClick={() => {
              onOpenDailyOps();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer"
          >
            <Building2 className="w-4 h-4 text-emerald-400" />
            <span>Centre Clôtures & Caisse</span>
          </button>

          <button
            onClick={() => {
              onOpenSecurityCenter();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer"
          >
            <Shield className="w-4 h-4 text-rose-400" />
            <span>Centre de Sécurité & RLS</span>
          </button>

          <button
            onClick={() => {
              onOpenTimeline();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer"
          >
            <History className="w-4 h-4 text-amber-400" />
            <span>Traçabilité Ticket Timeline</span>
          </button>

          {currentUser.role === 'ADMINISTRATEUR' && (
            <>
              <button
                onClick={() => {
                  onOpenBadge();
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-orange-400" />
                <span>Badges Professionnels Pro</span>
              </button>

              <button
                onClick={() => {
                  onOpenUsers();
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer"
              >
                <Users className="w-4 h-4 text-blue-400" />
                <span>Gestion Utilisateurs & Comptes</span>
              </button>

              <button
                onClick={() => {
                  onOpenAudit();
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer"
              >
                <FileText className="w-4 h-4 text-purple-400" />
                <span>Journal d'AuditInaltérable</span>
              </button>

              <button
                onClick={() => {
                  onOpenSupabase();
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 text-left transition cursor-pointer"
              >
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Console Supabase SQL</span>
              </button>
            </>
          )}
        </div>

        {/* Logout */}
        <div className="pt-4 border-t border-white/10 mt-auto">
          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600/20 border border-rose-500/40 p-2.5 text-xs font-bold text-rose-300 hover:bg-rose-600/30 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Déconnexion</span>
          </button>
        </div>
      </div>
    </div>
  );
};
