import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Les annulations normales de requêtes asynchrones en cours ne doivent pas bloquer l'interface
    if (
      error &&
      (error.name === 'AbortError' ||
        error.message?.includes('AbortError') ||
        error.message?.includes('The user aborted a request'))
    ) {
      return { hasError: false };
    }
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (
      error &&
      (error.name === 'AbortError' ||
        error.message?.includes('AbortError') ||
        error.message?.includes('The user aborted a request'))
    ) {
      return;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error('[PORTUS ErrorBoundary] Exception capturée:', error, errorInfo);
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-900/95 p-6 text-center shadow-2xl backdrop-blur-xl space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Une anomalie inattendue est survenue</h2>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Le système a sécurisé l’application. Vos données locales et enregistrements hors-ligne sont intacts dans IndexedDB.
              </p>
            </div>
            {this.state.error && (
              <div className="rounded-xl border border-rose-500/20 bg-slate-950/80 p-3 text-left font-mono text-[11px] text-rose-300 max-h-32 overflow-y-auto break-all">
                {this.state.error.message || 'Erreur d’exécution'}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-lg hover:bg-emerald-500 active:scale-[0.98] transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Redémarrer l'application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
