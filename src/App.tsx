import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { Header } from './components/common/Header';
import { LoginView } from './components/auth/LoginView';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Dashboards par rôle
import { AdminDashboard } from './components/dashboard/AdminDashboard';
import { ResponsableDashboard } from './components/dashboard/ResponsableDashboard';
import { AgentDashboard } from './components/dashboard/AgentDashboard';
import { ControleurDashboard } from './components/dashboard/ControleurDashboard';

// Modals accessibles globalement (Header & Navigation)
import { AuditTrailModal } from './components/audit/AuditTrailModal';
import { UserManagementModal } from './components/admin/UserManagementModal';
import { SupabaseModal } from './components/admin/SupabaseModal';
import { AdvancedSearchModal } from './components/search/AdvancedSearchModal';
import { OfficialStampModal } from './components/common/OfficialStampModal';
import { DailyOperationsCenterModal } from './components/operations/DailyOperationsCenterModal';
import { SecurityCenterModal } from './components/security/SecurityCenterModal';
import { TruckRegistryModal } from './components/admin/TruckRegistryModal';
import { TicketTimelineModal } from './components/tickets/TicketTimelineModal';
import { PortusAssistantModal } from './components/assistant/PortusAssistantModal';
import { ExpensesModule } from './components/expenses/ExpensesModule';
import { RemisesListModal } from './components/remises/RemisesListModal';
import { AgentBadgeModal } from './components/agents/AgentBadgeModal';

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

  // Rendu conditionnel du tableau de bord selon le rôle de l'utilisateur
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
      case 'CAISSIER':
      case 'FINANCE':
        return <ResponsableDashboard />;
      case 'AUDITEUR':
        return <AdminDashboard />;
      default:
        return <AgentDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
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

      {/* Contenu principal selon le rôle */}
      <main className="flex-1 pb-12">{renderDashboard()}</main>

      {/* Modals globaux standards */}
      <AdvancedSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
      <AuditTrailModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      />
      <UserManagementModal
        isOpen={usersModalOpen}
        onClose={() => setUsersModalOpen(false)}
      />
      <SupabaseModal
        isOpen={supabaseModalOpen}
        onClose={() => setSupabaseModalOpen(false)}
      />
      <OfficialStampModal
        isOpen={stampModalOpen}
        onClose={() => setStampModalOpen(false)}
      />

      {/* Nouveaux centres opérationnels intégrés */}
      <DailyOperationsCenterModal
        isOpen={dailyOpsModalOpen}
        onClose={() => setDailyOpsModalOpen(false)}
        onOpenExpenses={() => setExpensesModalOpen(true)}
        onOpenRemises={() => setRemisesModalOpen(true)}
      />
      <SecurityCenterModal
        isOpen={securityCenterModalOpen}
        onClose={() => setSecurityCenterModalOpen(false)}
      />
      <TruckRegistryModal
        isOpen={vehiclesModalOpen}
        onClose={() => setVehiclesModalOpen(false)}
        onSelectTicket={(ticketNumber) => {
          setTimelineTicketNumber(ticketNumber);
          setTimelineModalOpen(true);
        }}
      />
      <TicketTimelineModal
        isOpen={timelineModalOpen}
        onClose={() => setTimelineModalOpen(false)}
        ticketNumber={timelineTicketNumber}
      />
      <PortusAssistantModal
        isOpen={assistantModalOpen}
        onClose={() => setAssistantModalOpen(false)}
      />

      {/* Modules financiers connectés */}
      {expensesModalOpen && (
        <ExpensesModule onClose={() => setExpensesModalOpen(false)} />
      )}
      <RemisesListModal
        isOpen={remisesModalOpen}
        onClose={() => setRemisesModalOpen(false)}
      />
      <AgentBadgeModal
        isOpen={badgeModalOpen}
        onClose={() => setBadgeModalOpen(false)}
      />
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
