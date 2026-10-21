import React, { useState, useMemo } from 'react';
import {
  QrCode,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  MapPin,
  Clock,
  Filter,
  Calendar,
  Search,
  History,
  ShieldCheck,
  AlertTriangle,
  Radio,
  BellRing,
  X,
  Eye,
  Zap,
  Volume2,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import {
  PeriodSelector,
  PeriodFilterState,
  filterItemByPeriod,
} from './DashboardCharts';

// Modals
import { ControlScanModal } from '../controls/ControlScanModal';
import { FraudReportModal } from '../controls/FraudReportModal';
import { ControlsListModal } from '../controls/ControlsListModal';
import { AdvancedSearchModal } from '../search/AdvancedSearchModal';
import { AgentDirectoryView } from '../agents/AgentDirectoryView';

export const ControleurDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    controls,
    fraudReports,
    latestRealtimeIncident,
    dismissLatestIncident,
    isRealtimeConnected,
    simulateIncidentForTesting,
  } = useData();

  const [activeTab, setActiveTab] = useState<'controls' | 'directory' | 'incidents'>('controls');
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [fraudModalOpen, setFraudModalOpen] = useState(false);
  const [controlsListOpen, setControlsListOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // Filtre temporel pour le contrôleur
  const [period, setPeriod] = useState<PeriodFilterState>({ type: 'today' });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');

  // Contrôles du contrôleur connecté
  const myControls = useMemo(() => {
    return controls.filter((c) => c.controleurId === currentUser?.id);
  }, [controls, currentUser]);

  const myFrauds = useMemo(() => {
    return fraudReports.filter((f) => f.controleurId === currentUser?.id);
  }, [fraudReports, currentUser]);

  // 1. Contrôles du jour
  const todayPeriodState: PeriodFilterState = { type: 'today' };
  const todayControls = useMemo(() => {
    return myControls.filter((c) => filterItemByPeriod(c.controlledAt, todayPeriodState));
  }, [myControls]);

  // 2. Contrôles de la période sélectionnée
  const periodControls = useMemo(() => {
    return myControls.filter((c) => filterItemByPeriod(c.controlledAt, period));
  }, [myControls, period]);

  const periodValidCount = useMemo(() => {
    return periodControls.filter((c) => c.isValid).length;
  }, [periodControls]);

  const periodInvalidCount = useMemo(() => {
    return periodControls.filter((c) => !c.isValid).length;
  }, [periodControls]);

  // 3. Signalements de fraude sur la période & total
  const periodFrauds = useMemo(() => {
    return myFrauds.filter((f) => filterItemByPeriod(f.reportedAt, period));
  }, [myFrauds, period]);

  // 4. Historique filtré pour l'affichage
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

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 space-y-5">
      {/* ========================================================================= */}
      {/* EN-TÊTE CONTRÔLEUR                                                        */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase font-black tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Poste de Contrôle Routier
            </span>
            <span className="text-[11px] text-slate-400">
              {currentUser?.fullName}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
            Tableau de Bord Contrôleur
          </h2>
          <p className="text-xs text-slate-400">
            Scan QR Code sur le terrain, détection des fraudes et procès-verbaux de contrôle.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setSearchModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-slate-700 transition cursor-pointer"
            title="Rechercher par ticket ou immatriculation"
          >
            <Search className="w-4 h-4 text-amber-400" />
            <span>Rechercher</span>
          </button>
          <button
            onClick={() => setControlsListOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <History className="w-4 h-4 text-amber-400" />
            <span>Registre Complet ({myControls.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BANDEAU STATUT SUPABASE REALTIME                                          */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl bg-slate-900 border border-slate-800 p-3 text-xs shadow-lg">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRealtimeConnected ? 'bg-emerald-400 opacity-75' : 'bg-amber-400 opacity-75'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isRealtimeConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          </span>
          <div>
            <span className="font-bold text-white flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Surveillance Supabase Realtime Active</span>
            </span>
            <p className="text-[11px] text-slate-400">
              {isRealtimeConnected
                ? 'Canal d’écoute instantané branché sur le corridor Vridi (alertes sonores & visuelles)'
                : 'Connexion réseau Realtime en cours...'}
            </p>
          </div>
        </div>

        <button
          onClick={() => simulateIncidentForTesting()}
          className="self-start sm:self-auto flex items-center gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
          title="Déclencher une simulation d'incident pour tester l'alerte sonore et visuelle"
        >
          <Volume2 className="w-3.5 h-3.5 text-amber-400" />
          <span>Tester Alerte Sonore & Visuelle</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* BANDEAU D'ALERTE EN DIRECT (POPUP REALTIME URGENT)                        */}
      {/* ========================================================================= */}
      {latestRealtimeIncident && (
        <div className="rounded-2xl border-2 border-rose-500 bg-rose-950/80 p-4 sm:p-5 shadow-2xl shadow-rose-950 text-white space-y-3.5 animate-fadeIn">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-lg animate-bounce">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-xs">
                    🚨 ALERTE INCIDENT EN DIRECT
                  </span>
                  <span className="text-xs text-rose-300 font-mono">
                    {latestRealtimeIncident.reportedTime}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white mt-0.5">
                  {latestRealtimeIncident.typeLabel || latestRealtimeIncident.reason || 'Incident de Sécurité Routière'}
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
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Immatriculation Véhicule</span>
              <span className="font-mono text-base font-black text-amber-400">
                {formatPlateDisplay(latestRealtimeIncident.plateNumber)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Signalé Par</span>
              <span className="font-bold text-white">
                {latestRealtimeIncident.controleurName || 'Équipe Contrôle'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Observation Terrain</span>
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
              <span>Intercepter & Vérifier ce Véhicule</span>
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

      {/* Navigation Tiers / Onglets Contrôleur */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('controls')}
          className={`pb-2.5 px-3 sm:px-4 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'controls'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Contrôles & Vérifications
        </button>
        <button
          onClick={() => setActiveTab('incidents')}
          className={`pb-2.5 px-3 sm:px-4 text-xs font-bold border-b-2 transition flex items-center gap-1.5 shrink-0 ${
            activeTab === 'incidents'
              ? 'border-rose-500 text-rose-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span>Alertes Incidents en Direct ({fraudReports.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('directory')}
          className={`pb-2.5 px-3 sm:px-4 text-xs font-bold border-b-2 transition shrink-0 ${
            activeTab === 'directory'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Annuaire & Localisation Agents
        </button>
      </div>

      {activeTab === 'directory' ? (
        <AgentDirectoryView viewMode="CONTROLEUR" />
      ) : activeTab === 'incidents' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span>Flux des Incidents Routiers en Direct (Supabase Realtime)</span>
              </h3>
              <p className="text-xs text-slate-400">
                Signalements émis sur le corridor Vridi par l'ensemble des brigades de contrôle.
              </p>
            </div>
            <button
              onClick={() => setFraudModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white transition self-start sm:self-auto cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Signaler un Incident</span>
            </button>
          </div>

          {fraudReports.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-white">Aucun incident de sécurité en cours</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Le corridor routier de Vridi ne présente aucun incident actif signalé. Les nouvelles alertes apparaîtront ici instantanément dès qu'une équipe les soumet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {fraudReports.map((report) => (
                <div
                  key={report.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-4 hover:border-slate-700 transition space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-base font-black text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20">
                        {formatPlateDisplay(report.plateNumber)}
                      </span>
                      <span className="rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 text-[11px] font-bold">
                        {report.typeLabel || report.reason || 'Incident'}
                      </span>
                      {report.status && (
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                          {report.status}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{formatDateTime(report.reportedAt)}</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1">
                    {report.comment && (
                      <p className="text-slate-200">
                        <strong>Constat :</strong> {report.comment}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-slate-400 text-[11px] pt-1">
                      <span>👤 Par : <strong>{report.controleurName}</strong></span>
                      {report.ticketNumber && (
                        <span>🎫 Ticket lié : <strong className="font-mono">{report.ticketNumber}</strong></span>
                      )}
                      {report.gpsLatitude != null && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <MapPin className="w-3 h-3" />
                          <span>GPS : {report.gpsLatitude.toFixed(4)}, {report.gpsLongitude?.toFixed(4)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {report.photos && report.photos.length > 0 && (
                    <div className="flex gap-2 pt-1 overflow-x-auto">
                      {report.photos.map((ph, idx) => (
                        <img
                          key={idx}
                          src={ph}
                          alt="Preuve incident"
                          className="h-16 w-16 object-cover rounded-xl border border-slate-700 hover:scale-105 transition"
                        />
                      ))}
                    </div>
                  )}

                  <div className="pt-1 flex justify-end">
                    <button
                      onClick={() => setScanModalOpen(true)}
                      className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-amber-300 transition cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Contrôler ce véhicule</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* BLOC 1 : INDICATEURS CLÉS DE PERFORMANCE (KPIs CONTRÔLEUR)                */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-orange-400" />
                <span>Bloc 1 — Statistiques de Contrôle Routier</span>
              </h3>
              <PeriodSelector period={period} onChange={setPeriod} />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                title="Contrôles Période"
                value={periodControls.length}
                subtitle={`Aujourd'hui : ${todayControls.length}`}
                icon={<History className="w-4 h-4" />}
                variant="blue"
                onClick={() => setControlsListOpen(true)}
              />
              <StatCard
                title="Tickets Valides"
                value={periodValidCount}
                subtitle={`${periodControls.length > 0 ? Math.round((periodValidCount / periodControls.length) * 100) : 100}% de conformité`}
                icon={<CheckCircle2 className="w-4 h-4" />}
                variant="emerald"
                onClick={() => setControlsListOpen(true)}
              />
              <StatCard
                title="Infractions Détectées"
                value={periodInvalidCount}
                subtitle="Tickets expirés / falsifiés"
                icon={<XCircle className="w-4 h-4" />}
                variant={periodInvalidCount > 0 ? 'rose' : 'slate'}
                onClick={() => setControlsListOpen(true)}
              />
              <StatCard
                title="Signalements Emis"
                value={periodFrauds.length}
                subtitle={`Total historique: ${myFrauds.length}`}
                icon={<ShieldAlert className="w-4 h-4" />}
                variant={periodFrauds.length > 0 ? 'amber' : 'slate'}
                onClick={() => setActiveTab('incidents')}
              />
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOC 2 : ACTIONS TERRAIN IMMÉDIATES (2 Grands Boutons Distincts)          */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-orange-400" />
                <span>Bloc 2 — Actions Terrain Immédiates</span>
              </h3>
              <span className="text-[11px] text-slate-500">Poste de Barrage Routier</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* BOUTON LARGE 1 : SCAN & CONTRÔLE */}
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
                      Scanner Caméra ANPR
                    </span>
                    <h4 className="text-lg sm:text-xl font-black text-white">Contrôler un Véhicule</h4>
                    <p className="text-xs text-orange-100/90 mt-0.5">
                      Scanner le QR Code du ticket ou lire la plaque d'immatriculation
                    </p>
                  </div>
                </div>
              </button>

              {/* BOUTON LARGE 2 : SIGNALER FRAUDE */}
              <button
                id="btn-controleur-fraud"
                onClick={() => setFraudModalOpen(true)}
                className="relative overflow-hidden rounded-2xl bg-linear-to-r from-rose-700 via-rose-600 to-amber-600 p-4 sm:p-5 text-left text-white shadow-xl shadow-rose-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-rose-400/40 group"
              >
                <div className="absolute right-3 top-3 opacity-20 group-hover:opacity-30 transition pointer-events-none">
                  <ShieldAlert className="w-16 h-16 text-white" />
                </div>
                <div className="relative z-10 flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                      Signalement SOS &amp; Incidents
                    </span>
                    <h4 className="text-lg sm:text-xl font-black text-white">Signaler une Fraude</h4>
                    <p className="text-xs text-rose-100/90 mt-0.5">
                      Faux ticket, usure plaque, usurpation ou refus d'obtempérer
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOC 3 : GRILLE DE GESTION SECONDAIRE (Grid 2 ou 4 Colonnes Propre)        */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <History className="w-4 h-4 text-purple-400" />
                <span>Bloc 3 — Registres &amp; Outils de Contrôle</span>
              </h3>
              <span className="text-[11px] text-slate-500">Poste de Brigade</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* 1. Registre des Contrôles */}
              <div
                onClick={() => setControlsListOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-amber-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 group-hover:scale-110 transition">
                    <History className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5 border border-amber-500/30">
                    {myControls.length} passage(s)
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-amber-400 transition">
                    Registre des Contrôles
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Historique de vos vérifications
                  </p>
                </div>
              </div>

              {/* 2. Trombinoscope Agents */}
              <div
                onClick={() => setActiveTab('directory')}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-emerald-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 group-hover:scale-110 transition">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 border border-emerald-500/30">
                    Annuaire
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-emerald-400 transition">
                    Trombinoscope Agents
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Vérification d'identité des agents
                  </p>
                </div>
              </div>

              {/* 3. Recherche Multicritères */}
              <div
                onClick={() => setSearchModalOpen(true)}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-blue-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 group-hover:scale-110 transition">
                    <Search className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-300 px-2 py-0.5 border border-blue-500/30">
                    Recherche
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-blue-400 transition">
                    Recherche Multicritères
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Tickets, camions, reçus
                  </p>
                </div>
              </div>

              {/* 4. Test Alerte SOS Realtime */}
              <div
                onClick={() => simulateIncidentForTesting()}
                className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-purple-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 group-hover:scale-110 transition">
                    <Zap className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold rounded-full bg-purple-500/20 text-purple-300 px-2 py-0.5 border border-purple-500/30">
                    Test
                  </span>
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-black text-white group-hover:text-purple-400 transition">
                    Test Alerte Realtime
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    Simuler un appel d'urgence SOS
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* HISTORIQUE RÉCENT DES CONTRÔLES                                           */}
          {/* ========================================================================= */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Derniers Contrôles Effectués</h3>
                <p className="text-xs text-slate-400">
                  {displayedHistory.length} contrôle(s) affiché(s)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e: any) => setStatusFilter(e.target.value)}
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
                Aucun contrôle enregistré sur cette période.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {displayedHistory.slice(0, 15).map((c) => (
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
                      <p className="text-[11px] text-slate-400 mt-1">
                        {formatDateTime(c.controlledAt)} • {c.validationMessage}
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
        </>
      )}

      {/* Modals Contrôleur */}
      <ControlScanModal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
      />
      <FraudReportModal
        isOpen={fraudModalOpen}
        onClose={() => setFraudModalOpen(false)}
      />
      <ControlsListModal
        isOpen={controlsListOpen}
        onClose={() => setControlsListOpen(false)}
        onOpenScan={() => {
          setControlsListOpen(false);
          setScanModalOpen(true);
        }}
      />
      <AdvancedSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
    </div>
  );
};
