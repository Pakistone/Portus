import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Percent,
  Clock,
  Target,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Layers,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  ListFilter,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { PeriodFilterState, filterItemByPeriod } from './DashboardCharts';
import { formatFCFA } from '../../utils/normalization';
import { TICKET_PRICE_FCFA } from '../../config/constants';

interface AdminAnalyticsViewProps {
  period: PeriodFilterState;
}

export const AdminAnalyticsView: React.FC<AdminAnalyticsViewProps> = ({ period }) => {
  const { sales, remises, expenses, controls, fraudReports, sectors, users } = useData();
  const [analyticsFocus, setAnalyticsFocus] = useState<'rentabilite' | 'securite'>('rentabilite');

  // ---------------------------------------------------------------------------
  // 1. FILTRAGE DES DONNÉES PAR PÉRIODE
  // ---------------------------------------------------------------------------
  const periodSales = useMemo(() => {
    return sales.filter((s) => filterItemByPeriod(s.soldAt, period));
  }, [sales, period]);

  const periodRemises = useMemo(() => {
    return remises.filter((r) => filterItemByPeriod(r.createdAt, period));
  }, [remises, period]);

  const periodExpenses = useMemo(() => {
    const arr = expenses || [];
    return arr.filter((e) => filterItemByPeriod(e.expenseDate, period));
  }, [expenses, period]);

  const periodControls = useMemo(() => {
    return controls.filter((c) => filterItemByPeriod(c.controlledAt, period));
  }, [controls, period]);

  const periodFrauds = useMemo(() => {
    return fraudReports.filter((f) => filterItemByPeriod(f.reportedAt, period));
  }, [fraudReports, period]);

  // ---------------------------------------------------------------------------
  // 2. ANALYSE DE RENTABILITÉ & BUDGET
  // ---------------------------------------------------------------------------
  const totalIncome = periodSales.length * TICKET_PRICE_FCFA;
  const totalRemitted = periodRemises.reduce((sum, r) => sum + r.amount, 0);
  
  // Mobile Money Direct vs Cash
  const momoSales = periodSales.filter(s => s.paymentMethod === 'MOBILE_MONEY');
  const momoSalesAmount = momoSales.length * TICKET_PRICE_FCFA;
  const cashSalesAmount = totalIncome - momoSalesAmount;

  // Expenses categories
  const approvedExpenses = periodExpenses.filter(e => e.status === 'VALIDATED' || e.status === 'VALIDEE');
  const totalApprovedExpensesAmount = approvedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalIncome - totalApprovedExpensesAmount;

  const expenseCategoryBreakdown = useMemo(() => {
    const breakdown: Record<string, { label: string; amount: number; color: string }> = {
      CARBURANT: { label: '⛽ Carburant Patrouille', amount: 0, color: 'bg-amber-500' },
      PERSONNEL: { label: '🥩 Indemnités & Repas', amount: 0, color: 'bg-emerald-500' },
      SECURITE: { label: '🛡️ Force d\'Appui', amount: 0, color: 'bg-indigo-500' },
      MATERIEL: { label: '🖨️ Consommables & Papier', amount: 0, color: 'bg-sky-500' },
      AUTRE: { label: '📦 Autres Charges', amount: 0, color: 'bg-slate-500' },
    };

    approvedExpenses.forEach(e => {
      const cat = (e.category || 'AUTRE').toUpperCase();
      let key = 'AUTRE';
      if (cat.includes('CARB') || cat.includes('ESSENCE') || cat.includes('FUEL')) key = 'CARBURANT';
      else if (cat.includes('PERS') || cat.includes('REPAS') || cat.includes('INDEMN')) key = 'PERSONNEL';
      else if (cat.includes('SEC') || cat.includes('GEND') || cat.includes('POLIC')) key = 'SECURITE';
      else if (cat.includes('MAT') || cat.includes('PAPIER') || cat.includes('ROULEAU')) key = 'MATERIEL';
      
      breakdown[key].amount += e.amount;
    });

    return Object.values(breakdown).sort((a, b) => b.amount - a.amount);
  }, [approvedExpenses]);

  // ---------------------------------------------------------------------------
  // 3. ANALYSE HOURLY TRAFFIC (HEURES DE POINTE)
  // ---------------------------------------------------------------------------
  const hourlyTraffic = useMemo(() => {
    const hours = [
      { id: 'morning', label: '🌅 Matin (06h - 10h)', count: 0, amount: 0, minH: 6, maxH: 10 },
      { id: 'midday', label: '☀️ Midi (10h - 14h)', count: 0, amount: 0, minH: 10, maxH: 14 },
      { id: 'afternoon', label: '🌇 Après-Midi (14h - 18h)', count: 0, amount: 0, minH: 14, maxH: 18 },
      { id: 'night', label: '🌃 Nuit (18h - 06h)', count: 0, amount: 0, minH: 18, maxH: 6 },
    ];

    periodSales.forEach((s) => {
      const h = new Date(s.soldAt).getHours();
      const slot = hours.find((hSlot) => {
        if (hSlot.id === 'night') {
          return h >= 18 || h < 6;
        }
        return h >= hSlot.minH && h < hSlot.maxH;
      });
      if (slot) {
        slot.count += 1;
        slot.amount += s.price;
      }
    });

    const maxCount = Math.max(...hours.map((h) => h.count), 1);
    return hours.map(h => ({
      ...h,
      percentage: Math.round((h.count / maxCount) * 100),
    }));
  }, [periodSales]);

  const peakHourSlot = useMemo(() => {
    return [...hourlyTraffic].sort((a, b) => b.count - a.count)[0];
  }, [hourlyTraffic]);

  // ---------------------------------------------------------------------------
  // 4. ANALYSE DES SECTEURS DE VENTES
  // ---------------------------------------------------------------------------
  const sectorSalesPerformance = useMemo(() => {
    return sectors.map((sec) => {
      const secSales = periodSales.filter((s) => s.sectorId === sec.id || s.sectorName === sec.name);
      const count = secSales.length;
      const amount = count * TICKET_PRICE_FCFA;
      
      // Target estimation (dynamic target based on period)
      let target = 50; // default standard
      if (period.type === 'today') target = 15;
      else if (period.type === 'week') target = 80;
      else if (period.type === 'month') target = 300;

      const achievementPct = Math.min(Math.round((count / target) * 100), 100);

      return {
        id: sec.id,
        name: sec.name,
        count,
        amount,
        target,
        achievementPct,
      };
    }).sort((a, b) => b.count - a.count);
  }, [sectors, periodSales, period]);

  // ---------------------------------------------------------------------------
  // 5. CONSOLE DE SÉCURITÉ & ANALYSE DE FRAUDES
  // ---------------------------------------------------------------------------
  // Control ratio: tickets controlled in period / tickets sold in period
  const controlRate = useMemo(() => {
    if (periodSales.length === 0) return 0;
    // unique controlled ticket numbers in this period
    const controlledTicketNums = new Set(periodControls.map(c => c.ticketNumber));
    const soldInPeriodAndControlled = periodSales.filter(s => controlledTicketNums.has(s.ticketNumber)).length;
    return Math.round((soldInPeriodAndControlled / periodSales.length) * 100);
  }, [periodSales, periodControls]);

  const fraudBreakdown = useMemo(() => {
    const breakdown = {
      FAKE_TICKET: { label: 'Ticket Contrefait', count: 0, color: 'bg-rose-500' },
      DUPLICATE_USE: { label: 'Double Passage', count: 0, color: 'bg-amber-500' },
      PLATE_MISMATCH: { label: 'Plaque Discordante', count: 0, color: 'bg-orange-500' },
      EXPIRED_TICKET: { label: 'Ticket Expiré / Ancien', count: 0, color: 'bg-purple-500' },
    };

    periodFrauds.forEach(f => {
      const type = f.type as keyof typeof breakdown;
      if (breakdown[type]) {
        breakdown[type].count += 1;
      }
    });

    return Object.values(breakdown).sort((a, b) => b.count - a.count);
  }, [periodFrauds]);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* ========================================================================= */}
      {/* EN-TÊTE ANALYTIQUE & SÉLECTEUR DE FOCUS                                   */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-purple-400">
            Performance &amp; Audit Avancé UJPAA
          </span>
          <h2 className="text-xl font-black text-white mt-1">
            Analyses Décisionnelles &amp; Rentabilité
          </h2>
          <p className="text-xs text-slate-400">
            Analyse approfondie des encaissements, des charges et du taux de contrôle opérationnel.
          </p>
        </div>

        {/* Sélecteur Ergonomique de Focus (Filtre fonctionnel) */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 border border-slate-800 rounded-xl max-w-xs shrink-0 self-start md:self-auto">
          <button
            onClick={() => setAnalyticsFocus('rentabilite')}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              analyticsFocus === 'rentabilite'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            📈 Rentabilité &amp; Budget
          </button>
          <button
            onClick={() => setAnalyticsFocus('securite')}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              analyticsFocus === 'securite'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            🛡️ Performance &amp; Sécurité
          </button>
        </div>
      </div>

      {analyticsFocus === 'rentabilite' ? (
        <div className="space-y-5">
          {/* ========================================================================= */}
          {/* VUE RENTABILITÉ : TRÉSORERIE & BUDGETS                                   */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* KPI 1 : Recettes Brutes */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <TrendingUp className="w-16 h-16 text-emerald-400" />
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Chiffre d'Affaires Brut</span>
              <h3 className="text-2xl font-black text-white font-mono tabular-nums">{formatFCFA(totalIncome)}</h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                <span className="text-emerald-400 font-bold font-mono">+{periodSales.length}</span>
                <span>tickets poids lourds vendus</span>
              </div>
            </div>

            {/* KPI 2 : Charges Opérationnelles */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <ArrowDownRight className="w-16 h-16 text-rose-400" />
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Charges Approuvées</span>
              <h3 className="text-2xl font-black text-rose-400 font-mono tabular-nums">-{formatFCFA(totalApprovedExpensesAmount)}</h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                <span className="text-rose-400 font-bold font-mono">{approvedExpenses.length}</span>
                <span>demandes de caisse validées</span>
              </div>
            </div>

            {/* KPI 3 : Bénéfice Net Corridor */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <Banknote className="w-16 h-16 text-purple-400" />
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Excédent Net (Trésorerie)</span>
              <h3 className={`text-2xl font-black font-mono tabular-nums ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {netProfit >= 0 ? '+' : ''}{formatFCFA(netProfit)}
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                <span>Rendement net :</span>
                <span className="font-mono font-bold text-white">
                  {totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(0) : 0}% des ventes
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ventilation des Dépenses par Catégorie */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    Allocation des Charges
                  </h4>
                  <p className="text-[11px] text-slate-400">Ventilation budgétaire des dépenses du corridor.</p>
                </div>
                <span className="text-[10px] font-bold text-rose-400 font-mono bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">Débit Caisse</span>
              </div>

              <div className="space-y-4 py-1">
                {expenseCategoryBreakdown.map((cat, idx) => {
                  const pct = totalApprovedExpensesAmount > 0 
                    ? Math.round((cat.amount / totalApprovedExpensesAmount) * 100) 
                    : 0;

                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 font-medium">{cat.label}</span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="font-bold text-white">{formatFCFA(cat.amount)}</span>
                          <span className="text-slate-500">({pct}%)</span>
                        </div>
                      </div>
                      
                      {/* Bar de progression élégante */}
                      <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${cat.color} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {totalApprovedExpensesAmount === 0 && (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    Aucune charge comptabilisée sur cette période.
                  </div>
                )}
              </div>
            </div>

            {/* Répartition de l'Origine des Recettes */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                  Segmentation de l'Origine des Fonds
                </h4>
                <p className="text-[11px] text-slate-400">Flux financiers consolidés par mode de paiement.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center h-full pb-2">
                {/* Visual Circle Meter */}
                <div className="flex flex-col items-center justify-center space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-850">
                  <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Couverture Numérique</span>
                  <div className="relative flex items-center justify-center">
                    {/* Fake radial progress */}
                    <div className="w-24 h-24 rounded-full border-4 border-slate-800 flex flex-col items-center justify-center">
                      <span className="text-lg font-black text-blue-400 font-mono">
                        {totalIncome > 0 ? ((momoSalesAmount / totalIncome) * 100).toFixed(0) : 0}%
                      </span>
                      <span className="text-[8px] uppercase text-slate-500 font-bold">Mobile Money</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 text-center">
                    Objectif UJPAA : Réduire l'usage du cash de 50% d'ici fin 2026.
                  </span>
                </div>

                {/* Details list */}
                <div className="space-y-3">
                  <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-850 space-y-1">
                    <span className="text-[10px] text-slate-400 block font-semibold">💵 ESPÈCES PHYSIQUES</span>
                    <span className="text-sm font-black text-emerald-400 font-mono">{formatFCFA(cashSalesAmount)}</span>
                    <span className="text-[9px] text-slate-500 block">Restitutions terrain des agents par remises de fonds.</span>
                  </div>

                  <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-850 space-y-1">
                    <span className="text-[10px] text-slate-400 block font-semibold">📱 MOBILE MONEY DIRECT</span>
                    <span className="text-sm font-black text-blue-400 font-mono">{formatFCFA(momoSalesAmount)}</span>
                    <span className="text-[9px] text-slate-500 block">Paiements Wave / Orange / MTN instantanés sur QR code.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* ========================================================================= */}
          {/* VUE SÉCURITÉ : AUDITS & PERFORMANCE DES SECTEURS                           */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* KPI 1 : Contrôle de sécurité */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <ShieldCheck className="w-16 h-16 text-indigo-400" />
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Taux de Contrôle de Sécurité</span>
              <h3 className="text-2xl font-black text-indigo-400 font-mono tabular-nums">{controlRate}%</h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                <span className="text-indigo-400 font-bold font-mono">✓ {periodControls.length}</span>
                <span>contrôles de plaques effectués</span>
              </div>
            </div>

            {/* KPI 2 : Heure d'affluence max */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <Clock className="w-16 h-16 text-amber-400" />
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Période d'Affluence Maximale</span>
              <h3 className="text-sm font-black text-white mt-1 uppercase truncate">
                {peakHourSlot ? peakHourSlot.label.split(' ')[1] : 'Matin'}
              </h3>
              <p className="text-xs font-mono font-bold text-amber-400">
                {peakHourSlot ? peakHourSlot.count : 0} ventes enregistrées
              </p>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                <span>Concentration horaire de pointe</span>
              </div>
            </div>

            {/* KPI 3 : Infractions Évitées */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                <ShieldAlert className="w-16 h-16 text-rose-400" />
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Infractions Identifiées</span>
              <h3 className="text-2xl font-black text-rose-500 font-mono tabular-nums">{periodFrauds.length}</h3>
              <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                <span>Plaintes &amp; faux tickets signalés</span>
                <span className="font-bold text-rose-400">Vigilance Actived</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Performance par Secteur & Targets */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                  Efficacité des Secteurs vs Objectifs
                </h4>
                <p className="text-[11px] text-slate-400">Suivi d'atteinte des cibles de vente par zone géographique.</p>
              </div>

              <div className="space-y-4">
                {sectorSalesPerformance.map((sec, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <div>
                        <span className="text-white font-bold">{sec.name}</span>
                        <span className="text-slate-500 text-[10px] ml-2">Ventes: {sec.count} / Cible: {sec.target}</span>
                      </div>
                      <span className="font-mono font-bold text-purple-400">{sec.achievementPct}%</span>
                    </div>

                    {/* Progress Bar with Colored Indicators based on Achievement */}
                    <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          sec.achievementPct >= 100 
                            ? 'bg-emerald-500' 
                            : sec.achievementPct >= 50 
                            ? 'bg-purple-500' 
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${sec.achievementPct}%` }}
                      />
                    </div>
                  </div>
                ))}

                {sectorSalesPerformance.length === 0 && (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    Aucune statistique de secteur disponible.
                  </div>
                )}
              </div>
            </div>

            {/* Typologie des Infractions et Fraudes */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                  Analyse Typologique des Fraudes Détectées
                </h4>
                <p className="text-[11px] text-slate-400">Répartition des signalements effectués par les agents de contrôle.</p>
              </div>

              <div className="space-y-4 py-1">
                {fraudBreakdown.map((item, idx) => {
                  const total = periodFrauds.length || 1;
                  const pct = Math.round((item.count / total) * 100);

                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 font-medium">{item.label}</span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="font-bold text-white">{item.count} cas</span>
                          <span className="text-slate-500">({pct}%)</span>
                        </div>
                      </div>

                      {/* Bar de progression */}
                      <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${item.color} transition-all duration-500`}
                          style={{ width: `${item.count > 0 ? pct : 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {periodFrauds.length === 0 && (
                  <div className="py-8 text-center text-slate-500 text-xs text-emerald-400 font-bold">
                    🛡️ Zéro fraude signalée sur cette période. Corridor sécurisé !
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HISTORIQUE DE SÉCURITÉ DE L'ADMINISTRATION                                 */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-3">
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
            Heures de Pointe et de Vente (Distribution horaire brute)
          </h4>
          <p className="text-[11px] text-slate-400">Distribution relative des ventes par tranches horaires de 4 heures pour planifier la sécurité.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
          {hourlyTraffic.map((h, idx) => (
            <div key={idx} className="rounded-xl bg-slate-950 p-3 border border-slate-850 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 block truncate">{h.label}</span>
              <div className="flex justify-between items-end">
                <span className="text-lg font-black text-white font-mono">{h.count} <span className="text-xs text-slate-500 font-normal">t.</span></span>
                <span className="text-xs text-slate-400 font-mono">{formatFCFA(h.amount)}</span>
              </div>
              <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden">
                <div 
                  className="bg-purple-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${h.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
