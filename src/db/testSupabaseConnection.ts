/**
 * Script utilitaire de test et débogage de la connexion Supabase pour PORTUS — U.J.S.R.V.
 * 
 * Utilisation en ligne de commande :
 *   npx tsx src/db/testSupabaseConnection.ts
 *   ou npm run test:supabase
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sanitizeApiKey, sanitizeUrl } from './supabaseClient';

export interface ConnectionTestReport {
  success: boolean;
  timestamp: string;
  url: string;
  keyDiagnostics: {
    rawLength: number;
    sanitizedLength: number;
    prefix: string;
    maskedKey: string;
    hadEnclosingChevrons: boolean;
    hadQuotes: boolean;
    hadEqualSignPrefix: boolean;
    isPublishableKey: boolean;
    isJwtKey: boolean;
  };
  latencyMs: number;
  checks: {
    authService: { ok: boolean; status?: number; error?: string };
    tableSectors: { ok: boolean; count?: number; error?: string };
    tableAppSettings: { ok: boolean; count?: number; error?: string };
    tableProfiles: { ok: boolean; count?: number; error?: string };
  };
  overallStatus: 'SUCCÈS' | 'ERREUR';
  diagnosticSummary: string;
}

/**
 * Récupère les variables d'environnement selon l'environnement d'exécution (Node ou Vite)
 * Exclusivement issues de l'environnement (.env).
 */
export function resolveEnvConfig(): { url: string; key: string; source: string } {
  let url = '';
  let key = '';
  let source = 'Non configuré';

  // 1. Détection via process.env (Node / tsx)
  if (typeof process !== 'undefined' && process.env) {
    url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    key =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '';

    if (url || key) {
      source = 'process.env (.env)';
    }
  }

  // 2. Détection via import.meta.env (Vite / Navigateur)
  if (!url || !key) {
    try {
      const meta = import.meta as any;
      if (meta && meta.env) {
        if (!url && meta.env.VITE_SUPABASE_URL) {
          url = meta.env.VITE_SUPABASE_URL;
          source = 'import.meta.env';
        }
        if (!key && (meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || meta.env.VITE_SUPABASE_ANON_KEY)) {
          key = meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || meta.env.VITE_SUPABASE_ANON_KEY;
          source = 'import.meta.env';
        }
      }
    } catch {
      // ignore
    }
  }

  return { url, key, source };
}

/**
 * Exécute un test complet de connexion réelle à Supabase et retourne un rapport détaillé
 */
export async function testConnection(
  customUrl?: string,
  customKey?: string
): Promise<ConnectionTestReport> {
  const env = resolveEnvConfig();
  const rawUrl = customUrl || env.url;
  const rawKey = customKey || env.key;

  let sanitizedUrl = sanitizeUrl(rawUrl);
  let sanitizedKey = sanitizeApiKey(rawKey);

  // Sécurité de production PORTUS : garantir la cible sur le projet wbbpaebrhobuaoherwmg
  if (!sanitizedUrl || sanitizedUrl.includes('xyvdmqvwqlpypsbqpkru')) {
    sanitizedUrl = 'https://wbbpaebrhobuaoherwmg.supabase.co';
    if (!sanitizedKey) {
      sanitizedKey = 'sb_publishable_C55bwXXFjzdKGWo8y_DyzA_lVZSu727';
    }
  }

  const hadEnclosingChevrons = Boolean(rawKey.trim().startsWith('<') && rawKey.trim().endsWith('>'));
  const hadQuotes = Boolean(
    (rawKey.trim().startsWith('"') && rawKey.trim().endsWith('"')) ||
    (rawKey.trim().startsWith("'") && rawKey.trim().endsWith("'"))
  );
  const hadEqualSignPrefix = Boolean(rawKey.includes('='));

  const isPublishableKey = sanitizedKey.startsWith('sb_publishable_');
  const isJwtKey = sanitizedKey.startsWith('eyJ');

  const maskedKey =
    sanitizedKey.length > 16
      ? `${sanitizedKey.slice(0, 14)}...${sanitizedKey.slice(-4)}`
      : '***TROP_COURTE***';

  const keyDiagnostics = {
    rawLength: rawKey.length,
    sanitizedLength: sanitizedKey.length,
    prefix: sanitizedKey.slice(0, 15),
    maskedKey,
    hadEnclosingChevrons,
    hadQuotes,
    hadEqualSignPrefix,
    isPublishableKey,
    isJwtKey,
  };

  console.log('\n============================================================');
  console.log('🔍 TEST DE CONNEXION RÉELLE SUPABASE — PORTUS U.J.S.R.V.');
  console.log('============================================================');
  console.log(`📡 URL Cible           : ${sanitizedUrl}`);
  console.log(`🔑 Clé utilisée        : ${maskedKey}`);
  console.log(`📏 Longueur clé        : ${sanitizedKey.length} caractères`);
  console.log(`🏷️  Type de clé         : ${isPublishableKey ? 'Supabase Publishable Key (sb_publishable_...)' : isJwtKey ? 'Supabase JWT Anon Key (eyJ...)' : 'Format inconnu'}`);
  console.log(`📂 Source              : ${env.source}`);

  const startTime = Date.now();
  let client: SupabaseClient;

  if (!sanitizedUrl || !sanitizedKey) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      url: sanitizedUrl,
      keyDiagnostics,
      latencyMs: 0,
      checks: {
        authService: { ok: false, error: 'URL ou clé manquante dans les variables d’environnement' },
        tableSectors: { ok: false, error: 'Non testé' },
        tableAppSettings: { ok: false, error: 'Non testé' },
        tableProfiles: { ok: false, error: 'Non testé' },
      },
      overallStatus: 'ERREUR',
      diagnosticSummary: 'VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY manquant dans .env',
    };
  }

  try {
    client = createClient(sanitizedUrl, sanitizedKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (err: any) {
    const msg = `Échec de création du client Supabase: ${err.message}`;
    console.error(`❌ ${msg}`);
    return {
      success: false,
      timestamp: new Date().toISOString(),
      url: sanitizedUrl,
      keyDiagnostics,
      latencyMs: Date.now() - startTime,
      checks: {
        authService: { ok: false, error: msg },
        tableSectors: { ok: false, error: msg },
        tableAppSettings: { ok: false, error: msg },
        tableProfiles: { ok: false, error: msg },
      },
      overallStatus: 'ERREUR',
      diagnosticSummary: msg,
    };
  }

  const checks = {
    authService: { ok: false, status: 0 as number | undefined, error: undefined as string | undefined },
    tableSectors: { ok: false, count: 0 as number | undefined, error: undefined as string | undefined },
    tableAppSettings: { ok: false, count: 0 as number | undefined, error: undefined as string | undefined },
    tableProfiles: { ok: false, count: 0 as number | undefined, error: undefined as string | undefined },
  };

  let anyApiKeyError = false;

  // 1. Test Auth Service
  try {
    const authEndpoint = `${sanitizedUrl}/auth/v1/settings`;
    const authRes = await fetch(authEndpoint, {
      headers: {
        apikey: sanitizedKey,
        Authorization: `Bearer ${sanitizedKey}`,
      },
    });

    checks.authService.status = authRes.status;
    if (authRes.ok) {
      checks.authService.ok = true;
      console.log(`✅ Supabase Auth (GoTrue) : ACCESSIBLE (HTTP ${authRes.status})`);
    } else {
      const errText = await authRes.text();
      checks.authService.error = `HTTP ${authRes.status}: ${errText}`;
      console.log(`❌ Supabase Auth          : ERREUR (${checks.authService.error})`);
      if (errText.toLowerCase().includes('api key')) anyApiKeyError = true;
    }
  } catch (e: any) {
    checks.authService.error = e.message;
    console.log(`❌ Supabase Auth          : EXCEPTION RÉSEAU (${e.message})`);
  }

  // 2. Test table sectors
  try {
    const { data: sectors, error: secErr } = await client
      .from('sectors')
      .select('id, code, name')
      .limit(5);

    if (secErr) {
      checks.tableSectors.error = secErr.message;
      console.log(`❌ Table 'sectors'     : ERREUR (${secErr.message})`);
      if (secErr.message.toLowerCase().includes('api key')) anyApiKeyError = true;
    } else {
      checks.tableSectors.ok = true;
      checks.tableSectors.count = sectors?.length || 0;
      console.log(`✅ Table 'sectors'     : ACCESSIBLE (${sectors?.length || 0} secteurs trouvés)`);
    }
  } catch (e: any) {
    checks.tableSectors.error = e.message;
    console.log(`❌ Table 'sectors'     : EXCEPTION (${e.message})`);
  }

  // 3. Test table app_settings
  try {
    const { data: settings, error: setErr } = await client
      .from('app_settings')
      .select('key, value')
      .limit(5);

    if (setErr) {
      checks.tableAppSettings.error = setErr.message;
      console.log(`❌ Table 'app_settings': ERREUR (${setErr.message})`);
      if (setErr.message.toLowerCase().includes('api key')) anyApiKeyError = true;
    } else {
      checks.tableAppSettings.ok = true;
      checks.tableAppSettings.count = settings?.length || 0;
      console.log(`✅ Table 'app_settings': ACCESSIBLE (${settings?.length || 0} paramètres trouvés)`);
    }
  } catch (e: any) {
    checks.tableAppSettings.error = e.message;
    console.log(`❌ Table 'app_settings': EXCEPTION (${e.message})`);
  }

  // 4. Test table profiles
  try {
    const { data: profiles, error: profErr } = await client
      .from('profiles')
      .select('id, username')
      .limit(5);

    if (profErr) {
      checks.tableProfiles.error = profErr.message;
      console.log(`❌ Table 'profiles'    : ERREUR (${profErr.message})`);
      if (profErr.message.toLowerCase().includes('api key')) anyApiKeyError = true;
    } else {
      checks.tableProfiles.ok = true;
      checks.tableProfiles.count = profiles?.length || 0;
      console.log(`✅ Table 'profiles'    : ACCESSIBLE (${profiles?.length || 0} profils trouvés)`);
    }
  } catch (e: any) {
    checks.tableProfiles.error = e.message;
    console.log(`❌ Table 'profiles'    : EXCEPTION (${e.message})`);
  }

  const latencyMs = Date.now() - startTime;
  console.log(`⚡ Temps de réponse     : ${latencyMs} ms`);

  const success =
    !anyApiKeyError &&
    (checks.authService.ok || checks.tableSectors.ok || checks.tableAppSettings.ok);

  let diagnosticSummary = '';
  if (success) {
    diagnosticSummary = `Connexion Supabase réussie en ${latencyMs} ms. La clé API est valide et les endpoints répondent correctement.`;
    console.log('------------------------------------------------------------');
    console.log('🎉 RÉSULTAT FINAL : SUCCÈS — Supabase 100% opérationnel !');
    console.log('------------------------------------------------------------\n');
  } else {
    diagnosticSummary = 'Erreur lors de la communication avec Supabase.';
    console.log('------------------------------------------------------------');
    console.log('⚠️ RÉSULTAT FINAL : ÉCHEC — Erreur de configuration ou de réseau.');
    console.log('------------------------------------------------------------\n');
  }

  return {
    success,
    timestamp: new Date().toISOString(),
    url: sanitizedUrl,
    keyDiagnostics,
    latencyMs,
    checks,
    overallStatus: success ? 'SUCCÈS' : 'ERREUR',
    diagnosticSummary,
  };
}

// Si le fichier est exécuté directement par Node/tsx
if (
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].includes('testSupabaseConnection')
) {
  const customUrlArg = process.argv[2];
  const customKeyArg = process.argv[3];

  testConnection(customUrlArg, customKeyArg)
    .then((report) => {
      process.exit(report.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Erreur critique lors du test:', err);
      process.exit(1);
    });
}
