import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  ShieldCheck,
  MoreHorizontal,
} from 'lucide-react';
import type { ActiveNavTab } from './AppSidebar';
import { useAuth } from '../../context/AuthContext';

interface MobileBottomNavProps {
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  onOpenMobileMenu: () => void;
  onOpenSaleModal?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenMobileMenu,
  onOpenSaleModal,
}) => {
  const { currentUser } = useAuth();

  if (!currentUser) return null;

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-white/10 backdrop-blur-xl px-2 py-1.5 shadow-2xl">
      <div className="grid grid-cols-5 items-center max-w-md mx-auto text-center gap-1">
        {/* Tab 1: Dashboard */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition cursor-pointer ${
            activeTab === 'dashboard'
              ? 'text-emerald-400 font-bold bg-emerald-500/10'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] truncate leading-none">Accueil</span>
        </button>

        {/* Tab 2: Vente Express */}
        <button
          onClick={() => {
            if (onOpenSaleModal) {
              onOpenSaleModal();
            } else {
              onSelectTab('sales');
            }
          }}
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-amber-400 font-bold hover:text-amber-300 transition cursor-pointer active:scale-95"
        >
          <div className="bg-linear-to-br from-amber-500 to-orange-600 text-slate-950 p-1.5 rounded-full shadow-md shadow-orange-950/50">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <span className="text-[10px] truncate leading-none mt-0.5">Vente</span>
        </button>

        {/* Tab 3: Remises */}
        <button
          onClick={() => onSelectTab('remises')}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition cursor-pointer ${
            activeTab === 'remises'
              ? 'text-teal-400 font-bold bg-teal-500/10'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Receipt className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] truncate leading-none">Remises</span>
        </button>

        {/* Tab 4: Contrôles */}
        <button
          onClick={() => onSelectTab('controls')}
          className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition cursor-pointer ${
            activeTab === 'controls'
              ? 'text-blue-400 font-bold bg-blue-500/10'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] truncate leading-none">Contrôle</span>
        </button>

        {/* Tab 5: More Drawer */}
        <button
          onClick={onOpenMobileMenu}
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
        >
          <MoreHorizontal className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] truncate leading-none">Plus</span>
        </button>
      </div>
    </div>
  );
};
