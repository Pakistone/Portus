import React, { useState, useMemo } from 'react';
import {
  QrCode,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  History,
  Radio,
  X,
  Users,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import { ACTIVE_TICKET_VALIDITY_DAYS } from '../../config/constants';
import { ControlScanModal } from '../controls/ControlScanModal';
import { FraudReportModal } from '../controls/FraudReportModal';
import { AgentDirectoryView } from '../agents/AgentDirectoryView';
import { showToast } from '../common/ToastNotification';

export const ControleurDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    controls,
    latestRealtimeIncident,
    dismissLatestIncident,
    isRealtimeConnected,
    triggerSOSAlert,
  } = useData();

  const [activeView, setActiveView] = useState<'directory' | 'history'>('directory');
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [fraudModalOpen, setFraudModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');
  const [sosSending, setSosSending] = useState(false);

  const myControls = useMemo(() => {
    return controls.filter((c) => c.controleurId === currentUser?.id);
  }, [controls, currentUser]);

  const displayedHistory = useMemo(() => {
    return myControls.filter((c) => {
      if (statusFilter === 'VALID' && !c.isValid) return false;
      if (statusFilter === 'INVALID' && c.isValid) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchPlate = c.plateNumber.toLowerCase().includes(q);
        const matchTicket = c.ticketNumber.toLowerCase().includes(q);
        const matchMsg = c.validationMessage?.toLowerCase().includes(q);
        return matchPlate || matchTicket || matchMsg;
      }
      return true;
    });
  }, [myControls, statusFilter, searchQuery]);

  const handleDirectSOS = async () => {
    if (!currentUser || sosSending) return;
    setSosSending(true);
    try {
      await triggerSOSAlert(
        `Alerte SOS Barrage Routier déclenchée par le Contrôleur ${currentUser.fullName} — Zone Portuaire Abidjan.`
      );
      showToast(
        'error',
        '🚨 ALERTE SOS TRANSMISE',
        'Votre alerte de sécurité routière a été envoyée immédiatement aux superviseurs et administrateurs.'
      );
    } catch {
      showToast(
        'warning',
        'Alerte SOS enregistrée',
        'Signalement enregistré localement et mis en file de synchronisation prioritaire.'
      );
    } finally {
      setSosSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 space-y-5">
      {/* En-tête Contrôleur */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase font-black tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
              Poste de Contrôle Routier U.J.P.A.S.
            </span>
            <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
              Validité stricte : {ACTIVE_TICKET_VALIDITY_DAYS} jours
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>{isRealtimeConnected ? 'Realtime Actif' : 'Mode Local'}</span>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
            Contrôle Terrain &amp; Trombinoscope ({currentUser?.fullName})
          </h2>
          <p className="text-xs text-slate-400">
            Vérification QR Code / Plaque CEDEAO ({ACTIVE_TICKET_VALIDITY_DAYS} jours) et confrontation visuelle des agents U.J.P.A.S.
          </p>
        </div>
      </div>

      {/* Alerte Incident en Direct */}
      {latestRealtimeIncident && (
        <div className="rounded-2xl border-2 border-rose-500 bg-rose-950/80 p-4 sm:p-5 shadow-2xl shadow-rose-950 text-white space-y-3.5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-lg animate-bounce">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                    🚨 ALERTE INCIDENT EN DIRECT
                  </span>
                  <span className="text-xs text-rose-300 font-mono">
                    {latestRealtimeIncident.reportedTime}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white mt-0.5">
                  {latestRealtimeIncident.typeLabel ||
                    latestRealtimeIncident.reason ||
                    'Incident de Sécurité Routière'}
                </h3>
              </div>
            </div>
            <button
              onClick={dismissLatestIncident}
              className="text-rose-300 hover:text-white p-1 rounded-lg hover:bg-rose-900/50 cursor-pointer"
              title="Fermer l'alerte"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-slate-900/90 rounded-xl p-3.5 border border-rose-500/40">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">
                Immatriculation Véhicule
              </span>
              <span className="font-mono text-base font-black text-amber-400">
                {formatPlateDisplay(latestRealtimeIncident.plateNumber)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">
                Signalé Par
              </span>
              <span className="font-bold text-white">
                {latestRealtimeIncident.controleurName || 'Équipe Contrôle'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">
                Observation Terrain
              </span>
              <span className="text-slate-200 truncate block">
                {latestRealtimeIncident.comment || 'Aucune observation saisie'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => {
                dismissLatestIncident();
                setScanModalOpen(true);
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 py-2.5 px-4 text-xs font-bold text-white text-center shadow-lg transition cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>Intercepter &amp; Vérifier ce Véhicule</span>
            </button>
            <button
              onClick={dismissLatestIncident}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 px-4 text-xs font-bold text-slate-300 transition cursor-pointer"
            >
              Masquer
            </button>
          </div>
        </div>
      )}

      {/* Actions Principales : Scanner QR / Vérifier Plaque & Signaler une Fraude / SOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <button
          id="btn-controleur-scan"
          onClick={() => setScanModalOpen(true)}
          className="relative overflow-hidden rounded-2xl bg-linear-to-r from-orange-600 via-orange-500 to-amber-500 p-4 sm:p-5 text-left text-white shadow-xl shadow-orange-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-orange-400/40 group"
        >
          <div className="absolute right-3 top-3 opacity-20 group-hover:opacity-30 transition pointer-events-none">
            <QrCode className="w-16 h-16 text-white" />
          </div>
          <div className="relative z-10 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                Contrôle Validité {ACTIVE_TICKET_VALIDITY_DAYS} Jours
              </span>
              <h4 className="text-lg sm:text-xl font-black text-white">
                Scanner un Ticket QR / Vérifier Plaque
              </h4>
              <p className="text-xs text-orange-100/90 mt-0.5">
                Scanner le QR Code du ticket ou rechercher l&apos;immatriculation du camion
              </p>
            </div>
          </div>
        </button>

        <div className="flex flex-col gap-2">
          <button
            id="btn-controleur-fraud"
            onClick={() => setFraudModalOpen(true)}
            className="flex-1 relative overflow-hidden rounded-2xl bg-linear-to-r from-rose-700 via-rose-600 to-amber-600 p-4 text-left text-white shadow-xl shadow-rose-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-rose-400/40 group"
          >
            <div className="relative z-10 flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base sm:text-lg font-black text-white">
                  🚨 Signaler une Fraude / SOS
                </h4>
                <p className="text-xs text-rose-100/90 mt-0.5">
                  Faux ticket, ticket expiré, usurpation ou refus d&apos;obtempérer
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={handleDirectSOS}
            disabled={sosSending}
            className="rounded-xl bg-rose-950/90 hover:bg-rose-900 border border-rose-500/40 py-2 px-3 text-xs font-bold text-rose-200 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>
              {sosSending
                ? 'Transmission SOS en cours...'
                : 'Envoyer un SOS Immédiat (1 clic) au Centre U.J.P.A.S.'}
            </span>
          </button>
        </div>
      </div>

      {/* Sélecteur de Vue : Trombinoscope des Agents (par défaut) & Historique des Contrôles */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveView('directory')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
            activeView === 'directory'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Trombinoscope des Agents (Confrontation Chauffeur)</span>
        </button>
        <button
          onClick={() => setActiveView('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            activeView === 'history'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-950'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Mes Contrôles Récents ({myControls.length})</span>
        </button>
      </div>

      {activeView === 'directory' ? (
        <AgentDirectoryView embedded />
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white">Mes Derniers Contrôles Effectués</h3>
              <p className="text-xs text-slate-400">
                {displayedHistory.length} contrôle(s) affiché(s)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'ALL' | 'VALID' | 'INVALID')
                }
                className="rounded-xl border border-slate-700 bg-slate-800 py-1.5 px-3 text-xs text-white focus:border-amber-500"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="VALID">Valides uniquement</option>
                <option value="INVALID">Rejetés uniquement</option>
              </select>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrer par plaque ou numéro de ticket..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white focus:border-amber-500 focus:outline-hidden"
            />
          </div>

          {displayedHistory.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Aucun contrôle enregistré.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {displayedHistory.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{c.ticketNumber}</span>
                      <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {formatPlateDisplay(c.plateNumber)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>
                        {formatDateTime(c.controlledAt)} • {c.validationMessage}
                      </span>
                    </p>
                  </div>
                  <div>
                    {c.isValid ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> VALIDE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                        <XCircle className="w-3.5 h-3.5" /> REJETÉ
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modales strictement autorisées pour le Contrôleur */}
      <ControlScanModal isOpen={scanModalOpen} onClose={() => setScanModalOpen(false)} />
      <FraudReportModal isOpen={fraudModalOpen} onClose={() => setFraudModalOpen(false)} />
    </div>
  );
};
