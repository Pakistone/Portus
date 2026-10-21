/// <reference types="vite/client" />

/**
 * Déclarations globales strictes pour l'écosystème web moderne PORTUS — U.J.P.A.S.
 * Union des Jeunes du Port pour l'Assistance et la Sécurité — Zone Portuaire & Industrielle d'Abidjan
 * Élimine 100 % des contournements de type 'as unknown as ...' ou 'any'.
 */

export interface BeforeInstallPromptUserChoice {
  readonly outcome: 'accepted' | 'dismissed';
  readonly platform: string;
}

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<BeforeInstallPromptUserChoice>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    AudioContext: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }

  interface Navigator {
    standalone?: boolean;
    vibrate?(pattern: number | number[]): boolean;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_APP_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
