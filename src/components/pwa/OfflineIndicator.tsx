import React from 'react';
import { WifiOff, CloudUpload, CheckCircle2, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from './usePWAInstall';

interface Props {
  pendingSyncCount?: number;
  lastSyncedSaleNumber?: string | null;
  onManualSync?: () => void;
  isSyncing?: boolean;
}

export const OfflineIndicator: React.FC<Props> = ({
  pendingSyncCount = 0,
  lastSyncedSaleNumber = null,
  onManualSync,
  isSyncing = false,
}) => {
  const isOnline = useOnlineStatus();

  return (
    <>
      {/* Bannière Hors Ligne */}
      {!isOnline && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-amber-600/30 bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md transition-all"
        >
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 animate-pulse shrink-0" />
            <span>MODE HORS LIGNE ACTIF — Ventes et contrôles enregistrés localement sur l’appareil</span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider bg-slate-950/15 px-2.5 py-0.5 rounded-full">
            Autonome
          </span>
        </aside>
      )}

      {/* Badge synchronisation flottant si opérations en attente */}
      {pendingSyncCount > 0 && (
        <aside
          aria-label="Synchronisation des opérations de terrain"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 z-40 flex items-center justify-between rounded-2xl border border-amber-500/40 bg-slate-950/95 p-3.5 shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <CloudUpload className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-300">
                Opérations en attente de synchronisation
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                <span className="font-bold text-white tabular-nums">{pendingSyncCount}</span> élément{pendingSyncCount > 1 ? 's' : ''} enregistré{pendingSyncCount > 1 ? 's' : ''} localement
              </p>
            </div>
          </div>
          {isOnline && onManualSync && (
            <button
              onClick={onManualSync}
              disabled={isSyncing}
              className="ml-3 shrink-0 flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 disabled:opacity-50 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'En cours…' : 'Synchroniser'}</span>
            </button>
          )}
        </aside>
      )}

      {/* Confirmation temporaire de synchronisation */}
      {lastSyncedSaleNumber && pendingSyncCount === 0 && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-slate-950/95 px-4 py-3 shadow-2xl backdrop-blur-md text-emerald-400 text-xs font-bold animate-in fade-in slide-in-from-bottom duration-300"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Vente synchronisée avec succès : <span className="font-mono text-white tabular-nums">{lastSyncedSaleNumber}</span></span>
        </aside>
      )}
    </>
  );
};
