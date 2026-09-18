/**
 * Client Supabase officiel pour PORTUS — U.J.S.R.V.
 * Gère la connexion avec la base de données PostgreSQL de Supabase.
 * Supporte à la fois les variables d'environnement Vite et la configuration manuelle en interface.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'portus_supabase_url';
const STORAGE_KEY_ANON_KEY = 'portus_supabase_anon_key';

let cachedClient: SupabaseClient | null = null;
let cachedUrl: string | null = null;
let cachedKey: string | null = null;

/**
 * Récupère les paramètres Supabase actifs (Vite Env ou localStorage)
 */
export function getSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

  const localUrl = localStorage.getItem(STORAGE_KEY_URL)?.trim();
  const localKey = localStorage.getItem(STORAGE_KEY_ANON_KEY)?.trim();

  const activeUrl = envUrl || localUrl || '';
  const activeKey = envKey || localKey || '';

  const isConfigured = Boolean(
    activeUrl &&
    activeUrl.startsWith('http') &&
    activeKey &&
    activeKey.length > 20
  );

  return {
    url: activeUrl,
    anonKey: activeKey,
    isConfigured,
  };
}

/**
 * Enregistre une configuration Supabase personnalisée dans le navigateur
 */
export function setCustomSupabaseConfig(url: string, anonKey: string): void {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();

  if (cleanUrl) {
    localStorage.setItem(STORAGE_KEY_URL, cleanUrl);
  } else {
    localStorage.removeItem(STORAGE_KEY_URL);
  }

  if (cleanKey) {
    localStorage.setItem(STORAGE_KEY_ANON_KEY, cleanKey);
  } else {
    localStorage.removeItem(STORAGE_KEY_ANON_KEY);
  }

  // Réinitialiser le client en cache
  cachedClient = null;
  cachedUrl = null;
  cachedKey = null;
}

/**
 * Obtient l'instance unique du client Supabase
 */
export function getSupabase(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseConfig();

  if (!isConfigured) {
    return null;
  }

  if (cachedClient && cachedUrl === url && cachedKey === anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      db: {
        schema: 'public',
      },
    });
    cachedUrl = url;
    cachedKey = anonKey;
    return cachedClient;
  } catch (err) {
    console.error('Erreur initialisation Supabase client:', err);
    return null;
  }
}

/**
 * Teste la connectivité directe avec Supabase PostgreSQL
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  tableCount?: number;
  tablesFound?: string[];
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      success: false,
      message: 'Supabase n’est pas configuré. Veuillez renseigner l’URL et la clé anonyme (ANON KEY).',
    };
  }

  try {
    // Vérifier l'accès à la table profiles ou app_settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('app_settings')
      .select('key, value')
      .limit(5);

    if (settingsError) {
      // Tester la table sectors
      const { data: sectorsData, error: sectorsError } = await supabase
        .from('sectors')
        .select('id, code, name')
        .limit(5);

      if (sectorsError) {
        return {
          success: false,
          message: `Connexion refusée ou schéma non initialisé: ${sectorsError.message} (Avez-vous exécuté le script SQL dans Supabase ?)`,
        };
      }

      return {
        success: true,
        message: 'Connexion PostgreSQL Supabase réussie avec succès ! Table "sectors" accessible.',
        tableCount: sectorsData?.length || 0,
        tablesFound: ['sectors'],
      };
    }

    return {
      success: true,
      message: 'Connexion PostgreSQL Supabase réussie avec succès ! Schéma opérationnel.',
      tableCount: settingsData?.length || 0,
      tablesFound: ['app_settings', 'sectors'],
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Erreur de connexion réseau: ${err.message || 'Impossible de joindre le serveur Supabase'}`,
    };
  }
}
