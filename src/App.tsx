import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { LoginView } from './components/auth/LoginView';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastNotificationContainer, showToast } from './components/common/ToastNotification';
import { Loader2 } from 'lucide-react';

// Shell Navigation Adaptative (Desktop Sidebar, Top Header & Mobile Bottom Nav)
import { AppSidebar } from './components/navigation/AppSidebar';
import { AppHeader } from './components/navigation/AppHeader';
import { MobileBottomNav } from './components/navigation/MobileBottomNav';

// Dashboards par rôle (Lazy loaded)
const AdminDashboard = lazy(() =>
  import('./components/dashboard/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const ResponsableDashboard = lazy(() =>
  import('./components/dashboard/ResponsableDashboard').then((m) => ({ default: m.ResponsableDashboard }))
);
const AgentDashboard = lazy(() =>
  import('./components/dashboard/AgentDashboard').then((m) => ({ default: m.AgentDashboard }))
);
const ControleurDashboard = lazy(() =>
  import('./components/dashboard/ControleurDashboard').then((m) => ({ default: m.ControleurDashboard }))
);

// Modals accessibles globalement (Lazy loaded)
const SaleFormModal = lazy(() =>
  import('./components/sales/SaleFormModal').then((m) => ({ default: m.SaleFormModal }))
);
const RemiseFormModal = lazy(() =>
  import('./components/remises/RemiseFormModal').then((m) => ({ default: m.RemiseFormModal }))
);
const ControlScanModal = lazy(() =>
  import('./components/controls/ControlScanModal').then((m) => ({ default: m.ControlScanModal }))
);
const CarnetManagementModal = lazy(() =>
  import('./components/tickets/CarnetManagementModal').then((m) => ({ default: m.CarnetManagementModal }))
);
const UserManagementModal = lazy(() =>
  import('./components/admin/UserManagementModal').then((m) => ({ default: m.UserManagementModal }))
);
const AgentBadgeModal = lazy(() =>
  import('./components/agents/AgentBadgeModal').then((m) => ({ default: m.AgentBadgeModal }))
);
const AdvancedSearchModal = lazy(() =>
  import('./components/search/AdvancedSearchModal').then((m) => ({ default: m.AdvancedSearchModal }))
);
const FraudManagementModal = lazy(() =>
  import('./components/admin/FraudManagementModal').then((m) => ({ default: m.FraudManagementModal }))
);
const AuditTrailModal = lazy(() =>
  import('./components/audit/AuditTrailModal').then((m) => ({ default: m.AuditTrailModal }))
);
const AdminSettingsModal = lazy(() =>
  import('./components/admin/AdminSettingsModal').then((m) => ({ default: m.AdminSettingsModal }))
);
const SupabaseModal = lazy(() =>
  import('./components/admin/SupabaseModal').then((m) => ({ default: m.SupabaseModal }))
);
const TicketTimelineModal = lazy(() =>
  import('./components/tickets/TicketTimelineModal').then((m) => ({ default: m.TicketTimelineModal }))
);

const LoadingFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-950 p-6 min-h-[50vh]">
    <div className="flex items-center gap-3 text-emerald-400">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-xs font-bold tracking-wider uppercase text-slate-300">
        Chargement de l'espace PORTUS...
      </span>
    </div>
  </div>
);

const AppContent: React.FC = () => {
  const { currentUser } = useAuth();
  const { triggerSOSAlert } = useData();

  // Navigation State
  const [activeModule, setActiveModule] = useState('dashboard');

  // Modals global states
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [remiseModalOpen, setRemiseModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [carnetModalOpen, setCarnetModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [fraudsModalOpen, setFraudsModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [supabaseModalOpen, setSupabaseModalOpen] = useState(false);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [timelineTicketNumber, setTimelineTicketNumber] = useState<string | null>(null);

  // Écoute de l'événement système pour la chronologie d'un ticket
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

  const handleTriggerSOS = async () => {
    try {
      await triggerSOSAlert('Alerte d’urgence déclenchée depuis la barre de navigation');
      showToast(
        'success',
        '🚨 ALERTE SOS TRANSMISE',
        'Les coordinateurs terrain et la brigade de contrôle ont été notifiés de votre position GPS.'
      );
    } catch (err: any) {
      showToast('error', "Échec de l'alerte SOS", err?.message || 'Erreur réseau');
    }
  };

  // Si non connecté -> Écran d'authentification
  if (!currentUser) {
    return (
      <>
        <OfflineIndicator />
        <LoginView />
      </>
    );
  }

  const role = currentUser.role;

  // Helper pour vérifier et ouvrir une modale de manière sécurisée par rôle (RBAC)
  const openModalSecurely = (modalSetter: (val: boolean) => void, allowedRoles: string[]) => {
    if (allowedRoles.includes(role)) {
      modalSetter(true);
    } else {
      showToast('error', 'Accès Refusé', `Votre rôle (${role}) ne possède pas la permission d'accéder à ce module.`);
    }
  };

  // Label dynamique du module actif pour le Header
  const getModuleName = () => {
    switch (activeModule) {
      case 'dashboard':
        return 'Tableau de Bord';
      case 'sale':
        return 'Saisie Vente Express';
      case 'remise':
        return 'Encaissements & Remises';
      case 'scan':
        return 'Contrôle & Scan QR 14J';
      case 'carnets':
        return 'Gestion des Carnets';
      case 'users':
        return 'Équipe & Trombinoscope';
      case 'badges':
        return 'Badges Professionnels';
      case 'search':
        return 'Recherches & Exports';
      case 'frauds':
        return 'Incidents & Signalements';
      case 'audit':
        return 'Audit Logs & Clôtures';
      case 'settings':
        return 'Paramètres & Tarifs';
      default:
        return 'Tableau de Bord';
    }
  };

  // Dashboard par rôle avec vérification RBAC stricte
  const renderDashboard = () => {
    switch (role) {
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col sm:flex-row font-sans selection:bg-emerald-500 selection:text-white">
      {/* Toast Notifications système */}
      <ToastNotificationContainer />

      {/* PWA Network Status Bar */}
      <OfflineIndicator />

      {/* SIDEBAR LATÉRALE RÉTRACTABLE DESKTOP (Hidden on mobile) */}
      <AppSidebar
        activeModule={activeModule}
        onSelectModule={(key) => setActiveModule(key)}
        onOpenSale={() => openModalSecurely(setSaleModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT'])}
        onOpenRemise={() => openModalSecurely(setRemiseModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT'])}
        onOpenScan={() => openModalSecurely(setScanModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'CONTROLEUR'])}
        onOpenCarnets={() => openModalSecurely(setCarnetModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE'])}
        onOpenUsers={() => openModalSecurely(setUsersModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'CONTROLEUR'])}
        onOpenBadges={() => openModalSecurely(setBadgeModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE'])}
        onOpenSearch={() => openModalSecurely(setSearchModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'])}
        onOpenFrauds={() => openModalSecurely(setFraudsModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'])}
        onOpenAudit={() => openModalSecurely(setAuditModalOpen, ['ADMINISTRATEUR'])}
        onOpenSettings={() => openModalSecurely(setSettingsModalOpen, ['ADMINISTRATEUR'])}
        onTriggerSOS={handleTriggerSOS}
      />

      {/* ZONE PRINCIPALE DE L'APPLICATION */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 sm:pb-0">
        {/* TOPBAR HEADER CONTEXTUELLE */}
        <AppHeader
          currentModuleName={getModuleName()}
          onOpenSearch={() => openModalSecurely(setSearchModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'])}
          onOpenAudit={() => openModalSecurely(setAuditModalOpen, ['ADMINISTRATEUR'])}
          onOpenUsers={() => openModalSecurely(setUsersModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'CONTROLEUR'])}
          onOpenSupabase={() => openModalSecurely(setSupabaseModalOpen, ['ADMINISTRATEUR'])}
          onTriggerSOS={handleTriggerSOS}
        />

        {/* CONTENU PRINCIPAL DE L'APPLICATION */}
        <main className="flex-1 p-3 sm:p-6 overflow-y-auto">
          <Suspense fallback={<LoadingFallback />}>{renderDashboard()}</Suspense>
        </main>
      </div>

      {/* BARRE TACTILE BASSE MOBILE (Hidden on desktop) */}
      <MobileBottomNav
        activeTab={activeModule}
        onSelectTab={(key) => setActiveModule(key)}
        onOpenSale={() => openModalSecurely(setSaleModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT'])}
        onOpenRemise={() => openModalSecurely(setRemiseModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT'])}
        onOpenScan={() => openModalSecurely(setScanModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'CONTROLEUR'])}
        onOpenCarnets={() => openModalSecurely(setCarnetModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE'])}
        onOpenUsers={() => openModalSecurely(setUsersModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'CONTROLEUR'])}
        onOpenBadges={() => openModalSecurely(setBadgeModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE'])}
        onOpenSearch={() => openModalSecurely(setSearchModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'])}
        onOpenFrauds={() => openModalSecurely(setFraudsModalOpen, ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'])}
        onOpenAudit={() => openModalSecurely(setAuditModalOpen, ['ADMINISTRATEUR'])}
        onOpenSettings={() => openModalSecurely(setSettingsModalOpen, ['ADMINISTRATEUR'])}
        onTriggerSOS={handleTriggerSOS}
      />

      {/* MODALS GLOBAUX STRICTEMENT VERROUILLÉS PAR RÔLE (BLINDAGE RBAC) */}
      <Suspense fallback={null}>
        {saleModalOpen && ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT'].includes(role) && (
          <SaleFormModal isOpen={saleModalOpen} onClose={() => setSaleModalOpen(false)} />
        )}
        {remiseModalOpen && ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT'].includes(role) && (
          <RemiseFormModal isOpen={remiseModalOpen} onClose={() => setRemiseModalOpen(false)} />
        )}
        {scanModalOpen && ['ADMINISTRATEUR', 'RESPONSABLE', 'CONTROLEUR'].includes(role) && (
          <ControlScanModal isOpen={scanModalOpen} onClose={() => setScanModalOpen(false)} />
        )}
        {carnetModalOpen && ['ADMINISTRATEUR', 'RESPONSABLE'].includes(role) && (
          <CarnetManagementModal isOpen={carnetModalOpen} onClose={() => setCarnetModalOpen(false)} />
        )}
        {usersModalOpen && ['ADMINISTRATEUR', 'RESPONSABLE', 'CONTROLEUR'].includes(role) && (
          <UserManagementModal isOpen={usersModalOpen} onClose={() => setUsersModalOpen(false)} />
        )}
        {badgeModalOpen && ['ADMINISTRATEUR', 'RESPONSABLE'].includes(role) && (
          <AgentBadgeModal isOpen={badgeModalOpen} onClose={() => setBadgeModalOpen(false)} />
        )}
        {searchModalOpen && (
          <AdvancedSearchModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
        )}
        {fraudsModalOpen && (
          <FraudManagementModal isOpen={fraudsModalOpen} onClose={() => setFraudsModalOpen(false)} />
        )}
        {auditModalOpen && role === 'ADMINISTRATEUR' && (
          <AuditTrailModal isOpen={auditModalOpen} onClose={() => setAuditModalOpen(false)} />
        )}
        {settingsModalOpen && role === 'ADMINISTRATEUR' && (
          <AdminSettingsModal isOpen={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
        )}
        {supabaseModalOpen && role === 'ADMINISTRATEUR' && (
          <SupabaseModal isOpen={supabaseModalOpen} onClose={() => setSupabaseModalOpen(false)} />
        )}
        {timelineModalOpen && (
          <TicketTimelineModal
            isOpen={timelineModalOpen}
            onClose={() => setTimelineModalOpen(false)}
            ticketNumber={timelineTicketNumber}
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
