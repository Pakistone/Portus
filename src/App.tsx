import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { LoginView } from './components/auth/LoginView';
import { AdminDashboard } from './components/dashboard/AdminDashboard';
import { ResponsableDashboard } from './components/dashboard/ResponsableDashboard';
import { AgentDashboard } from './components/dashboard/AgentDashboard';
import { ControleurDashboard } from './components/dashboard/ControleurDashboard';
import {
  ToastNotificationContainer,
  showToast,
} from './components/common/ToastNotification';
import { AppHeader } from './components/navigation/AppHeader';
import { AdvancedSearchModal } from './components/search/AdvancedSearchModal';
import { ChangePasswordModal } from './components/common/ChangePasswordModal';

const MainRouter: React.FC = () => {
  const { currentUser } = useAuth();
  const { isLoading, triggerSOSAlert } = useData();

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const isAdmin = currentUser?.role === 'ADMINISTRATEUR';
  const isResponsable = currentUser?.role === 'RESPONSABLE';
  const isAgent = currentUser?.role === 'AGENT';
  const isControleur = currentUser?.role === 'CONTROLEUR';

  // Raccourci clavier global Ctrl+K / Cmd+K réservé à l'Administrateur et au Responsable
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (isAdmin || isResponsable) {
          e.preventDefault();
          setSearchModalOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin, isResponsable]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 gap-3">
        <div className="w-10 h-10 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
        <p className="text-xs font-mono uppercase tracking-widest text-slate-400">
          Initialisation du système PORTUS — U.J.P.A.S....
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView />;
  }

  const handleTriggerSOS = async () => {
    try {
      await triggerSOSAlert(
        `Alerte SOS Urgence Terrain déclenchée par ${currentUser.fullName} (${currentUser.role}) — Zone Portuaire Abidjan.`
      );
      showToast(
        'error',
        '🚨 ALERTE SOS TRANSMISE',
        'Votre position GPS et votre alerte ont été transmises au centre de supervision U.J.P.A.S.'
      );
    } catch {
      showToast(
        'warning',
        'Alerte SOS locale enregistrée',
        'Signalement enregistré localement et mis en file de synchronisation prioritaire.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Barre de Navigation Unique adaptée au rôle */}
      <AppHeader
        onOpenSearch={() => {
          if (isAdmin || isResponsable) {
            setSearchModalOpen(true);
          }
        }}
        onTriggerSOS={handleTriggerSOS}
        onOpenPasswordModal={() => setPasswordModalOpen(true)}
      />

      {/* Contenu Principal strictement isolé par rôle */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-5 py-4 pb-12">
        {isAdmin && <AdminDashboard />}
        {isResponsable && <ResponsableDashboard />}
        {isAgent && <AgentDashboard />}
        {isControleur && <ControleurDashboard />}
      </main>

      {(isAdmin || isResponsable) && (
        <AdvancedSearchModal
          isOpen={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
        />
      )}

      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <MainRouter />
        <ToastNotificationContainer />
      </DataProvider>
    </AuthProvider>
  );
}

export default App;
