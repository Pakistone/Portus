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

export const ControleurDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { controls, fraudReports } = useData();

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
      {/* ACTIONS PRIORITAIRES TERRAIN (GROS BOUTONS TOUCH FRIENDLY)                */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Bouton Scan / Vérification */}
        <button
          id="btn-controleur-scan"
          onClick={() => setScanModalOpen(true)}
          className="flex flex-col items-center justify-center p-5 sm:p-6 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white shadow-xl shadow-amber-950 active:scale-98 transition text-center cursor-pointer space-y-2 border border-amber-500/50"
        >
          <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-black/20 text-white">
            <QrCode className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black tracking-wide">
              CONTRÔLER UN VÉHICULE
            </h3>
            <p className="text-xs text-amber-100 font-medium">
              Scanner QR Code ou saisir la plaque d'immatriculation
            </p>
          </div>
        </button>

        {/* Bouton Signalement Fraude */}
        <button
          id="btn-controleur-fraud"
          onClick={() => setFraudModalOpen(true)}
          className="flex flex-col items-center justify-center p-5 sm:p-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-rose-300 shadow-xl border border-rose-500/40 active:scale-98 transition text-center cursor-pointer space-y-2"
        >
          <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
            <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black tracking-wide text-white">
              SIGNALER UNE FRAUDE
            </h3>
            <p className="text-xs text-slate-400">
              Faux ticket, réutilisation, refus de payer ou anomalie
            </p>
          </div>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SÉLECTEUR DE PÉRIODE POUR LES STATISTIQUES CONTRÔLEUR                     */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl border border-slate-800 bg-slate-900/90 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Période d'Analyse :
          </span>
        </div>
        <PeriodSelector period={period} onChange={setPeriod} />
      </div>

      {/* ========================================================================= */}
      {/* 4 KPIS REQUIS CONTRÔLEUR (JOUR, PÉRIODE, SIGNALEMENTS, HISTORIQUE)        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {/* 1. Contrôles du Jour */}
        <StatCard
          title="Contrôles du Jour"
          value={todayControls.length}
          subtitle={`${todayControls.filter((c) => c.isValid).length} valides aujourd'hui`}
          icon={<Clock className="w-4 h-4" />}
          variant="amber"
          onClick={() => setControlsListOpen(true)}
        />

        {/* 2. Contrôles Période */}
        <StatCard
          title="Contrôles Période"
          value={periodControls.length}
          subtitle={`${periodValidCount} valides • ${periodInvalidCount} rejets`}
          icon={<QrCode className="w-4 h-4" />}
          variant="blue"
          onClick={() => setControlsListOpen(true)}
        />

        {/* 3. Signalements */}
        <StatCard
          title="Signalements Fraude"
          value={periodFrauds.length}
          subtitle={`Total historique : ${myFrauds.length}`}
          icon={<ShieldAlert className="w-4 h-4" />}
          variant={periodFrauds.length > 0 ? 'rose' : 'slate'}
          onClick={() => setFraudModalOpen(true)}
        />

        {/* 4. Historique Total */}
        <StatCard
          title="Historique Contrôles"
          value={myControls.length}
          subtitle="Toutes opérations confondues"
          icon={<History className="w-4 h-4" />}
          variant="slate"
          onClick={() => setControlsListOpen(true)}
        />
      </div>

      {/* ========================================================================= */}
      {/* SECTION HISTORIQUE DES CONTRÔLES AVEC FILTRES ET RECHERCHE               */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              <span>Historique Personnel des Contrôles ({displayedHistory.length})</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Recherche rapide par plaque, numéro de ticket ou motif
            </p>
          </div>
          <button
            onClick={() => setControlsListOpen(true)}
            className="text-xs text-amber-400 hover:underline font-semibold"
          >
            Afficher tout le registre
          </button>
        </div>

        {/* Barre de recherche et onglets de statut */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrer par plaque (ex: 12-AB-34) ou n° ticket..."
              className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === 'ALL'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Tous ({myControls.length})
            </button>
            <button
              onClick={() => setStatusFilter('VALID')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === 'VALID'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Valides
            </button>
            <button
              onClick={() => setStatusFilter('INVALID')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === 'INVALID'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Infractions
            </button>
          </div>
        </div>

        {/* Liste des contrôles */}
        {displayedHistory.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Aucun contrôle ne correspond aux critères sélectionnés.
          </div>
        ) : (
          <div className="space-y-2">
            {displayedHistory.slice(0, 7).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {formatPlateDisplay(c.plateNumber)}
                    </span>
                    <span className="font-mono text-slate-400">{c.ticketNumber}</span>
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
