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
  Printer,
  AlertOctagon,
  MessageCircle,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA, formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import { generateReceiptImageBlob } from '../../utils/receiptImageGenerator';
import { generateWhatsAppReceiptUrl } from '../../utils/cedeao';
import { showToast } from '../common/ToastNotification';
import type { Sale } from '../../types';

// Modales strictement autorisées pour l'Agent
import { SaleFormModal } from '../sales/SaleFormModal';
import { SalesListModal } from '../sales/SalesListModal';
import { VentesARemettreModal } from '../remises/VentesARemettreModal';
import { FraudReportModal } from '../controls/FraudReportModal';

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
    triggerSOSAlert,
  } = useData();

  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [salesListOpen, setSalesListOpen] = useState(false);
  const [ventesModalOpen, setVentesModalOpen] = useState(false);
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [selectedTicketForSale, setSelectedTicketForSale] = useState<string | undefined>(undefined);
  const [printingTicketId, setPrintingTicketId] = useState<string | null>(null);

  const handleTriggerSOS = async () => {
    if (!currentUser) return;
    try {
      await triggerSOSAlert(
        `Alerte SOS Urgence Terrain déclenchée par l'agent ${currentUser.fullName} — Zone Portuaire Abidjan.`
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
    setIncidentModalOpen(true);
  };

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

  // Notifications personnelles de l'agent
  const unreadNotifications = useMemo(() => {
    if (!currentUser) return [];
    return notifications.filter((n) => n.recipientId === currentUser.id && !n.isRead);
  }, [notifications, currentUser]);

  // L'agent ne voit strictement que ses propres tickets
  const myTickets = useMemo(() => {
    if (!currentUser) return [];
    return tickets.filter((t) => t.assignedAgentId === currentUser.id && t.status !== 'CANCELLED');
  }, [tickets, currentUser]);

  const availableTickets = useMemo(() => {
    return myTickets.filter((t) => t.status === 'ASSIGNED_TO_AGENT');
  }, [myTickets]);

  const soldTickets = useMemo(() => {
    return myTickets.filter((t) => t.status === 'SOLD' || t.status === 'CONTROLLED');
  }, [myTickets]);

  // Ventes personnelles du jour et globales de l'agent uniquement
  const mySales = useMemo(() => {
    if (!currentUser) return [];
    return sales.filter((s) => s.agentId === currentUser.id);
  }, [sales, currentUser]);

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
      {/* Notifications Persistantes de l'Agent */}
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

      {/* Bannière de statut de synchronisation hors-ligne */}
      {lastSyncedSaleNumber && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-3.5 flex items-center justify-between text-emerald-300">
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
                🟠 {pendingSyncCount} VENTE(S) HORS LIGNE EN ATTENTE DE SYNCHRONISATION
              </p>
              <p className="text-[11px] text-amber-300/80">
                Vos ventes sont sécurisées localement dans IndexedDB.
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
      {/* 1. COMPTEURS PERSONNELS DE L'AGENT                                        */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <TicketIcon className="w-4 h-4 text-orange-400" />
            <span>Mes Compteurs Personnels ({currentUser?.fullName})</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            Tarif Unique : {formatFCFA(TICKET_PRICE_FCFA)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            title="Tickets en Main"
            value={stats.availableCount}
            subtitle="Prêts à être vendus"
            icon={<TicketIcon className="w-4 h-4" />}
            variant="blue"
            onClick={() => handleSetFilterTab('AVAILABLE')}
          />
          <StatCard
            title="Tickets Vendus"
            value={stats.ticketsSold}
            subtitle={`Total : ${formatFCFA(stats.totalSalesAmount)}`}
            icon={<Receipt className="w-4 h-4" />}
            variant="emerald"
            onClick={() => setSalesListOpen(true)}
          />
          <StatCard
            title="Montant à Remettre"
            value={formatFCFA(stats.remainingBalance)}
            subtitle={`${stats.unremittedTicketsCount} ticket(s) non versé(s)`}
            icon={<Banknote className="w-4 h-4" />}
            variant={stats.unremittedTicketsCount >= 10 ? 'amber' : 'slate'}
            onClick={() => setVentesModalOpen(true)}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ACTIONS TERRAIN DE L'AGENT : VENDRE UN TICKET & SOS / INCIDENT         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* BOUTON PRINCIPAL 1 : VENDRE UN TICKET */}
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
                Guichet Terrain {formatFCFA(TICKET_PRICE_FCFA)}
              </span>
              <h4 className="text-lg sm:text-xl font-black text-white">Vendre un Ticket</h4>
              <p className="text-xs text-orange-100/90 mt-0.5">
                Auto-complétion plaque, reçu QR Code &amp; envoi WhatsApp
              </p>
            </div>
          </div>
        </button>

        {/* BOUTON PRINCIPAL 2 : SIGNALER UN INCIDENT / SOS */}
        <button
          id="btn-agent-sos"
          onClick={handleTriggerSOS}
          className="relative overflow-hidden rounded-2xl bg-linear-to-r from-rose-700 via-rose-600 to-red-600 p-4 sm:p-5 text-left text-white shadow-xl shadow-rose-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-rose-400/40 group"
        >
          <div className="absolute right-3 top-3 opacity-20 group-hover:opacity-30 transition pointer-events-none">
            <AlertOctagon className="w-16 h-16 text-white" />
          </div>
          <div className="relative z-10 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-md">
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white mb-1">
                Assistance &amp; Sécurité U.J.P.A.S.
              </span>
              <h4 className="text-lg sm:text-xl font-black text-white">
                🚨 Signaler un Incident / SOS
              </h4>
              <p className="text-xs text-rose-100/90 mt-0.5">
                Alerter immédiatement la supervision ou déclarer un incident terrain
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Avertissement Remise Financière (Non bloquant pour la vente) */}
      {stats.unremittedTicketsCount >= 10 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-1 text-xs text-amber-200">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            <span>RAPPEL : VERSEMENT REQUIS AUPRÈS DU SUPERVISEUR</span>
          </div>
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            Vous avez atteint{' '}
            <strong>{stats.unremittedTicketsCount} tickets vendus non encore régularisés</strong>{' '}
            (Solde dû : <strong>{formatFCFA(stats.remainingBalance)}</strong>). Veuillez remettre
            vos recettes à votre Responsable ou à l'Administrateur.
          </p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MES TICKETS & MES VENTES DU JOUR                                       */}
      {/* ========================================================================= */}
      <div
        id="ticket-section"
        className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 sm:p-5 shadow-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TicketIcon className="w-4 h-4 text-emerald-400" />
              <span>Mes Tickets &amp; Mes Ventes ({myTickets.length})</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Liste de vos propres tickets restants et vendus • Reçus WhatsApp &amp; Impression
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              Restants ({availableTickets.length})
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
            <button
              onClick={() => setSalesListOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer"
            >
              Historique Reçus ({mySales.length})
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filtrer mes tickets par numéro ou plaque d'immatriculation..."
            value={ticketSearch}
            onChange={(e) => setTicketSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
          />
        </div>

        {displayedTickets.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Aucun ticket ne correspond au filtre sélectionné.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {displayedTickets.map((t) => {
              const isAvailable = t.status === 'ASSIGNED_TO_AGENT';
              const linkedSale = mySales.find(
                (s) => s.ticketId === t.id || s.ticketNumber === t.ticketNumber
              );
              const whatsappUrl =
                linkedSale && linkedSale.driverPhone
                  ? generateWhatsAppReceiptUrl({
                      dialCode: '+225',
                      phoneNumber: linkedSale.driverPhone,
                      ticketNumber: linkedSale.ticketNumber,
                      plateNumber: linkedSale.plateNumber,
                      amount: linkedSale.price,
                      agentName: linkedSale.agentName,
                      dateStr: formatDateTime(linkedSale.soldAt),
                      soldAtIso: linkedSale.soldAt,
                      paymentMethod: linkedSale.paymentMethod,
                    })
                  : null;

              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs hover:border-slate-700 transition gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {t.coveredByRemiseId ? (
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-[10px] font-bold text-purple-300">
                          REMIS EN CAISSE
                        </span>
                      ) : (
                        !isAvailable && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                            À REMETTRE
                          </span>
                        )
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                      <span>Carnet : {t.carnetNumber}</span>
                      {t.plateNumber && (
                        <span className="font-mono text-emerald-300">
                          • Plaque : {formatPlateDisplay(t.plateNumber)}
                        </span>
                      )}
                      {t.driverPhone && (
                        <span className="font-mono text-slate-400">• Tél : {t.driverPhone}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAvailable ? (
                      <button
                        onClick={() => handleStartSale(t.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm cursor-pointer"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Vendre</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 text-right">
                        <div className="mr-1">
                          <span className="font-mono font-bold text-white text-xs">
                            {formatFCFA(t.price)}
                          </span>
                          {t.soldAt && (
                            <p className="text-[10px] text-slate-400">
                              {formatDateTime(t.soldAt)}
                            </p>
                          )}
                        </div>
                        {whatsappUrl && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 transition cursor-pointer"
                            title="Envoyer le reçu par WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {linkedSale && (
                          <button
                            onClick={() => handlePrintReceipt(linkedSale)}
                            disabled={!!printingTicketId}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-50"
                            title="Imprimer ce reçu"
                          >
                            <Printer className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modales Personnelles Agent (Strictement limitées à la vente, ses ventes et SOS/Incident) */}
      <SaleFormModal
        isOpen={saleModalOpen}
        onClose={() => {
          setSaleModalOpen(false);
          setSelectedTicketForSale(undefined);
        }}
        defaultTicketId={selectedTicketForSale}
      />
      <SalesListModal
        isOpen={salesListOpen}
        onClose={() => setSalesListOpen(false)}
        onOpenNewSale={() => {
          setSalesListOpen(false);
          setSaleModalOpen(true);
        }}
      />
      <VentesARemettreModal
        isOpen={ventesModalOpen}
        onClose={() => setVentesModalOpen(false)}
        preselectedAgentId={currentUser?.id}
      />
      <FraudReportModal
        isOpen={incidentModalOpen}
        onClose={() => setIncidentModalOpen(false)}
      />
    </div>
  );
};
