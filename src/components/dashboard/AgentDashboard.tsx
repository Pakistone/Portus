import React, { useState, useMemo, useEffect } from 'react';
import {
  ShoppingCart,
  Ticket as TicketIcon,
  Banknote,
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle2,
  BellRing,
  Search,
  Check,
  Receipt,
  History,
  Printer,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { CoteDIvoireMap } from '../common/CoteDIvoireMap';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA, formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import { getTicketValidityStatus } from '../../utils/expiration';
import { generateReceiptImageBlob } from '../../utils/receiptImageGenerator';
import type { Sale } from '../../types';

// Modales
import { SaleFormModal } from '../sales/SaleFormModal';
import { SalesListModal } from '../sales/SalesListModal';
import { TicketListModal } from '../tickets/TicketListModal';
import { VentesARemettreModal } from '../remises/VentesARemettreModal';
import { AdvancedSearchModal } from '../search/AdvancedSearchModal';

export const AgentDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    tickets,
    sales,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    getAgentStats,
    pendingSyncCount,
    lastSyncedSaleNumber,
    syncOfflineQueue,
    isOnline,
    isSyncing,
  } = useData();

  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [salesListOpen, setSalesListOpen] = useState(false);
  const [ticketsListOpen, setTicketsListOpen] = useState(false);
  const [ventesModalOpen, setVentesModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedTicketForSale, setSelectedTicketForSale] = useState<string | undefined>(undefined);
  const [printingTicketId, setPrintingTicketId] = useState<string | null>(null);

  const handlePrintReceipt = async (sale: Sale) => {
    setPrintingTicketId(sale.id);
    try {
      const ticketObj = tickets.find(
        (t) => t.id === sale.ticketId || t.ticketNumber === sale.ticketNumber
      );
      const carnetNumber = ticketObj ? ticketObj.carnetNumber : undefined;

      const blob = await generateReceiptImageBlob({
        ticketNumber: sale.ticketNumber,
        plateNumber: sale.plateNumber,
        amount: sale.price,
        agentName: sale.agentName,
        dateStr: formatDateTime(sale.soldAt),
        soldAtIso: sale.soldAt,
        expiresAtStr: sale.expiresAt ? formatDateTime(sale.expiresAt) : undefined,
        paymentMethod: sale.paymentMethod || 'ESPECES',
        driverName: sale.driverName || 'Chauffeur non spécifié',
        driverPhone: sale.driverPhone || 'Non renseigné',
        carnetNumber,
        qrPayload: ticketObj?.qrPayload || sale.ticketNumber,
      });

      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.name = 'print-iframe';

      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.write(`
          <html>
            <head>
              <title>Impression Reçu PORTUS U.J.P.A.S. - ${sale.ticketNumber}</title>
              <style>
                body { margin: 0; padding: 10px; display: flex; justify-content: center; align-items: flex-start; background-color: white; }
                img { max-width: 100%; height: auto; object-fit: contain; }
                @page { size: auto; margin: 0; }
                @media print {
                  body { padding: 0; }
                  img { width: 100%; }
                }
              </style>
            </head>
            <body>
              <img src="${url}" />
              <script>
                const img = document.querySelector('img');
                if (img.complete) {
                  window.print();
                } else {
                  img.onload = function() {
                    window.print();
                  };
                }
              </script>
            </body>
          </html>
        `);
        doc.close();
      }

      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
        URL.revokeObjectURL(url);
      }, 10000);
    } catch (err) {
      console.error('[PORTUS Print] Erreur lors de l’impression du reçu:', err);
    } finally {
      setPrintingTicketId(null);
    }
  };

  useEffect(() => {
    const handleNotificationClicked = (e: Event) => {
      const customEvent = e as CustomEvent;
      const notification = customEvent.detail;
      if (!notification) return;

      const type = notification.type;
      if (
        type === 'ASSIGNMENT' ||
        type === 'REMITTANCE' ||
        type === 'SALE' ||
        type === 'FINANCIAL_ALERT'
      ) {
        setVentesModalOpen(true);
      }
    };
    window.addEventListener('portus-notification-clicked', handleNotificationClicked);
    return () =>
      window.removeEventListener('portus-notification-clicked', handleNotificationClicked);
  }, []);

  // Filtrage des tickets personnels de l'agent
  const [ticketFilterTab, setTicketFilterTab] = useState<'ALL' | 'AVAILABLE' | 'SOLD'>('ALL');
  const [ticketSearch, setTicketSearch] = useState('');

  const handleSetFilterTab = (tab: 'ALL' | 'AVAILABLE' | 'SOLD') => {
    setTicketFilterTab(tab);
    setTimeout(() => {
      document
        .getElementById('ticket-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const stats = currentUser
    ? getAgentStats(currentUser.id)
    : {
        assignedCount: 0,
        availableCount: 0,
        soldCount: 0,
        ticketsSold: 0,
        totalSalesAmount: 0,
        expectedAmount: 0,
        remittedAmount: 0,
        remainingBalance: 0,
        ecart: 0,
        unremittedTicketsCount: 0,
      };

  const hasThresholdAlert = stats.unremittedTicketsCount >= 10;

  // Ventes personnelles de l'agent
  const agentSales = useMemo(() => {
    return sales.filter((s) => s.agentId === currentUser?.id);
  }, [sales, currentUser]);

  // Notifications personnelles de l'agent
  const agentNotifications = useMemo(() => {
    if (!currentUser) return [];
    return notifications.filter((n) => n.recipientId === currentUser.id);
  }, [notifications, currentUser]);

  const unreadNotifications = useMemo(() => {
    return agentNotifications.filter((n) => !n.isRead);
  }, [agentNotifications]);

  // RÈGLE MÉTIER : L'agent ne voit STRICTEMENT que ses propres tickets
  const myTickets = useMemo(() => {
    if (!currentUser) return [];
    return tickets.filter((t) => t.assignedAgentId === currentUser.id);
  }, [tickets, currentUser]);

  const availableTickets = useMemo(() => {
    return myTickets.filter((t) => t.status === 'ASSIGNED_TO_AGENT');
  }, [myTickets]);

  const soldTickets = useMemo(() => {
    return myTickets.filter((t) => t.status === 'SOLD' || t.status === 'CONTROLLED');
  }, [myTickets]);

  const displayedTickets = useMemo(() => {
    return myTickets.filter((t) => {
      if (ticketFilterTab === 'AVAILABLE') {
        if (t.status !== 'ASSIGNED_TO_AGENT') return false;
      } else if (ticketFilterTab === 'SOLD') {
        if (t.status !== 'SOLD' && t.status !== 'CONTROLLED') return false;
      }

      if (ticketSearch) {
        const term = ticketSearch.toLowerCase();
        const matchNum = t.ticketNumber.toLowerCase().includes(term);
        const matchCarnet = t.carnetNumber.toLowerCase().includes(term);
        const matchPlate = t.plateNumber?.toLowerCase().includes(term);
        const matchPhysical = t.physicalNumber?.toString().includes(term);
        return matchNum || matchCarnet || matchPlate || matchPhysical;
      }
      return true;
    });
  }, [myTickets, ticketFilterTab, ticketSearch]);

  const handleStartSale = (ticketId?: string) => {
    setSelectedTicketForSale(ticketId);
    setSaleModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 space-y-5">
      {/* ========================================================================= */}
      {/* NOTIFICATIONS PERSISTANTES DE L'AGENT                                     */}
      {/* ========================================================================= */}
      {unreadNotifications.length > 0 && (
        <div className="rounded-2xl border border-blue-500/40 bg-linear-to-r from-blue-950/90 via-slate-900 to-slate-900 p-4 shadow-xl text-blue-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <BellRing className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-blue-400">
                  Nouvelles Attributions &amp; Notifications
                </span>
                <span className="ml-2 inline-flex items-center rounded-full bg-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                  {unreadNotifications.length} non lue(s)
                </span>
              </div>
            </div>
            {currentUser && (
              <button
                onClick={() => markAllNotificationsAsRead(currentUser.id)}
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition cursor-pointer"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="space-y-2">
            {unreadNotifications.slice(0, 3).map((notif) => (
              <div
                key={notif.id}
                className="flex items-center justify-between p-3 rounded-xl border border-blue-500/20 bg-blue-950/40 text-xs gap-3"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>{notif.message}</span>
                  </div>
                  <p className="text-[11px] text-blue-300/80">
                    {notif.metadata?.assignedBy
                      ? `Attribué par : ${notif.metadata.assignedBy}`
                      : ''}{' '}
                    • {formatDateTime(notif.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => markNotificationAsRead(notif.id)}
                  className="shrink-0 flex items-center gap-1 rounded-lg bg-blue-600/30 hover:bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition border border-blue-500/40 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Compris</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BANNIÈRE DE STATUT DE SYNCHRONISATION HORS LIGNE / EN LIGNE               */}
      {/* ========================================================================= */}
      {lastSyncedSaleNumber && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-3.5 flex items-center justify-between animate-fadeIn text-emerald-300">
          <div className="flex items-center gap-2 font-bold text-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>🟢 VENTE SYNCHRONISÉE AVEC SUCCÈS ({lastSyncedSaleNumber})</span>
          </div>
        </div>
      )}

      {pendingSyncCount > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/15 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-amber-200">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <p className="text-xs font-bold">
                🟠 {pendingSyncCount} VENTE(S) HORS LIGNE ENREGISTRÉE(S) — SYNCHRONISATION EN
                ATTENTE
              </p>
              <p className="text-[11px] text-amber-300/80">
                Vos ventes sont sécurisées localement. La date originale de vente sera préservée.
              </p>
            </div>
          </div>
          {isOnline && (
            <button
              onClick={syncOfflineQueue}
              disabled={isSyncing}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-500 transition shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchronisation...' : 'Synchroniser maintenant'}</span>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* BLOC 1 : INDICATEURS CLÉS DE PERFORMANCE (KPIs AGENT)                     */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <TicketIcon className="w-4 h-4 text-orange-400" />
            <span>Bloc 1 — Vos Indicateurs Terrain</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">Agent Connecté</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="Stock en Main"
            value={stats.availableCount}
            subtitle="Tickets prêts à être vendus"
            icon={<TicketIcon className="w-4 h-4" />}
            variant="blue"
            onClick={() => setTicketsListOpen(true)}
          />
          <StatCard
            title="Ventes Effectuées"
            value={stats.ticketsSold}
            subtitle={`Valeur: ${formatFCFA(stats.totalSalesAmount)}`}
            icon={<Receipt className="w-4 h-4" />}
            variant="emerald"
            onClick={() => setSalesListOpen(true)}
          />
          <StatCard
            title="Remises Versées"
            value={formatFCFA(stats.remittedAmount)}
            subtitle="Encaissement validé"
            icon={<Banknote className="w-4 h-4" />}
            variant="blue"
            onClick={() => setVentesModalOpen(true)}
          />
          <StatCard
            title="Solde à Remettre"
            value={formatFCFA(stats.remainingBalance)}
            subtitle={`${stats.unremittedTicketsCount} ticket(s) non versé(s)`}
            icon={<AlertTriangle className="w-4 h-4" />}
            variant={stats.unremittedTicketsCount >= 10 ? 'amber' : 'slate'}
            onClick={() => setVentesModalOpen(true)}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BLOC 2 : ACTIONS TERRAIN IMMÉDIATES (2 Grands Boutons Distincts)          */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-orange-400" />
            <span>Bloc 2 — Actions Terrain Immédiates</span>
          </h3>
          <span className="text-[11px] text-slate-500">Guichet Mobile U.J.P.A.S.</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* BOUTON LARGE 1 : NOUVELLE VENTE TICKET */}
          <button
            id="btn-agent-new-sale"
            onClick={() => handleStartSale()}
            disabled={stats.availableCount === 0}
            className="relative overflow-hidden rounded-2xl bg-linear-to-r from-orange-600 via-orange-500 to-amber-500 p-4 sm:p-5 text-left text-white shadow-xl shadow-orange-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-orange-400/40 group disabled:opacity-50"
          >
            <div className="absolute right-3 top-3 opacity-20 group-hover:opacity-30 transition pointer-events-none">
              <ShoppingCart className="w-16 h-16 text-white" />
            </div>
            <div className="relative z-10 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <div>
                <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                  Guichet 2 500 FCFA
                </span>
                <h4 className="text-lg sm:text-xl font-black text-white">Nouvelle Vente Ticket</h4>
                <p className="text-xs text-orange-100/90 mt-0.5">
                  Émettre un ticket poids lourd &amp; imprimer le reçu QR Code
                </p>
              </div>
            </div>
          </button>

          {/* BOUTON LARGE 2 : VERSER MES REMISES */}
          <button
            onClick={() => setVentesModalOpen(true)}
            className="relative overflow-hidden rounded-2xl bg-linear-to-r from-emerald-600 via-emerald-500 to-teal-500 p-4 sm:p-5 text-left text-white shadow-xl shadow-emerald-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-emerald-400/40 group"
          >
            <div className="absolute right-3 top-3 opacity-20 group-hover:opacity-30 transition pointer-events-none">
              <Banknote className="w-16 h-16 text-white" />
            </div>
            <div className="relative z-10 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
                <Banknote className="w-6 h-6" />
              </div>
              <div>
                <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                  Versement Recettes
                </span>
                <h4 className="text-lg sm:text-xl font-black text-white">Verser mes Remises</h4>
                <p className="text-xs text-emerald-100/90 mt-0.5">
                  Déclarer les encaissements à verser au responsable ou administrateur
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
            <TicketIcon className="w-4 h-4 text-purple-400" />
            <span>Bloc 3 — Consultation &amp; Historique</span>
          </h3>
          <span className="text-[11px] text-slate-500">Outils Agent</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* 1. Mon Stock de Tickets */}
          <div
            onClick={() => setTicketsListOpen(true)}
            className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-blue-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 group-hover:scale-110 transition">
                <TicketIcon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-300 px-2 py-0.5 border border-blue-500/30">
                {stats.availableCount} ticket(s)
              </span>
            </div>
            <div className="mt-3">
              <h4 className="text-xs font-black text-white group-hover:text-blue-400 transition">
                Stock de Tickets
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                Liste des numéros attribués
              </p>
            </div>
          </div>

          {/* 2. Historique des Ventes */}
          <div
            onClick={() => setSalesListOpen(true)}
            className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-emerald-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 group-hover:scale-110 transition">
                <Receipt className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 border border-emerald-500/30">
                {stats.ticketsSold} vente(s)
              </span>
            </div>
            <div className="mt-3">
              <h4 className="text-xs font-black text-white group-hover:text-emerald-400 transition">
                Mes Ventes
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                Reçus &amp; réimpressions
              </p>
            </div>
          </div>

          {/* 3. Synchroniser Hors-Ligne */}
          <div
            onClick={() => {
              if (pendingSyncCount > 0 && isOnline) {
                syncOfflineQueue();
              }
            }}
            className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-amber-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 group-hover:scale-110 transition">
                <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
              </div>
              <span className="text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5 border border-amber-500/30">
                {pendingSyncCount} en attente
              </span>
            </div>
            <div className="mt-3">
              <h4 className="text-xs font-black text-white group-hover:text-amber-400 transition">
                Synchro Hors-Ligne
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                {pendingSyncCount > 0 ? 'Envois en attente' : 'Réseau à jour'}
              </p>
            </div>
          </div>

          {/* 4. Recherche & Contrôle */}
          <div
            onClick={() => setSearchModalOpen(true)}
            className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 hover:border-purple-500/40 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg flex flex-col justify-between group"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 group-hover:scale-110 transition">
                <Search className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold rounded-full bg-purple-500/20 text-purple-300 px-2 py-0.5 border border-purple-500/30">
                Plaque / Ticket
              </span>
            </div>
            <div className="mt-3">
              <h4 className="text-xs font-black text-white group-hover:text-purple-400 transition">
                Rechercher Vente
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                Vérifier une plaque ou un reçu
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* AVERTISSEMENT REMISE FINANCIÈRE (NON BLOQUANT POUR LA VENTE)              */}
      {/* ========================================================================= */}
      {stats.unremittedTicketsCount >= 10 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-1 text-xs text-amber-200">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            <span>RAPPEL : VERSEMENT REQUIS AUPRÈS DU SUPERVISEUR</span>
          </div>
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            Vous avez atteint{' '}
            <strong>{stats.unremittedTicketsCount} tickets vendus non encore régularisés</strong>{' '}
            (Solde dû : <strong>{formatFCFA(stats.remainingBalance)}</strong>). Veuillez effectuer
            votre versement dès que possible.
          </p>
          <p className="text-[10px] text-emerald-400 font-semibold pt-1">
            ✓ Vous pouvez continuer vos ventes normalement sur le terrain.
          </p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8 KPIS PERSONNELS AGENT                                                   */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard
          title="Tickets Disponibles"
          value={availableTickets.length}
          subtitle="Prêts à être vendus"
          icon={<TicketIcon className="w-4 h-4" />}
          variant="emerald"
          onClick={() => handleSetFilterTab('AVAILABLE')}
        />

        <StatCard
          title="Tickets Vendus"
          value={soldTickets.length}
          subtitle="Ventes enregistrées"
          icon={<CheckCircle2 className="w-4 h-4" />}
          variant="blue"
          onClick={() => handleSetFilterTab('SOLD')}
        />

        <StatCard
          title="Valeur des Ventes"
          value={formatFCFA(stats.expectedAmount)}
          subtitle={`${soldTickets.length} × 5 000 FCFA`}
          icon={<Receipt className="w-4 h-4" />}
          variant="emerald"
          onClick={() => handleSetFilterTab('SOLD')}
        />

        <StatCard
          title="Montant Remis"
          value={formatFCFA(stats.remittedAmount)}
          subtitle="Versé au superviseur"
          icon={<Banknote className="w-4 h-4" />}
          variant="blue"
        />

        <StatCard
          title="Solde Restant"
          value={formatFCFA(stats.remainingBalance)}
          subtitle={stats.ecart > 0 ? `Écart : +${formatFCFA(stats.ecart)}` : 'À régulariser'}
          icon={<AlertTriangle className="w-4 h-4" />}
          variant={stats.remainingBalance > 0 ? 'amber' : 'slate'}
          onClick={() => setVentesModalOpen(true)}
        />

        <StatCard
          title="Ventes à Remettre"
          value={stats.unremittedTicketsCount}
          subtitle={`Valeur : ${formatFCFA(stats.unremittedTicketsCount * TICKET_PRICE_FCFA)}`}
          icon={<Receipt className="w-4 h-4" />}
          variant={stats.unremittedTicketsCount > 0 ? 'amber' : 'slate'}
          onClick={() => setVentesModalOpen(true)}
        />

        <StatCard
          title="Alertes Financières"
          value={hasThresholdAlert ? 1 : 0}
          subtitle={hasThresholdAlert ? 'Seuil 10+ dépassé' : 'Situation normale'}
          icon={<AlertTriangle className="w-4 h-4" />}
          variant={hasThresholdAlert ? 'amber' : 'slate'}
          onClick={() => setVentesModalOpen(true)}
        />

        <StatCard
          title="Historique Ventes"
          value={agentSales.length}
          subtitle="Consulter les reçus"
          icon={<History className="w-4 h-4" />}
          variant="slate"
          onClick={() => setSalesListOpen(true)}
        />
      </div>

      {/* ========================================================================= */}
      {/* BILAN FINANCIER PERSONNEL DE L'AGENT                                      */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Mon Bilan Financier Personnel</h3>
              <p className="text-[11px] text-slate-400">
                Tarif fixe : {formatFCFA(TICKET_PRICE_FCFA)} • Calcul automatique strict
              </p>
            </div>
          </div>
          <button
            onClick={() => setVentesModalOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 px-3.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition cursor-pointer"
          >
            <Receipt className="w-4 h-4" />
            <span>Ventes à Remettre ({stats.unremittedTicketsCount})</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-500">Tickets Vendus</span>
            <p className="text-base sm:text-lg font-black text-white font-mono mt-0.5">
              {stats.soldCount}
            </p>
            <p className="text-[10px] text-slate-400">Ventes enregistrées</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-500">Montant Attendu</span>
            <p className="text-base sm:text-lg font-black text-white font-mono mt-0.5">
              {formatFCFA(stats.expectedAmount)}
            </p>
            <p className="text-[10px] text-slate-400">{stats.soldCount} × 5 000 FCFA</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-500">Montant Remis</span>
            <p className="text-base sm:text-lg font-black text-emerald-400 font-mono mt-0.5">
              {formatFCFA(stats.remittedAmount)}
            </p>
            <p className="text-[10px] text-slate-400">Versé au superviseur</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-500">Solde Restant</span>
            <p
              className={`text-base sm:text-lg font-black font-mono mt-0.5 ${
                stats.remainingBalance > 0 ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              {formatFCFA(stats.remainingBalance)}
            </p>
            <p className="text-[10px] text-slate-400">
              {stats.remainingBalance > 0
                ? `${stats.unremittedTicketsCount} ticket(s) dû(s)`
                : 'Régularisé'}
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-500">Écart</span>
            <p
              className={`text-base sm:text-lg font-black font-mono mt-0.5 ${
                stats.ecart > 0 ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {stats.ecart > 0 ? `+${formatFCFA(stats.ecart)}` : '—'}
            </p>
            <p className="text-[10px] text-slate-400">
              {stats.ecart > 0 ? 'Excédent versé' : 'Aucun écart'}
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION DÉDIÉE : MES TICKETS CONFIÉS                                      */}
      {/* ========================================================================= */}
      <div
        id="ticket-section"
        className="rounded-2xl border border-slate-800 bg-slate-900/95 p-5 shadow-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TicketIcon className="w-4 h-4 text-emerald-400" />
              <span>Mes Tickets Confiés ({myTickets.length})</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Visualisation exclusive de votre stock personnel de tickets
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTicketFilterTab('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                ticketFilterTab === 'ALL'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Tous ({myTickets.length})
            </button>
            <button
              onClick={() => setTicketFilterTab('AVAILABLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                ticketFilterTab === 'AVAILABLE'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Disponibles ({availableTickets.length})
            </button>
            <button
              onClick={() => setTicketFilterTab('SOLD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                ticketFilterTab === 'SOLD'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Vendus ({soldTickets.length})
            </button>
          </div>
        </div>

        {/* Barre de recherche ticket */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par numéro de ticket, carnet..."
            value={ticketSearch}
            onChange={(e) => setTicketSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
          />
        </div>

        {/* Liste des tickets */}
        {displayedTickets.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Aucun ticket ne correspond au filtre sélectionné.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {displayedTickets.map((t) => {
              const isAvailable = t.status === 'ASSIGNED_TO_AGENT';

              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs hover:border-slate-700 transition gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-white">
                          {t.ticketNumber}
                        </span>
                        {isAvailable && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                            DISPONIBLE
                          </span>
                        )}
                        {t.status === 'SOLD' && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-[10px] font-bold text-blue-400">
                            VENDU
                          </span>
                        )}
                        {t.status === 'CONTROLLED' && (
                          <span className="px-2 py-0.5 rounded-md bg-teal-500/15 border border-teal-500/30 text-[10px] font-bold text-teal-400">
                            CONTRÔLÉ
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>Carnet : {t.carnetNumber}</span>
                        {t.physicalNumber && <span>• #{t.physicalNumber}</span>}
                        {t.plateNumber && (
                          <span className="font-mono text-emerald-300">
                            • Immat : {formatPlateDisplay(t.plateNumber)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAvailable ? (
                      <button
                        onClick={() => handleStartSale(t.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm cursor-pointer"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Vendre ce ticket</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-right">
                        <div>
                          <span className="font-mono font-bold text-white text-xs">
                            {formatFCFA(t.price)}
                          </span>
                          {t.soldAt && (
                            <p className="text-[10px] text-slate-400">
                              {formatDateTime(t.soldAt)}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const linkedSale = sales.find(
                              (s) => s.ticketId === t.id || s.ticketNumber === t.ticketNumber
                            );
                            if (linkedSale) {
                              handlePrintReceipt(linkedSale);
                            }
                          }}
                          disabled={!!printingTicketId}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-50"
                          title="Imprimer ce ticket"
                        >
                          <Printer className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MES DERNIÈRES VENTES                                                      */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white">
            Mes Ventes Récentes ({agentSales.length})
          </h3>
          <button
            onClick={() => setSalesListOpen(true)}
            className="text-xs text-emerald-400 hover:underline font-semibold cursor-pointer"
          >
            Historique complet
          </button>
        </div>

        {agentSales.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Aucune vente enregistrée pour le moment.
          </div>
        ) : (
          <div className="space-y-2">
            {agentSales.slice(0, 5).map((s) => {
              const validity = getTicketValidityStatus(s.soldAt, s.expiresAt);
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-white">{s.ticketNumber}</span>
                      <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {formatPlateDisplay(s.plateNumber)}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          validity.isExpired
                            ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-emerald-500/10 text-emerald-300'
                        }`}
                      >
                        {validity.isExpired
                          ? 'Expiré (> 14j)'
                          : `Valide (${validity.daysRemaining}j)`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{formatDateTime(s.soldAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="font-mono font-bold text-white">{formatFCFA(s.price)}</span>
                      <div className="text-[10px] mt-0.5">
                        {s.syncStatus === 'SYNCED' ? (
                          <span className="text-emerald-400">Synchronisé</span>
                        ) : (
                          <span className="text-amber-400">En attente</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handlePrintReceipt(s)}
                      disabled={!!printingTicketId}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-50"
                      title="Imprimer ce ticket"
                    >
                      <Printer className="w-4 h-4 text-emerald-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modales */}
      <SaleFormModal
        isOpen={saleModalOpen}
        onClose={() => {
          setSaleModalOpen(false);
          setSelectedTicketForSale(undefined);
        }}
        defaultTicketId={selectedTicketForSale}
      />
      <SalesListModal isOpen={salesListOpen} onClose={() => setSalesListOpen(false)} />
      <TicketListModal isOpen={ticketsListOpen} onClose={() => setTicketsListOpen(false)} />
      <VentesARemettreModal
        isOpen={ventesModalOpen}
        onClose={() => setVentesModalOpen(false)}
        preselectedAgentId={currentUser?.id}
      />
      <AdvancedSearchModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
    </div>
  );
};
