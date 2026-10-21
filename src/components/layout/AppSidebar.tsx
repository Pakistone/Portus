import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Truck,
  ShieldCheck,
  Users,
  ShieldAlert,
  FileText,
  Sparkles,
  Printer,
  Database,
  ChevronLeft,
  ChevronRight,
  LogOut,
  KeyRound,
  Wifi,
  WifiOff,
  Search,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { ORG_INFO } from '../../config/constants';
import type { Role } from '../../types';

export type ActiveNavTab =
  | 'dashboard'
  | 'sales'
  | 'remises'
  | 'vehicles'
  | 'controls'
  | 'team'
  | 'security'
  | 'audit'
  | 'assistant';

interface AppSidebarProps {
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onTriggerSOS: () => void;
  onOpenSearch: () => void;
  onOpenSaleModal?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  onTriggerSOS,
  onOpenSearch,
  onOpenSaleModal,
}) => {
  const { currentUser, logout } = useAuth();
  const { isOnline } = useData();

  if (!currentUser) return null;

  const roleBadgeColors: Record<Role, string> = {
    ADMINISTRATEUR: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    RESPONSABLE: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    AGENT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    CONTROLEUR: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    CAISSIER: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    FINANCE: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    AUDITEUR: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  };

  const roleShortLabels: Record<Role, string> = {
    ADMINISTRATEUR: 'ADMIN',
    RESPONSABLE: 'RESPONSABLE',
    AGENT: 'AGENT TERRAIN',
    CONTROLEUR: 'CONTRÔLEUR',
    CAISSIER: 'CAISSIER',
    FINANCE: 'FINANCE',
    AUDITEUR: 'AUDITEUR',
  };

  const navItems = [
    {
      id: 'dashboard' as ActiveNavTab,
      label: 'Tableau de bord',
      icon: LayoutDashboard,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR', 'CAISSIER', 'FINANCE', 'AUDITEUR'],
    },
    {
      id: 'sales' as ActiveNavTab,
      label: 'Ventes & Carnets',
      icon: ShoppingCart,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT'],
    },
    {
      id: 'remises' as ActiveNavTab,
      label: 'Remises & Caisse',
      icon: Receipt,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CAISSIER', 'FINANCE'],
    },
    {
      id: 'vehicles' as ActiveNavTab,
      label: 'Registre Véhicules',
      icon: Truck,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR', 'AUDITEUR'],
    },
    {
      id: 'controls' as ActiveNavTab,
      label: 'Contrôles Routiers',
      icon: ShieldCheck,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'CONTROLEUR'],
    },
    {
      id: 'team' as ActiveNavTab,
      label: 'Équipe & Badges',
      icon: Users,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
    },
    {
      id: 'security' as ActiveNavTab,
      label: 'Centre Sécurité',
      icon: ShieldAlert,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AUDITEUR'],
    },
    {
      id: 'audit' as ActiveNavTab,
      label: "Journal d'Audit",
      icon: FileText,
      roles: ['ADMINISTRATEUR'],
    },
    {
      id: 'assistant' as ActiveNavTab,
      label: 'Assistant PORTUS',
      icon: Sparkles,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR', 'CAISSIER', 'FINANCE', 'AUDITEUR'],
    },
  ];

  const filteredItems = navItems.filter((item) =>
    item.roles.includes(currentUser.role)
  );

  return (
    <aside
      className={`hidden lg:flex flex-col border-r border-white/10 bg-slate-900/95 backdrop-blur-xl transition-all duration-300 relative z-20 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Ruban officiel tricolore */}
      <div className="h-1 w-full bg-linear-to-r from-orange-500 via-white to-emerald-600" />

      {/* Brand & Header Section */}
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="h-10 w-10 shrink-0 rounded-full bg-slate-950 p-0.5 border border-emerald-500/50 flex items-center justify-center shadow-md">
            <img
              src={ORG_INFO.LOGO_PATH}
              alt="UJPAS Logo"
              className="h-full w-full rounded-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          {!collapsed && (
            <div className="truncate">
              <h1 className="text-sm font-black text-white tracking-tight leading-none">
                PORTUS <span className="text-emerald-400 font-bold">— UJPAS</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium truncate mt-1">
                Port d'Abidjan · Zone Vridi
              </p>
            </div>
          )}
        </div>

        {/* Toggle Collapse Button */}
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Search Quick Launcher (Desktop) */}
      {!collapsed && (
        <div className="px-3 pt-3">
          <button
            onClick={onOpenSearch}
            className="w-full flex items-center justify-between gap-2 rounded-xl bg-slate-800/80 border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:border-amber-500/40 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>Rechercher ticket/plaque</span>
            </div>
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-slate-900 rounded text-slate-400 border border-white/10">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2 mb-2">
          {!collapsed ? 'Menu principal' : '•'}
        </div>

        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-linear-to-r from-emerald-600/90 to-teal-600/90 text-white shadow-lg shadow-emerald-950/40 font-bold'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Quick Action Callouts (SOS & New Sale) */}
      <div className="p-3 border-t border-white/10 space-y-2">
        {onOpenSaleModal && (currentUser.role === 'ADMINISTRATEUR' || currentUser.role === 'RESPONSABLE' || currentUser.role === 'AGENT') && (
          <button
            onClick={onOpenSaleModal}
            className={`w-full flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black py-2.5 px-3 text-xs shadow-lg shadow-orange-950/40 transition cursor-pointer active:scale-98 ${
              collapsed ? 'px-0' : ''
            }`}
            title="Enregistrer une vente de ticket"
          >
            <ShoppingCart className="w-4 h-4 text-slate-950 shrink-0" />
            {!collapsed && <span>Saisie Vente Express</span>}
          </button>
        )}

        <button
          onClick={onTriggerSOS}
          className={`w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-extrabold py-2 px-3 text-xs shadow-md shadow-rose-950/50 transition cursor-pointer active:scale-98 ${
            collapsed ? 'px-0' : ''
          }`}
          title="DÉCLENCHER ALERTE SOS TERRAIN"
        >
          <ShieldAlert className="w-4 h-4 text-white shrink-0 animate-pulse" />
          {!collapsed && <span>SOS Urgence</span>}
        </button>
      </div>

      {/* Footer User Profile Card */}
      <div className="p-3 border-t border-white/10 bg-slate-950/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-8 w-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center shrink-0 font-bold text-xs text-white">
              {currentUser.fullName.charAt(0)}
            </div>
            {!collapsed && (
              <div className="truncate">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {currentUser.fullName}
                </p>
                <span
                  className={`inline-block mt-0.5 rounded px-1.5 py-0.2 text-[9px] font-bold border ${
                    roleBadgeColors[currentUser.role]
                  }`}
                >
                  {roleShortLabels[currentUser.role]}
                </span>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              onClick={() => logout()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
