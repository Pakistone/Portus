import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  ShieldAlert,
  Layers,
  Users,
  Printer,
  Search,
  FileText,
  Settings,
  HandCoins,
  QrCode,
  LogOut,
  Building2,
  Sparkles,
  BarChart3,
  Receipt,
  UserCheck,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ORG_INFO } from '../../config/constants';
import type { Role } from '../../types';

interface AppSidebarProps {
  activeModule?: string;
  onSelectModule?: (moduleKey: string) => void;
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

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeModule = 'dashboard',
  onSelectModule,
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
  const [collapsed, setCollapsed] = useState(false);

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

  const roleLabels: Record<Role, string> = {
    ADMINISTRATEUR: 'ADMINISTRATEUR',
    RESPONSABLE: 'RESPONSABLE SECTEUR',
    AGENT: 'AGENT DE TERRAIN',
    CONTROLEUR: 'CONTRÔLEUR ROUTIER',
    CAISSIER: 'CAISSIER',
    FINANCE: 'FINANCE & AUDIT',
    AUDITEUR: 'AUDITEUR INDÉPENDANT',
  };

  // Nav Links Configuration according to RBAC rules
  const navItems = [
    {
      key: 'dashboard',
      label: 'Tableau de Bord',
      icon: BarChart3,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'],
      action: () => onSelectModule?.('dashboard'),
    },
    {
      key: 'sale',
      label: 'Saisie Vente Express',
      icon: ShoppingCart,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT'],
      action: onOpenSale,
    },
    {
      key: 'remise',
      label: 'Encaissements & Remises',
      icon: HandCoins,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT'],
      action: onOpenRemise,
    },
    {
      key: 'scan',
      label: 'Contrôle & Scan QR (14J)',
      icon: QrCode,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'CONTROLEUR'],
      action: onOpenScan,
    },
    {
      key: 'carnets',
      label: 'Gestion des Carnets',
      icon: Layers,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
      action: onOpenCarnets,
    },
    {
      key: 'users',
      label: 'Équipe & Trombinoscope',
      icon: Users,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'CONTROLEUR'],
      action: onOpenUsers,
    },
    {
      key: 'badges',
      label: 'Badges Pro (85×120)',
      icon: Printer,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
      action: onOpenBadges,
    },
    {
      key: 'search',
      label: 'Recherches & Exports',
      icon: Search,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'],
      action: onOpenSearch,
    },
    {
      key: 'frauds',
      label: 'Incidents & Signalements',
      icon: ShieldAlert,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'],
      action: onOpenFrauds,
    },
    {
      key: 'audit',
      label: 'Audit & Clôtures',
      icon: FileText,
      roles: ['ADMINISTRATEUR'],
      action: onOpenAudit,
    },
    {
      key: 'settings',
      label: 'Paramètres & Tarifs',
      icon: Settings,
      roles: ['ADMINISTRATEUR'],
      action: onOpenSettings,
    },
  ].filter((item) => item.roles.includes(role));

  return (
    <aside
      className={`hidden sm:flex flex-col h-screen sticky top-0 z-40 bg-slate-900/95 backdrop-blur-xl border-r border-white/10 transition-all duration-300 select-none ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* HEADER SIDEBAR & LOGO */}
      <div className="flex items-center justify-between p-3.5 border-b border-white/10">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="h-10 w-10 shrink-0 rounded-full border border-orange-500/40 bg-slate-950 p-0.5 shadow-md flex items-center justify-center">
            <img
              src={ORG_INFO.LOGO_PATH}
              alt="Logo UJPAS"
              className="h-full w-full rounded-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-black text-white truncate tracking-wider">
                {ORG_INFO.NAME}
              </span>
              <span className="text-[10px] text-orange-400 font-bold truncate">
                Zone Portuaire Vridi
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer shrink-0"
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* BOUTONS D'ACTIONS RAPIDES PRIORITAIRES */}
      <div className="p-3 space-y-2 border-b border-white/10">
        {/* ACTION VENTE EXPRESS (Si autorisé) */}
        {(role === 'ADMINISTRATEUR' || role === 'RESPONSABLE' || role === 'AGENT') && (
          <button
            onClick={onOpenSale}
            className={`w-full flex items-center gap-3 rounded-xl bg-linear-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-black shadow-lg shadow-orange-950/40 transition cursor-pointer border border-orange-400/30 ${
              collapsed ? 'p-2.5 justify-center' : 'px-3.5 py-2.5 text-xs'
            }`}
            title="Saisie Vente Express Ticket (2 500 FCFA)"
          >
            <ShoppingCart className="w-4 h-4 shrink-0 text-white" />
            {!collapsed && <span>⚡ Saisie Vente Express</span>}
          </button>
        )}

        {/* ACTION SOS URGENCE (Accès immédiat pour tous les rôles sur le terrain) */}
        <button
          onClick={onTriggerSOS}
          className={`w-full flex items-center gap-3 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-black shadow-lg shadow-rose-950/40 transition cursor-pointer border border-rose-400/30 ${
            collapsed ? 'p-2.5 justify-center' : 'px-3.5 py-2.5 text-xs'
          }`}
          title="Alerte SOS Urgence Terrain"
        >
          <Zap className="w-4 h-4 shrink-0 text-amber-300 animate-pulse" />
          {!collapsed && <span>🚨 SOS Urgence Terrain</span>}
        </button>
      </div>

      {/* MENU DE NAVIGATION SECONDAIRE PAR RÔLE */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.key;

          return (
            <button
              key={item.key}
              onClick={item.action}
              className={`w-full flex items-center gap-3 rounded-xl transition cursor-pointer font-bold text-xs ${
                collapsed ? 'p-3 justify-center' : 'px-3.5 py-2.5'
              } ${
                isActive
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-md'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-orange-400' : 'text-slate-400'
                }`}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* BADGE UTILISATEUR EN BAS DE SIDEBAR */}
      <div className="p-3 border-t border-white/10 bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <div className="relative h-9 w-9 shrink-0 rounded-xl overflow-hidden border border-slate-700 bg-slate-800 flex items-center justify-center">
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.fullName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-black text-slate-300">
                {currentUser.fullName.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-slate-950" />
          </div>

          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-bold text-white truncate">
                {currentUser.fullName}
              </span>
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-black uppercase border tracking-wider mt-0.5 w-fit ${
                  roleBadgeStyles[role] || 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {roleLabels[role] || role}
              </span>
            </div>
          )}

          <button
            onClick={() => logout()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
            title="Se déconnecter"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
