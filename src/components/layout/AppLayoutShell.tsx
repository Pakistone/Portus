import React, { useState, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AppSidebar, ActiveNavTab } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileDrawer } from './MobileDrawer';
import { OfflineIndicator } from '../pwa/OfflineIndicator';
import { ToastNotificationContainer } from '../common/ToastNotification';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { showToast } from '../common/ToastNotification';

// Dashboards par rôle (Lazy loaded)
const AdminDashboard = lazy(() => import('../dashboard/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const ResponsableDashboard = lazy(() => import('../dashboard/ResponsableDashboard').then(m => ({ default: m.ResponsableDashboard })));
const AgentDashboard = lazy(() => import('../dashboard/AgentDashboard').then(m => ({ default: m.AgentDashboard })));
const ControleurDashboard = lazy(() => import('../dashboard/ControleurDashboard').then(m => ({ default: m.ControleurDashboard })));

// Modals globaux (Lazy loaded)
const AuditTrailModal = lazy(() => import('../audit/AuditTrailModal').then(m => ({ default: m.AuditTrailModal })));
const UserManagementModal = lazy(() => import('../admin/UserManagementModal').then(m => ({ default: m.UserManagementModal })));
const SupabaseModal = lazy(() => import('../admin/SupabaseModal').then(m => ({ default: m.SupabaseModal })));
const AdvancedSearchModal = lazy(() => import('../search/AdvancedSearchModal').then(m => ({ default: m.AdvancedSearchModal })));
const OfficialStampModal = lazy(() => import('../common/OfficialStampModal').then(m => ({ default: m.OfficialStampModal })));
const DailyOperationsCenterModal = lazy(() => import('../operations/DailyOperationsCenterModal').then(m => ({ default: m.DailyOperationsCenterModal })));
const SecurityCenterModal = lazy(() => import('../security/SecurityCenterModal').then(m => ({ default: m.SecurityCenterModal })));
const TruckRegistryModal = lazy(() => import('../admin/TruckRegistryModal').then(m => ({ default: m.TruckRegistryModal })));
const TicketTimelineModal = lazy(() => import('../tickets/TicketTimelineModal').then(m => ({ default: m.TicketTimelineModal })));
const PortusAssistantModal = lazy(() => import('../assistant/PortusAssistantModal').then(m => ({ default: m.PortusAssistantModal })));
const ExpensesModule = lazy(() => import('../expenses/ExpensesModule').then(m => ({ default: m.ExpensesModule })));
const RemisesListModal = lazy(() => import('../remises/RemisesListModal').then(m => ({ default: m.RemisesListModal })));
const AgentBadgeModal = lazy(() => import('../agents/AgentBadgeModal').then(m => ({ default: m.AgentBadgeModal })));
const SaleFormModal = lazy(() => import('../sales/SaleFormModal').then(m => ({ default: m.SaleFormModal })));
const ChangePasswordModal = lazy(() => import('../common/ChangePasswordModal').then(m => ({ default: m.ChangePasswordModal })));

const LoadingFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-950 p-8 min-h-[60vh]">
    <div className="flex items-center gap-3 text-emerald-400">
      <Loader2 className="w-6 h-6 animate-spin" />
      <span className="text-xs font-bold tracking-wider uppercase text-slate-300">Chargement de l'espace de travail...</span>
    </div>
  </div>
);

export const AppLayoutShell: React.FC = () => {
  const { currentUser } = useAuth();
  const { triggerSOSAlert } = useData();

  const [activeTab, setActiveTab] = useState<ActiveNavTab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Modal states
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [supabaseModalOpen, setSupabaseModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [stampModalOpen, setStampModalOpen] = useState(false);
  const [dailyOpsModalOpen, setDailyOpsModalOpen] = useState(false);
  const [securityCenterModalOpen, setSecurityCenterModalOpen] = useState(false);
  const [vehiclesModalOpen, setVehiclesModalOpen] = useState(false);
  const [assistantModalOpen, setAssistantModalOpen] = useState(false);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [timelineTicketNumber, setTimelineTicketNumber] = useState<string | null>(null);
  const [expensesModalOpen, setExpensesModalOpen] = useState(false);
  const [remisesModalOpen, setRemisesModalOpen] = useState(false);
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  // SOS Modal
  const [sosConfirmOpen, setSosConfirmOpen] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const [sosMessage, setSosMessage] = useState('Urgence terrain / agression ou menace sur l\'agent');

  const handleTriggerSOS = async () => {
    setSosSending(true);
    try {
      await triggerSOSAlert(sosMessage);
      setSosConfirmOpen(false);
      showToast('success', 'Alerte SOS transmise', "Les coordinateurs et superviseurs ont été notifiés avec vos coordonnées GPS.");
    } catch (err: any) {
      showToast('error', "Échec de l'alerte SOS", err.message || 'Erreur inconnue');
    } finally {
      setSosSending(false);
    }
  };

  if (!currentUser) return null;

  // Module titles mapping
  const moduleTitles: Record<ActiveNavTab, string> = {
    dashboard: 'Tableau de bord',
    sales: 'Ventes & Carnets',
    remises: 'Remises & Clôtures de Caisse',
    vehicles: 'Registre Véhicules & Citernes',
    controls: 'Contrôles Routiers & Scans',
    team: 'Équipe & Badges Professionnels',
    security: 'Centre Sécurité & Traçabilité',
    audit: "Journal d'Audit Inaltérable",
    assistant: 'Assistant Opérationnel IA',
  };

  // Render content according to active sidebar tab or role
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        switch (currentUser.role) {
          case 'ADMINISTRATEUR':
            return <AdminDashboard />;
          case 'RESPONSABLE':
            return <ResponsableDashboard />;
          case 'AGENT':
            return <AgentDashboard />;
          case 'CONTROLEUR':
            return <ControleurDashboard />;
          default:
            return <AgentDashboard />;
        }
      case 'sales':
        return <AdminDashboard />;
      case 'remises':
        return <AdminDashboard />;
      case 'vehicles':
        return <AdminDashboard />;
      case 'controls':
        return <ControleurDashboard />;
      case 'team':
        return <AdminDashboard />;
      case 'security':
        return <AdminDashboard />;
      case 'audit':
        return <AdminDashboard />;
      case 'assistant':
        return <AdminDashboard />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Toast Notification Container */}
      <ToastNotificationContainer />

      {/* PWA Offline Indicator */}
      <OfflineIndicator />

      {/* Header Bar */}
      <AppHeader
        currentModuleTitle={moduleTitles[activeTab]}
        onOpenSearch={() => setSearchModalOpen(true)}
        onOpenAudit={() => setAuditModalOpen(true)}
        onOpenUsers={() => setUsersModalOpen(true)}
        onOpenSupabase={() => setSupabaseModalOpen(true)}
        onOpenDailyOps={() => setDailyOpsModalOpen(true)}
        onOpenSecurityCenter={() => setSecurityCenterModalOpen(true)}
        onOpenVehicles={() => setVehiclesModalOpen(true)}
        onOpenTimeline={() => {
          setTimelineTicketNumber(null);
          setTimelineModalOpen(true);
        }}
        onOpenBadge={() => setBadgeModalOpen(true)}
        onTriggerSOS={() => setSosConfirmOpen(true)}
        onOpenMobileMenu={() => setMobileDrawerOpen(true)}
      />

      {/* Main App Layout Grid (Sidebar + Viewport Canvas) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Collapsible Sidebar */}
        <AppSidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            if (tab === 'sales') setSaleModalOpen(true);
            if (tab === 'remises') setRemisesModalOpen(true);
            if (tab === 'vehicles') setVehiclesModalOpen(true);
            if (tab === 'team') setBadgeModalOpen(true);
            if (tab === 'security') setSecurityCenterModalOpen(true);
            if (tab === 'audit') setAuditModalOpen(true);
            if (tab === 'assistant') setAssistantModalOpen(true);
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onTriggerSOS={() => setSosConfirmOpen(true)}
          onOpenSearch={() => setSearchModalOpen(true)}
          onOpenSaleModal={() => setSaleModalOpen(true)}
        />

        {/* Viewport Canvas Content Area */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-8 p-3 sm:p-6 bg-slate-950">
          <Suspense fallback={<LoadingFallback />}>
            {renderTabContent()}
          </Suspense>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'remises') setRemisesModalOpen(true);
          if (tab === 'controls') setActiveTab('controls');
        }}
        onOpenMobileMenu={() => setMobileDrawerOpen(true)}
        onOpenSaleModal={() => setSaleModalOpen(true)}
      />

      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'sales') setSaleModalOpen(true);
          if (tab === 'remises') setRemisesModalOpen(true);
          if (tab === 'vehicles') setVehiclesModalOpen(true);
          if (tab === 'team') setBadgeModalOpen(true);
          if (tab === 'security') setSecurityCenterModalOpen(true);
          if (tab === 'audit') setAuditModalOpen(true);
          if (tab === 'assistant') setAssistantModalOpen(true);
        }}
        onOpenSearch={() => setSearchModalOpen(true)}
        onOpenDailyOps={() => setDailyOpsModalOpen(true)}
        onOpenSecurityCenter={() => setSecurityCenterModalOpen(true)}
        onOpenVehicles={() => setVehiclesModalOpen(true)}
        onOpenTimeline={() => {
          setTimelineTicketNumber(null);
          setTimelineModalOpen(true);
        }}
        onOpenBadge={() => setBadgeModalOpen(true)}
        onOpenUsers={() => setUsersModalOpen(true)}
        onOpenAudit={() => setAuditModalOpen(true)}
        onOpenSupabase={() => setSupabaseModalOpen(true)}
        onChangePassword={() => setChangePasswordOpen(true)}
      />

      {/* Global Modals loaded on demand */}
      <Suspense fallback={null}>
        {searchModalOpen && (
          <AdvancedSearchModal
            isOpen={searchModalOpen}
            onClose={() => setSearchModalOpen(false)}
          />
        )}
        {auditModalOpen && (
          <AuditTrailModal
            isOpen={auditModalOpen}
            onClose={() => setAuditModalOpen(false)}
          />
        )}
        {usersModalOpen && (
          <UserManagementModal
            isOpen={usersModalOpen}
            onClose={() => setUsersModalOpen(false)}
          />
        )}
        {supabaseModalOpen && (
          <SupabaseModal
            isOpen={supabaseModalOpen}
            onClose={() => setSupabaseModalOpen(false)}
          />
        )}
        {stampModalOpen && (
          <OfficialStampModal
            isOpen={stampModalOpen}
            onClose={() => setStampModalOpen(false)}
          />
        )}
        {dailyOpsModalOpen && (
          <DailyOperationsCenterModal
            isOpen={dailyOpsModalOpen}
            onClose={() => setDailyOpsModalOpen(false)}
            onOpenExpenses={() => setExpensesModalOpen(true)}
            onOpenRemises={() => setRemisesModalOpen(true)}
          />
        )}
        {securityCenterModalOpen && (
          <SecurityCenterModal
            isOpen={securityCenterModalOpen}
            onClose={() => setSecurityCenterModalOpen(false)}
          />
        )}
        {vehiclesModalOpen && (
          <TruckRegistryModal
            isOpen={vehiclesModalOpen}
            onClose={() => setVehiclesModalOpen(false)}
            onSelectTicket={(ticketNumber) => {
              setTimelineTicketNumber(ticketNumber);
              setTimelineModalOpen(true);
            }}
          />
        )}
        {timelineModalOpen && (
          <TicketTimelineModal
            isOpen={timelineModalOpen}
            onClose={() => setTimelineModalOpen(false)}
            ticketNumber={timelineTicketNumber}
          />
        )}
        {assistantModalOpen && (
          <PortusAssistantModal
            isOpen={assistantModalOpen}
            onClose={() => setAssistantModalOpen(false)}
          />
        )}
        {expensesModalOpen && (
          <ExpensesModule onClose={() => setExpensesModalOpen(false)} />
        )}
        {remisesModalOpen && (
          <RemisesListModal
            isOpen={remisesModalOpen}
            onClose={() => setRemisesModalOpen(false)}
          />
        )}
        {badgeModalOpen && (
          <AgentBadgeModal
            isOpen={badgeModalOpen}
            onClose={() => setBadgeModalOpen(false)}
          />
        )}
        {saleModalOpen && (
          <SaleFormModal
            isOpen={saleModalOpen}
            onClose={() => setSaleModalOpen(false)}
          />
        )}
        {changePasswordOpen && (
          <ChangePasswordModal
            isOpen={changePasswordOpen}
            onClose={() => setChangePasswordOpen(false)}
          />
        )}
      </Suspense>

      {/* SOS Modal */}
      {sosConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-in fade-in-50">
          <div className="w-full max-w-sm rounded-2xl border-2 border-rose-500 bg-slate-900 p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/40 animate-bounce">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                ⚠️ DÉCLENCHER ALERTE SOS ?
              </h3>
              <p className="text-xs text-rose-300 font-medium leading-relaxed">
                Cette action transmettra un signal de détresse avec votre identité et vos coordonnées GPS à tous les superviseurs.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Motif de l'urgence
              </label>
              <select
                value={sosMessage}
                onChange={(e) => setSosMessage(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-2.5 text-xs text-white focus:border-rose-500 focus:outline-hidden"
              >
                <option value="Urgence terrain / agression ou menace sur l'agent">⚠️ Menace physique / Agression</option>
                <option value="Accident routier grave sur le corridor">🚗 Accident routier grave</option>
                <option value="Contestation virulente / altercation chauffeur bloquant">Altercation / Chauffeur récalcitrant</option>
                <option value="Panne d'équipement ou problème réseau critique">Disponibilité terrain bloquée</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
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
                className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 py-2.5 text-xs font-black text-white shadow-lg shadow-rose-950 transition active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer"
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
    </div>
  );
};
