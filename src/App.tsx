import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { Header } from './components/common/Header';
import { LoginView } from './components/auth/LoginView';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastNotificationContainer } from './components/common/ToastNotification';
import { Loader2 } from 'lucide-react';

// Dashboards par rôle (Lazy loaded)
const AdminDashboard = lazy(() => import('./components/dashboard/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const ResponsableDashboard = lazy(() => import('./components/dashboard/ResponsableDashboard').then(m => ({ default: m.ResponsableDashboard })));
const AgentDashboard = lazy(() => import('./components/dashboard/AgentDashboard').then(m => ({ default: m.AgentDashboard })));
const ControleurDashboard = lazy(() => import('./components/dashboard/ControleurDashboard').then(m => ({ default: m.ControleurDashboard })));

// Modals accessibles globalement (Lazy loaded)
const AuditTrailModal = lazy(() => import('./components/audit/AuditTrailModal').then(m => ({ default: m.AuditTrailModal })));
const UserManagementModal = lazy(() => import('./components/admin/UserManagementModal').then(m => ({ default: m.UserManagementModal })));
const SupabaseModal = lazy(() => import('./components/admin/SupabaseModal').then(m => ({ default: m.SupabaseModal })));
const AdvancedSearchModal = lazy(() => import('./components/search/AdvancedSearchModal').then(m => ({ default: m.AdvancedSearchModal })));
const OfficialStampModal = lazy(() => import('./components/common/OfficialStampModal').then(m => ({ default: m.OfficialStampModal })));
const DailyOperationsCenterModal = lazy(() => import('./components/operations/DailyOperationsCenterModal').then(m => ({ default: m.DailyOperationsCenterModal })));
const SecurityCenterModal = lazy(() => import('./components/security/SecurityCenterModal').then(m => ({ default: m.SecurityCenterModal })));
const TruckRegistryModal = lazy(() => import('./components/admin/TruckRegistryModal').then(m => ({ default: m.TruckRegistryModal })));
const TicketTimelineModal = lazy(() => import('./components/tickets/TicketTimelineModal').then(m => ({ default: m.TicketTimelineModal })));
const PortusAssistantModal = lazy(() => import('./components/assistant/PortusAssistantModal').then(m => ({ default: m.PortusAssistantModal })));
const ExpensesModule = lazy(() => import('./components/expenses/ExpensesModule').then(m => ({ default: m.ExpensesModule })));
const RemisesListModal = lazy(() => import('./components/remises/RemisesListModal').then(m => ({ default: m.RemisesListModal })));
const AgentBadgeModal = lazy(() => import('./components/agents/AgentBadgeModal').then(m => ({ default: m.AgentBadgeModal })));

const LoadingFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-950 p-6">
    <div className="flex items-center gap-3 text-emerald-400">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-xs font-bold tracking-wider uppercase text-slate-300">Chargement en cours...</span>
    </div>
  </div>
);

const AppContent: React.FC = () => {
  const { currentUser } = useAuth();

  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [supabaseModalOpen, setSupabaseModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [stampModalOpen, setStampModalOpen] = useState(false);

  // Nouveaux centres opérationnels
  const [dailyOpsModalOpen, setDailyOpsModalOpen] = useState(false);
  const [securityCenterModalOpen, setSecurityCenterModalOpen] = useState(false);
  const [vehiclesModalOpen, setVehiclesModalOpen] = useState(false);
  const [assistantModalOpen, setAssistantModalOpen] = useState(false);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [timelineTicketNumber, setTimelineTicketNumber] = useState<string | null>(null);
  const [expensesModalOpen, setExpensesModalOpen] = useState(false);
  const [remisesModalOpen, setRemisesModalOpen] = useState(false);
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);

  // Écoute de l'événement système pour afficher la chronologie d'un ticket spécifique
  useEffect(() => {
    const handleOpenTimeline = (e: any) => {
      if (e.detail?.ticketNumber) {
        setTimelineTicketNumber(e.detail.ticketNumber);
        setTimelineModalOpen(true);
      }
    };

    window.addEventListener('portus-open-ticket-timeline', handleOpenTimeline);
    return () => {
      window.removeEventListener('portus-open-ticket-timeline', handleOpenTimeline);
    };
  }, []);

  // Si l'utilisateur n'est pas connecté, afficher la page de connexion
  if (!currentUser) {
    return (
      <>
        <OfflineIndicator />
        <LoginView />
      </>
    );
  }

  // Rendu conditionnel du tableau de bord selon le rôle de l'utilisateur (4 rôles officiels)
  const renderDashboard = () => {
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
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Toast notifications flottantes système */}
      <ToastNotificationContainer />

      {/* Indicateur de connectivité PWA */}
      <OfflineIndicator />

      {/* Barre supérieure commune */}
      <Header
        onOpenAudit={() => setAuditModalOpen(true)}
        onOpenUsers={() => setUsersModalOpen(true)}
        onOpenSupabase={() => setSupabaseModalOpen(true)}
        onOpenSearch={() => setSearchModalOpen(true)}
        onOpenStamp={() => setStampModalOpen(true)}
        onOpenDailyOps={() => setDailyOpsModalOpen(true)}
        onOpenSecurityCenter={() => setSecurityCenterModalOpen(true)}
        onOpenVehicles={() => setVehiclesModalOpen(true)}
        onOpenAssistant={() => setAssistantModalOpen(true)}
        onOpenTimeline={() => {
          setTimelineTicketNumber(null);
          setTimelineModalOpen(true);
        }}
        onOpenBadge={() => setBadgeModalOpen(true)}
      />

      {/* Contenu principal selon le rôle avec Suspense */}
      <main className="flex-1 pb-6">
        <Suspense fallback={<LoadingFallback />}>
          {renderDashboard()}
        </Suspense>
      </main>

      {/* Modals globaux standards avec Suspense */}
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

        {/* Nouveaux centres opérationnels intégrés */}
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

        {/* Modules financiers connectés */}
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
      </Suspense>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DataProvider>
          <AppContent />
        </DataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
