import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// En-têtes de sécurité HTTP stricts
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Limite par défaut à 1 Mo pour protéger contre les attaques DoS mémoire (F-06)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ------------------------------------------------------------------
// RATE LIMITING EN MÉMOIRE COMPATIBLE SERVERLESS & CONTAINER (F-04)
// ------------------------------------------------------------------
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimitStore = new Map<string, RateLimitRecord>();

function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetInMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetInMs: entry.resetAt - now };
}

// Nettoyage périodique
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitStore.entries()) {
    if (now > v.resetAt) rateLimitStore.delete(k);
  }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

// ------------------------------------------------------------------
// CONFIGURATION SUPABASE CÔTÉ SERVEUR (EXCLUSIVEMENT PROCESS.ENV)
// ------------------------------------------------------------------
let rawSupabaseUrl = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://wbbpaebrhobuaoherwmg.supabase.co'
).trim();

if (!rawSupabaseUrl || rawSupabaseUrl.includes('xyvdmqvwqlpypsbqpkru')) {
  rawSupabaseUrl = 'https://wbbpaebrhobuaoherwmg.supabase.co';
}
const supabaseUrl = rawSupabaseUrl;

const supabaseSecretKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_C55bwXXFjzdKGWo8y_DyzA_lVZSu727'
).trim();

// GESTION DU SECRET HMAC CRITIQUE (S-01 & F-02)
const REVOKED_DEFAULT_SECRET = 'portus_production_master_hmac_secret_2026_ujsrv_secure';

function resolveServerHmacSecret(): string {
  const envSecret = (process.env.PORTUS_HMAC_SECRET || '').trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!envSecret || envSecret.length < 32 || envSecret === REVOKED_DEFAULT_SECRET) {
      throw new Error(
        '[PORTUS Server Security] Démarrage REFUSÉ en production : La variable PORTUS_HMAC_SECRET est obligatoire (>= 32 caractères cryptographiques) et ne doit jamais utiliser l’ancienne valeur révoquée.'
      );
    }
    return envSecret;
  }

  // En environnement de développement
  if (!envSecret || envSecret === REVOKED_DEFAULT_SECRET || envSecret.length < 32) {
    console.warn(
      '[PORTUS Server Security] AVERTISSEMENT : PORTUS_HMAC_SECRET manquant ou révoqué en dev. Génération d’une clé aléatoire de session (64 hex).'
    );
    return crypto.randomBytes(32).toString('hex');
  }

  return envSecret;
}

const PORTUS_HMAC_SECRET = resolveServerHmacSecret();

if (!supabaseUrl) {
  console.warn('[PORTUS Server] ATTENTION: VITE_SUPABASE_URL n’est pas configuré dans process.env');
}

console.log('[PORTUS Server] --- DIAGNOSTICS SUPABASE ---');
console.log('[PORTUS Server] URL:', supabaseUrl);
console.log('[PORTUS Server] Clé Secrète - Présente:', Boolean(supabaseSecretKey), `(${supabaseSecretKey ? supabaseSecretKey.length : 0} caractères)`);
if (supabaseSecretKey && supabaseSecretKey.startsWith('sb_publishable_')) {
  console.warn('[PORTUS Server] ATTENTION: La clé configurée est une clé de publication (anon), pas une clé de service ! Les opérations d’administration échoueront.');
} else if (supabaseSecretKey && supabaseSecretKey.startsWith('eyJ')) {
  console.log('[PORTUS Server] Clé de service (JWT) détectée.');
}
console.log('[PORTUS Server] -----------------------------');

let supabaseAdmin: SupabaseClient | null = null;
if (supabaseUrl && supabaseSecretKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const isServiceRoleKeyAvailable = Boolean(
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) &&
  !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.startsWith('sb_publishable_')
);

export function getDatabaseClient(req: express.Request): SupabaseClient {
  if (isServiceRoleKeyAvailable && supabaseAdmin) {
    return supabaseAdmin;
  }
  return getSupabaseUserClient(req);
}

// ------------------------------------------------------------------
// MIDDLEWARES D'AUTHENTIFICATION ET D'AUTORISATION STRICTS
// RÈGLE CRITIQUE : L'acteur est toujours déduit de la session validée
// ------------------------------------------------------------------
export interface AuthenticatedUser {
  id: string;
  email?: string;
  username: string;
  fullName: string;
  role: 'ADMINISTRATEUR' | 'RESPONSABLE' | 'AGENT' | 'CONTROLEUR' | 'CAISSIER' | 'FINANCE' | 'AUDITEUR';
  sectorId?: string | null;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
    }
  }
}

function getSupabaseUserClient(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Jeton d’authentification requis');
  }
  const token = authHeader.split(' ')[1];
  return createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_C55bwXXFjzdKGWo8y_DyzA_lVZSu727', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

interface AuthCacheRecord {
  user: AuthenticatedUser | null;
  expiresAt: number;
}
const authSessionCache = new Map<string, AuthCacheRecord>();

async function authenticateSession(req: express.Request): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.trim() === '') return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const cached = authSessionCache.get(tokenHash);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  if (authSessionCache.size > 500) authSessionCache.clear();

  if (!supabaseAdmin) {
    // Si Supabase n'est pas encore initialisé avec les clés, rejeter
    return null;
  }

  try {
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      authSessionCache.set(tokenHash, { user: null, expiresAt: now + 10000 });
      return null;
    }

    let profile: any = null;
    let profErr: any = null;

    if (isServiceRoleKeyAvailable && supabaseAdmin) {
      const res = await supabaseAdmin
        .from('profiles')
        .select('*, sector:sectors(name)')
        .eq('id', user.id)
        .maybeSingle();
      profile = res.data;
      profErr = res.error;
    }

    // Si supabaseAdmin n'a pas accès RLS ou pas de profil trouvé, requêter avec le jeton Bearer de l'utilisateur
    if (!profile) {
      try {
        const userClient = getSupabaseUserClient(req);
        const res = await userClient
          .from('profiles')
          .select('*, sector:sectors(name)')
          .eq('id', user.id)
          .maybeSingle();
        if (res.data) {
          profile = res.data;
          profErr = null;
        } else {
          // Tenter la fonction RPC autoritaire SECURITY DEFINER get_my_profile
          const { data: rpcProf } = await userClient.rpc('get_my_profile');
          if (rpcProf && typeof rpcProf === 'object') {
            profile = {
              ...rpcProf,
              sector: rpcProf.sector_name ? { name: rpcProf.sector_name } : null,
            };
            profErr = null;
          }
        }
      } catch (userClientErr) {
        console.warn('[PORTUS Server Auth] Échec résolution profil via userClient:', userClientErr);
      }
    }

    if (profErr || !profile || !profile.is_active) {
      // Si un profil existe explicitement mais est inactif (désactivé), REFUSER STRICTEMENT (S-02)
      if (profile && !profile.is_active) {
        console.warn(`[PORTUS Server Auth] Accès refusé pour compte désactivé: ${user.email} (${user.id})`);
        authSessionCache.set(tokenHash, { user: null, expiresAt: now + 10000 });
        return null;
      }

      // Amorçage Administrateur Initial (S-02) :
      // UNIQUEMENT si AUCUN profil n'existe en base (!profile),
      // que l'email est formellement vérifié, et qu'il figure dans la liste blanche configurée.
      const bootstrapEmails = (
        process.env.PORTUS_BOOTSTRAP_ADMIN_EMAILS ||
        'ypaki090@gmail.com,admin@portus-ujpas.online,admin@ujpas.ci'
      ).split(',').map((e) => e.trim().toLowerCase());

      const userEmail = (user.email || '').toLowerCase();
      const isEmailConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
      const isWhitelisted = bootstrapEmails.includes(userEmail);

      // SÉCURITÉ : Aucune élévation de privilèges via user_metadata qui est contrôlable par le client
      if (!profile && isEmailConfirmed && isWhitelisted) {
        console.log('[PORTUS Server Auth] Amorçage initial autorisé pour nouvel admin vérifié:', user.email);
        const bootUser: AuthenticatedUser = {
          id: user.id,
          email: user.email,
          username: user.email?.split('@')[0] || 'admin',
          fullName: 'Administrateur Général PORTUS',
          role: 'ADMINISTRATEUR',
          sectorId: null,
          isActive: true,
        };
        authSessionCache.set(tokenHash, { user: bootUser, expiresAt: now + 30000 });
        return bootUser;
      }
      authSessionCache.set(tokenHash, { user: null, expiresAt: now + 10000 });
      return null;
    }

    const authUser: AuthenticatedUser = {
      id: profile.id,
      email: user.email,
      username: profile.username,
      fullName: profile.full_name,
      role: profile.role,
      sectorId: profile.sector_id,
      isActive: profile.is_active,
    };

    authSessionCache.set(tokenHash, { user: authUser, expiresAt: now + 30000 });
    return authUser;
  } catch (err) {
    console.error('[PORTUS Server Auth] Erreur validation jeton:', err);
    return null;
  }
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = await authenticateSession(req);
  if (!user) {
    return res.status(401).json({
      error: 'Non authentifié. Jeton de session Bearer valide requis.',
      code: 'UNAUTHORIZED',
    });
  }
  req.authenticatedUser = user;
  next();
}

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = await authenticateSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Session non authentifiée', code: 'UNAUTHORIZED' });
  }
  if (user.role !== 'ADMINISTRATEUR') {
    return res.status(403).json({
      error: 'Action strictement réservée à l’administrateur général PORTUS',
      code: 'FORBIDDEN',
    });
  }
  req.authenticatedUser = user;
  next();
}

async function requireSupervisorOrAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = await authenticateSession(req);
  if (!user) {
    return res.status(401).json({ error: 'Session non authentifiée', code: 'UNAUTHORIZED' });
  }
  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return res.status(403).json({
      error: 'Action réservée aux responsables de secteur et administrateurs',
      code: 'FORBIDDEN',
    });
  }
  req.authenticatedUser = user;
  next();
}

// Helper pour convertir un ID frontend (ex: sec-vridi-canal) en UUID Supabase valide
async function resolveSectorUuid(sectorIdOrCode?: string): Promise<string | null> {
  if (!sectorIdOrCode) return null;
  const trimmed = sectorIdOrCode.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(trimmed)) {
    return trimmed;
  }

  const mapping: Record<string, string> = {
    'sec-vridi-port': 'VRD-PORT',
    'sec-vridi-canal': 'VRD-CANAL',
    'sec-vridi-zi': 'VRD-ZONE-IND',
    'sec-vridi-sir': 'VRD-TERMINAL',
  };

  const code = mapping[trimmed] || trimmed;

  // Assainissement strict (S-05) : autoriser uniquement les codes alphanumériques sûrs
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(code)) {
    return null;
  }

  if (!supabaseAdmin) return null;

  const { data: sector } = await supabaseAdmin
    .from('sectors')
    .select('id')
    .eq('code', code)
    .maybeSingle();

  return sector?.id || null;
}

function toValidUuid(val?: string | null): string {
  if (!val) return crypto.randomUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(val)) return val;
  const hash = crypto.createHash('sha256').update(val).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function ensureUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(val)) return val;
  return null;
}

function signCanonicalPayload(canonical: string): string {
  return crypto.createHmac('sha256', PORTUS_HMAC_SECRET).update(canonical).digest('hex');
}

// ------------------------------------------------------------------
// ROUTES API PUBLIQUES ET DE SANTÉ
// ------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'PORTUS — U.J.S.R.V.',
    organization: 'Union des Jeunes de la Sécurité Routière de Vridi',
    environment: process.env.NODE_ENV || 'development',
    serverTime: new Date().toISOString(),
    isDatabaseConfigured: Boolean(supabaseAdmin),
  });
});

// Profil connecté actuel
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.authenticatedUser });
});

// ------------------------------------------------------------------
// ROUTES D'AUTHENTIFICATION PROXY (Résilience & Zéro blocage réseau/CORS)
// ------------------------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const cleanInput = (username || '').trim();
    if (!cleanInput || !password) {
      return res.status(400).json({
        error: 'Veuillez renseigner votre identifiant et votre mot de passe.',
        code: 'MISSING_CREDENTIALS',
      });
    }

    // Rate Limiting (F-04) : 10 tentatives max par minute par IP et par identifiant
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const rateLimitIp = checkRateLimit(`login-ip:${clientIp}`, 10, 60 * 1000);
    const rateLimitId = checkRateLimit(`login-id:${cleanInput.toLowerCase()}`, 10, 60 * 1000);
    if (!rateLimitIp.allowed || !rateLimitId.allowed) {
      return res.status(429).json({
        error: 'Trop de tentatives de connexion. Veuillez patienter une minute avant de réessayer.',
        code: 'TOO_MANY_REQUESTS',
      });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({
        error: 'Serveur d’authentification indisponible. Base de données non connectée.',
        code: 'DATABASE_UNAVAILABLE',
      });
    }

    // 1. Vérification du verrouillage serveur
    try {
      const { data: lockData } = await supabaseAdmin.rpc('get_account_lockout_status', {
        p_identifier: cleanInput.toLowerCase(),
      });
      if (lockData && lockData.is_locked && lockData.remaining_seconds > 0) {
        return res.status(423).json({
          error: `Compte temporairement bloqué pendant ${Math.ceil(lockData.remaining_seconds / 60)} min suite à 5 tentatives erronées.`,
          code: 'ACCOUNT_LOCKED',
          remainingSeconds: lockData.remaining_seconds,
        });
      }
    } catch {
      // Ignorer si la fonction RPC est indisponible
    }

    // 2. Résolution de l'adresse email cible
    let targetEmail: string;
    if (cleanInput.includes('@')) {
      targetEmail = cleanInput.toLowerCase();
    } else {
      let resolved: string | null = null;
      try {
        const { data: rpcEmail } = await supabaseAdmin.rpc('resolve_username_for_auth', {
          p_username: cleanInput.toLowerCase(),
        });
        if (rpcEmail && typeof rpcEmail === 'string' && rpcEmail.includes('@')) {
          resolved = rpcEmail.toLowerCase();
        }
      } catch (err: any) {
        console.warn('RPC resolve_username_for_auth warning:', err?.message);
      }

      // Si l'identifiant est l'administrateur par défaut
      if (!resolved && (cleanInput.toLowerCase() === 'admin' || cleanInput.toLowerCase() === 'ypaki090')) {
        resolved = 'ypaki090@gmail.com';
      }

      if (!resolved) {
        // Enregistrer la tentative infructueuse
        try {
          await supabaseAdmin.rpc('record_login_attempt', {
            p_identifier: cleanInput.toLowerCase(),
            p_is_success: false,
            p_failure_reason: 'Identifiant introuvable',
            p_ip: req.ip || null,
            p_user_agent: (req.headers['user-agent'] as string) || null,
          });
        } catch {}

        return res.status(401).json({
          error: 'Identifiant ou mot de passe incorrect.',
          code: 'INVALID_CREDENTIALS',
        });
      }

      targetEmail = resolved;
    }

    // 3. Authentification Supabase Auth
    const { data: authData, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
      email: targetEmail,
      password,
    });

    if (authErr || !authData?.user) {
      let attemptsLeft: number | undefined;
      let isLocked = false;
      let remainingSeconds = 0;

      try {
        const { data: lockResult } = await supabaseAdmin.rpc('record_login_attempt', {
          p_identifier: cleanInput.toLowerCase(),
          p_is_success: false,
          p_failure_reason: authErr?.message || 'Mot de passe erroné',
          p_ip: req.ip || null,
          p_user_agent: (req.headers['user-agent'] as string) || null,
        });

        if (lockResult) {
          isLocked = lockResult.is_locked || false;
          remainingSeconds = lockResult.remaining_seconds || 0;
          attemptsLeft = lockResult.attempts_left;
        }
      } catch {}

      if (isLocked && remainingSeconds > 0) {
        return res.status(423).json({
          error: 'Compte temporairement bloqué pendant 15 minutes suite à 5 tentatives erronées.',
          code: 'ACCOUNT_LOCKED',
          remainingSeconds,
        });
      }

      if (typeof attemptsLeft === 'number' && attemptsLeft <= 2) {
        return res.status(401).json({
          error: `Identifiant ou mot de passe incorrect. Attention : plus que ${attemptsLeft} tentative(s) avant verrouillage.`,
          code: 'INVALID_CREDENTIALS',
          attemptsLeft,
        });
      }

      return res.status(401).json({
        error: 'Identifiant ou mot de passe incorrect.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // 4. Succès : enregistrer tentative réussie
    try {
      await supabaseAdmin.rpc('record_login_attempt', {
        p_identifier: cleanInput.toLowerCase(),
        p_is_success: true,
        p_failure_reason: null,
        p_ip: req.ip || null,
        p_user_agent: (req.headers['user-agent'] as string) || null,
      });
    } catch {}

    const authUserId = authData.user.id;

    // 5. Récupération du profil
    let profile: any = null;
    if (isServiceRoleKeyAvailable && supabaseAdmin) {
      const { data: p } = await supabaseAdmin
        .from('profiles')
        .select('*, sector:sectors(name)')
        .eq('id', authUserId)
        .maybeSingle();
      profile = p;
    }

    let loginUserClient: SupabaseClient | null = null;
    if (authData.session?.access_token) {
      try {
        loginUserClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_C55bwXXFjzdKGWo8y_DyzA_lVZSu727', {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            headers: {
              Authorization: `Bearer ${authData.session.access_token}`
            }
          }
        });
      } catch {}
    }

    if (!profile && loginUserClient) {
      try {
        const { data: p } = await loginUserClient
          .from('profiles')
          .select('*, sector:sectors(name)')
          .eq('id', authUserId)
          .maybeSingle();
        if (p) {
          profile = p;
        } else {
          const { data: myProf } = await loginUserClient.rpc('get_my_profile');
          if (myProf && typeof myProf === 'object') {
            profile = {
              ...myProf,
              sector: myProf.sector_name ? { name: myProf.sector_name } : null,
            };
          }
        }
      } catch (err: any) {
        console.warn('[PORTUS Server Login] Erreur récupération profil via user token:', err?.message);
      }
    }

    if (!profile) {
      // Profil initial si premier accès
      const nowIso = new Date().toISOString();
      const defaultRole = (cleanInput.toLowerCase() === 'ypaki090' || cleanInput.toLowerCase() === 'admin' || targetEmail === 'ypaki090@gmail.com') 
        ? 'ADMINISTRATEUR' 
        : (authData.user.user_metadata?.role || 'AGENT');

      const initialProfile = {
        id: authUserId,
        username: cleanInput.includes('@') ? cleanInput.split('@')[0] : cleanInput,
        full_name: authData.user.user_metadata?.full_name || 'Collaborateur PORTUS',
        role: defaultRole,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      };

      try {
        const writerClient = (isServiceRoleKeyAvailable && supabaseAdmin) ? supabaseAdmin : loginUserClient;
        if (writerClient) {
          const { error: upsertErr } = await writerClient.from('profiles').upsert(initialProfile);
          if (upsertErr) {
            console.error('[PORTUS Server Login] Erreur lors de l’upsert du profil initial:', upsertErr.message, upsertErr);
          } else {
            console.log('[PORTUS Server Login] Profil initial upserted avec succès pour:', initialProfile.username);
          }
        }
      } catch (err: any) {
        console.error('[PORTUS Server Login] Exception lors de l’upsert du profil initial:', err.message, err);
      }
      profile = initialProfile;
    }

    if (!profile.is_active) {
      return res.status(403).json({
        error: 'Ce compte professionnel a été désactivé par l’administrateur général.',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const formattedUser: AuthenticatedUser = {
      id: profile.id,
      email: authData.user.email,
      username: profile.username || targetEmail.split('@')[0],
      fullName: profile.full_name || targetEmail,
      role: profile.role || ((cleanInput.toLowerCase() === 'ypaki090' || cleanInput.toLowerCase() === 'admin' || targetEmail === 'ypaki090@gmail.com') ? 'ADMINISTRATEUR' : 'AGENT'),
      sectorId: profile.sector_id || null,
      isActive: true,
    };

    return res.json({
      success: true,
      user: formattedUser,
      session: authData.session,
    });
  } catch (err: any) {
    console.error('[PORTUS Auth] Erreur interne login:', err);
    return res.status(500).json({
      error: `Erreur interne du serveur d'authentification : ${err.message}`,
      code: 'SERVER_ERROR',
    });
  }
});

app.get('/api/auth/lockout-status', async (req, res) => {
  try {
    const username = ((req.query.username as string) || '').trim().toLowerCase();
    if (!username || !supabaseAdmin) {
      return res.json({ isLocked: false, remainingSeconds: 0 });
    }
    const { data } = await supabaseAdmin.rpc('get_account_lockout_status', { p_identifier: username });
    return res.json({
      isLocked: data?.is_locked || false,
      remainingSeconds: data?.remaining_seconds || 0,
    });
  } catch {
    return res.json({ isLocked: false, remainingSeconds: 0 });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Adresse e-mail invalide.', code: 'INVALID_EMAIL' });
    }

    // Rate Limiting (F-04) : 5 demandes par minute par IP
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const rateLimit = checkRateLimit(`forgot-ip:${clientIp}`, 5, 60 * 1000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ error: 'Trop de requêtes. Veuillez patienter une minute.', code: 'TOO_MANY_REQUESTS' });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Service d’authentification indisponible.' });
    }

    // Protection anti-énumération de comptes (F-05) : réponse identique en cas de succès ou d'absence de compte
    try {
      await supabaseAdmin.auth.resetPasswordForEmail(email.trim().toLowerCase());
    } catch (resetErr) {
      console.warn('[PORTUS Auth] Reset password internal log:', resetErr);
    }

    return res.json({
      success: true,
      message: 'Si cette adresse correspond à un compte actif, un lien de réinitialisation sécurisé a été transmis par courrier électronique.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erreur lors du traitement de la demande de réinitialisation.' });
  }
});

// ------------------------------------------------------------------
// TARIFICATION OFFICIELLE CENTRALISÉE (Source autoritaire)
// ------------------------------------------------------------------
app.get('/api/pricing', async (req, res) => {
  try {
    let price = 5000;
    if (supabaseAdmin) {
      const { data } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'ticket_price_fcfa')
        .maybeSingle();
      if (data && data.value) {
        price = typeof data.value === 'number' ? data.value : Number(data.value) || 5000;
      }
    }
    res.json({
      price,
      currency: 'FCFA',
      validityDays: 7,
      organization: 'Union des Jeunes de la Sécurité Routière de Vridi',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// ÉTAT & STATISTIQUES DE LA BASE DE DONNÉES (SUPABASE POSTGRESQL)
// ------------------------------------------------------------------
app.get('/api/database/status', async (req, res) => {
  const startTime = Date.now();
  if (!supabaseAdmin) {
    return res.json({
      connected: false,
      error: 'Supabase n’est pas configuré sur le serveur (SUPABASE_SERVICE_ROLE_KEY ou URL manquante).',
      tables: {},
      latencyMs: 0,
    });
  }

  try {
    const dbClient = (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
      ? getDatabaseClient(req)
      : (supabaseAdmin || getDatabaseClient(req));

    const [
      profilesRes,
      sectorsRes,
      carnetsRes,
      ticketsRes,
      salesRes,
      remisesRes,
      expensesRes,
      controlsRes,
      fraudsRes,
    ] = await Promise.all([
      dbClient.from('profiles').select('id', { count: 'exact', head: true }),
      dbClient.from('sectors').select('id', { count: 'exact', head: true }),
      dbClient.from('carnets').select('id', { count: 'exact', head: true }),
      dbClient.from('tickets').select('id', { count: 'exact', head: true }),
      dbClient.from('sales').select('id', { count: 'exact', head: true }),
      dbClient.from('remittances').select('id', { count: 'exact', head: true }),
      dbClient.from('expenses').select('id', { count: 'exact', head: true }),
      dbClient.from('controls').select('id', { count: 'exact', head: true }),
      dbClient.from('fraud_reports').select('id', { count: 'exact', head: true }),
    ]);

    const latencyMs = Date.now() - startTime;
    return res.json({
      connected: true,
      url: supabaseUrl.replace(/^https?:\/\//, '').split('.')[0] + '.supabase.co',
      latencyMs,
      isServiceRoleMode: isServiceRoleKeyAvailable,
      tables: {
        profiles: profilesRes.count ?? (profilesRes.error ? -1 : 0),
        sectors: sectorsRes.count ?? (sectorsRes.error ? -1 : 0),
        carnets: carnetsRes.count ?? (carnetsRes.error ? -1 : 0),
        tickets: ticketsRes.count ?? (ticketsRes.error ? -1 : 0),
        sales: salesRes.count ?? (salesRes.error ? -1 : 0),
        remittances: remisesRes.count ?? (remisesRes.error ? -1 : 0),
        expenses: expensesRes.count ?? (expensesRes.error ? -1 : 0),
        controls: controlsRes.count ?? (controlsRes.error ? -1 : 0),
        fraud_reports: fraudsRes.count ?? (fraudsRes.error ? -1 : 0),
      },
      hasRlsIssue: Boolean(!isServiceRoleKeyAvailable && (profilesRes.error || ticketsRes.error || carnetsRes.error)),
      rlsNotice: !isServiceRoleKeyAvailable
        ? 'Serveur en mode publishable/anon : les opérations globales utilisent le contexte utilisateur connecté ou requièrent SUPABASE_SERVICE_ROLE_KEY pour le contournement RLS complet.'
        : undefined,
    });
  } catch (err: any) {
    return res.json({
      connected: false,
      error: err?.message || 'Erreur inconnue de connexion à la base de données',
      tables: {},
      latencyMs: Date.now() - startTime,
    });
  }
});

app.put('/api/pricing', requireAdmin, async (req, res) => {
  try {
    const { price } = req.body;
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ error: 'Montant de tarification invalide.' });
    }

    if (supabaseAdmin) {
      await supabaseAdmin.from('app_settings').upsert({
        key: 'ticket_price_fcfa',
        value: numPrice,
        description: 'Prix officiel unitaire de la taxe de stationnement en FCFA',
        updated_by: req.authenticatedUser!.id,
        updated_at: new Date().toISOString(),
      });

      // Audit log
      await supabaseAdmin.from('audit_logs').insert({
        actor_id: req.authenticatedUser!.id,
        actor_name: req.authenticatedUser!.fullName,
        actor_role: req.authenticatedUser!.role,
        action: 'CONFIG_UPDATE',
        target_entity: 'AppSetting',
        target_id: 'ticket_price_fcfa',
        new_value: { price: numPrice },
        details: `Modification du prix unitaire du ticket à ${numPrice} FCFA`,
      });
    }

    res.json({ success: true, price: numPrice });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// ROUTES API UTILISATEURS & ADMINISTRATEUR (GESTION COMPTES)
// ------------------------------------------------------------------

app.get('/api/users', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé côté serveur');
    const actor = req.authenticatedUser!;

    // Si AGENT ou CONTROLEUR, limiter la visibilité pour respecter le principe de moindre privilège
    let query = supabaseAdmin
      .from('profiles')
      .select('*, sector:sectors(name)');

    if (actor.role === 'AGENT' || actor.role === 'CONTROLEUR') {
      if (actor.sectorId) {
        query = query.eq('sector_id', actor.sectorId);
      }
    }

    const { data, error } = await query.order('full_name', { ascending: true });

    if (error) throw error;
    res.json({ users: data || [] });
  } catch (err: any) {
    console.error('[API Users] Erreur fetch users:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé côté serveur');
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*, sector:sectors(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ users: data || [] });
  } catch (err: any) {
    console.error('[API Admin] Erreur fetch users:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé côté serveur');
    const { username, fullName, role, sectorId, phone, passwordRaw } = req.body;

    if (!username || !fullName || !passwordRaw) {
      return res.status(400).json({ error: 'Nom d’utilisateur, nom complet et mot de passe sont obligatoires' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const email = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@portus-ujpas.online`;

    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: `Le nom d’utilisateur "${cleanUsername}" est déjà utilisé.` });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: passwordRaw,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        full_name: fullName.trim(),
        role,
      },
    });

    if (authErr || !authData?.user) {
      return res.status(400).json({ error: authErr?.message || 'Erreur lors de la création Auth' });
    }

    const newUserId = authData.user.id;
    const resolvedSectorId = (role === 'AGENT' || role === 'RESPONSABLE') ? await resolveSectorUuid(sectorId) : null;

    const { data: newProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUserId,
        username: cleanUsername,
        full_name: fullName.trim(),
        role,
        sector_id: resolvedSectorId,
        phone: phone?.trim() || null,
        is_active: true,
        failed_attempts: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*, sector:sectors(name)')
      .single();

    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      return res.status(500).json({ error: `Erreur insertion profil : ${profileErr.message}` });
    }

    res.status(201).json({ user: newProfile });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé côté serveur');
    const { id } = req.params;
    const { username, fullName, phone, sectorId, role, isActive } = req.body;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (fullName !== undefined) updates.full_name = fullName.trim();
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (sectorId !== undefined) updates.sector_id = sectorId ? await resolveSectorUuid(sectorId) : null;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.is_active = isActive;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let targetProfile: any = null;

    // 1. Recherche par UUID si l'ID transmis est un UUID valide
    if (uuidRegex.test(id)) {
      const { data: p } = await supabaseAdmin
        .from('profiles')
        .select('*, sector:sectors(name)')
        .eq('id', id)
        .maybeSingle();
      if (p) targetProfile = p;
    }

    // 2. Recherche par nom d'utilisateur (username fourni dans body ou id)
    if (!targetProfile) {
      const searchUsername = (username || id).toLowerCase();
      const { data: p } = await supabaseAdmin
        .from('profiles')
        .select('*, sector:sectors(name)')
        .eq('username', searchUsername)
        .maybeSingle();
      if (p) targetProfile = p;
    }

    // 3. Recherche dans Supabase Auth (auth.users) pour synchronisation de profil
    if (!targetProfile) {
      let authUser: any = null;
      if (uuidRegex.test(id)) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        authUser = u?.user;
      }
      if (!authUser) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers();
        const searchVal = (username || id).toLowerCase();
        authUser = list?.users?.find(
          (u) =>
            u.id === id ||
            u.user_metadata?.username?.toLowerCase() === searchVal ||
            u.email?.toLowerCase().startsWith(searchVal + '@') ||
            u.email?.toLowerCase() === searchVal
        );
      }

      if (authUser) {
        const targetUsername = authUser.user_metadata?.username || authUser.email?.split('@')[0] || username || id;
        const initialData = {
          id: authUser.id,
          username: targetUsername.toLowerCase(),
          full_name: updates.full_name || authUser.user_metadata?.full_name || 'Utilisateur',
          role: updates.role || authUser.user_metadata?.role || 'AGENT',
          sector_id: updates.sector_id,
          phone: updates.phone || null,
          is_active: updates.is_active !== undefined ? updates.is_active : true,
          failed_attempts: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: created, error: createErr } = await supabaseAdmin
          .from('profiles')
          .upsert(initialData)
          .select('*, sector:sectors(name)')
          .maybeSingle();

        if (!createErr && created) {
          targetProfile = created;
        }
      }
    }

    // 4. Si le profil existe dans Supabase, appliquer la mise à jour
    if (targetProfile) {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('id', targetProfile.id)
        .select('*, sector:sectors(name)')
        .maybeSingle();

      if (updateErr) throw updateErr;
      targetProfile = updated || { ...targetProfile, ...updates };

      // Synchroniser également dans auth.users (métadonnées & blocage)
      try {
        const authUpdates: Record<string, any> = {};
        if (role !== undefined) authUpdates.role = role;
        if (fullName !== undefined) authUpdates.full_name = fullName.trim();
        if (isActive !== undefined) authUpdates.is_active = isActive;
        if (Object.keys(authUpdates).length > 0) {
          await supabaseAdmin.auth.admin.updateUserById(targetProfile.id, {
            user_metadata: authUpdates,
            ban_duration: isActive === false ? '876600h' : 'none',
          });
        } else if (isActive !== undefined) {
          await supabaseAdmin.auth.admin.updateUserById(targetProfile.id, {
            ban_duration: isActive === false ? '876600h' : 'none',
          });
        }
      } catch (authMetaErr) {
        console.warn('[API Admin] Synchro user_metadata warning:', authMetaErr);
      }
    } else {
      // Profil purement local (IndexedDB)
      targetProfile = {
        id,
        username: username || id,
        full_name: updates.full_name || 'Utilisateur',
        role: updates.role || 'AGENT',
        sector_id: updates.sector_id,
        phone: updates.phone,
        is_active: updates.is_active !== undefined ? updates.is_active : true,
        updated_at: new Date().toISOString(),
      };
    }

    res.json({ user: targetProfile });
  } catch (err: any) {
    console.error('[API Admin Users PATCH] Erreur:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé côté serveur');
    const { id } = req.params;
    const { newPasswordRaw } = req.body;

    if (!newPasswordRaw || newPasswordRaw.length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit comporter au moins 6 caractères.' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let targetAuthUserId: string | null = null;

    if (uuidRegex.test(id)) {
      targetAuthUserId = id;
    } else {
      // Rechercher l'UUID du profil via username
      const { data: p } = await supabaseAdmin.from('profiles').select('id').eq('username', id.toLowerCase()).maybeSingle();
      if (p) {
        targetAuthUserId = p.id;
      } else {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers();
        const found = list?.users?.find(
          (u) =>
            u.id === id ||
            u.user_metadata?.username?.toLowerCase() === id.toLowerCase() ||
            u.email?.toLowerCase().startsWith(id.toLowerCase() + '@')
        );
        if (found) targetAuthUserId = found.id;
      }
    }

    if (targetAuthUserId) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetAuthUserId, {
        password: newPasswordRaw,
        ban_duration: 'none',
      });
      if (error) throw error;

      await supabaseAdmin.from('profiles').update({
        failed_attempts: 0,
        locked_until: null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }).eq('id', targetAuthUserId);
    }

    res.json({ success: true, message: 'Mot de passe mis à jour avec succès.' });
  } catch (err: any) {
    console.error('[API Admin Users Reset Password] Erreur:', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// GESTION DES CARNETS ET TICKETS SÉCURISÉE (AUTHENTIFICATION OBLIGATOIRE)
// ------------------------------------------------------------------

// Consultation des carnets et tickets (protégée selon le rôle ou synchro générale - S-04)
app.get('/api/carnets', requireAuth, async (req, res) => {
  try {
    const dbClient = getDatabaseClient(req);
    const actor = req.authenticatedUser!;

    let carnetQuery = dbClient
      .from('carnets')
      .select('*, created_profile:profiles!created_by(full_name), resp_profile:profiles!assigned_to_responsable(full_name), sectors(name)')
      .order('created_at', { ascending: false });

    // Isolation sectorielle uniquement pour responsable connecté
    if (actor && actor.role === 'RESPONSABLE') {
      carnetQuery = carnetQuery.or(`assigned_to_responsable.eq.${actor.id},sector_id.eq.${actor.sectorId || '00000000-0000-0000-0000-000000000000'}`);
    }

    const { data: carnetsData, error: carnetErr } = await carnetQuery;
    if (carnetErr) throw carnetErr;

    let ticketQuery = dbClient
      .from('tickets')
      .select('*, carnets(carnet_number), resp:profiles!assigned_responsable_id(full_name), agent:profiles!assigned_agent_id(full_name, phone), sectors(name)')
      .order('ticket_number', { ascending: true })
      .limit(3000);

    if (actor && actor.role === 'AGENT') {
      ticketQuery = ticketQuery.eq('assigned_agent_id', actor.id);
    } else if (actor && actor.role === 'RESPONSABLE') {
      ticketQuery = ticketQuery.or(`assigned_responsable_id.eq.${actor.id},sector_id.eq.${actor.sectorId || '00000000-0000-0000-0000-000000000000'}`);
    }

    const { data: ticketsData, error: ticketErr } = await ticketQuery;
    if (ticketErr) throw ticketErr;

    const carnets = (carnetsData || []).map((row: any) => ({
      id: row.id,
      carnetNumber: row.carnet_number,
      seriesPrefix: row.series_prefix,
      size: row.size,
      startNumber: row.start_number,
      endNumber: row.end_number,
      createdById: row.created_by,
      createdByName: row.created_profile?.full_name || 'ADMINISTRATEUR',
      assignedToResponsableId: row.assigned_to_responsable,
      assignedToResponsableName: row.resp_profile?.full_name,
      sectorId: row.sector_id,
      sectorName: row.sectors?.name,
      createdAt: row.created_at,
      status: row.status,
    }));

    const tickets = (ticketsData || []).map((row: any) => ({
      id: row.id,
      ticketNumber: row.ticket_number,
      carnetId: row.carnet_id,
      carnetNumber: row.carnets?.carnet_number || 'CARNET',
      qrPayload: row.qr_payload,
      status: row.status,
      price: row.price,
      assignedResponsableId: row.assigned_responsable_id,
      assignedResponsableName: row.resp?.full_name,
      assignedAgentId: row.assigned_agent_id,
      assignedAgentName: row.agent?.full_name,
      sectorId: row.sector_id,
      sectorName: row.sectors?.name,
      soldAt: row.sold_at,
      plateNumber: row.plate_number,
      driverPhone: row.driver_phone,
      controlCount: row.control_count || 0,
      createdAt: row.created_at,
    }));

    res.json({ carnets, tickets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Annulation d'un carnet (ADMINISTRATEUR STRICTEMENT)
app.post('/api/carnets/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: 'Un motif d’annulation est obligatoire.' });
    }

    const carnetId = toValidUuid(id);
    const actor = req.authenticatedUser!;

    if (!supabaseAdmin) throw new Error('Supabase non initialisé côté serveur');

    // 1. Annuler le carnet
    const { error: carnetErr } = await supabaseAdmin
      .from('carnets')
      .update({ status: 'CANCELLED' })
      .eq('id', carnetId);

    if (carnetErr) throw carnetErr;

    // 2. Annuler les tickets non vendus et non contrôlés du carnet
    const nowIso = new Date().toISOString();
    const { data: ticketsToCancel, error: fetchErr } = await supabaseAdmin
      .from('tickets')
      .select('id, status')
      .eq('carnet_id', carnetId);

    if (fetchErr) throw fetchErr;

    let cancelledCount = 0;
    const targets = (ticketsToCancel || []).filter(t => t.status !== 'SOLD' && t.status !== 'CONTROLLED');
    
    if (targets.length > 0) {
      const targetIds = targets.map(t => t.id);
      const { error: ticketErr } = await supabaseAdmin
        .from('tickets')
        .update({
          status: 'CANCELLED',
          cancelled_at: nowIso,
          cancelled_by: actor.id,
          cancellation_reason: reason.trim()
        })
        .in('id', targetIds);

      if (ticketErr) throw ticketErr;
      cancelledCount = targetIds.length;
    }

    res.json({
      success: true,
      message: `Carnet annulé avec succès (${cancelledCount} tickets annulés).`,
      cancelledCount
    });
  } catch (err: any) {
    console.error('[API Carnets] Erreur annulation carnet:', err);
    res.status(500).json({ error: err.message });
  }
});

// Suppression définitive d'un carnet (ADMINISTRATEUR STRICTEMENT)
app.delete('/api/carnets/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const carnetId = toValidUuid(id);

    // Utiliser à la fois le client utilisateur authentifié et supabaseAdmin
    const supabaseClient = getSupabaseUserClient(req);

    // 1. Récupérer tous les tickets associés à ce carnet (recherche par carnetId UUID et par id brut)
    let ticketIds: string[] = [];
    try {
      const { data: ticketsA } = await supabaseAdmin!
        .from('tickets')
        .select('id')
        .or(`carnet_id.eq.${carnetId},carnet_id.eq.${id}`);
      if (ticketsA && ticketsA.length > 0) {
        ticketIds = ticketsA.map(t => t.id);
      }
    } catch {}

    if (ticketIds.length === 0) {
      try {
        const { data: ticketsU } = await supabaseClient
          .from('tickets')
          .select('id')
          .or(`carnet_id.eq.${carnetId},carnet_id.eq.${id}`);
        if (ticketsU && ticketsU.length > 0) {
          ticketIds = ticketsU.map(t => t.id);
        }
      } catch {}
    }

    // 2. Si le carnet possède des tickets, purger tous leurs enregistrements dépendants pour éviter les violations de FK
    if (ticketIds.length > 0) {
      // Purge contrôles et signalements
      try { await supabaseAdmin?.from('controls').delete().in('ticket_id', ticketIds); } catch {}
      try { await supabaseClient.from('controls').delete().in('ticket_id', ticketIds); } catch {}
      try { await supabaseAdmin?.from('fraud_reports').delete().in('ticket_id', ticketIds); } catch {}
      try { await supabaseClient.from('fraud_reports').delete().in('ticket_id', ticketIds); } catch {}

      // Purge ventes associées
      try {
        await supabaseClient.from('sales').delete().in('ticket_id', ticketIds);
      } catch (saleErr: any) {
        console.warn('[API Carnets] Tentative suppression ventes via supabaseClient:', saleErr?.message);
        try { await supabaseAdmin?.from('sales').delete().in('ticket_id', ticketIds); } catch {}
      }

      // Purge historique et attributions
      try { await supabaseAdmin?.from('ticket_status_history').delete().in('ticket_id', ticketIds); } catch {}
      try { await supabaseClient.from('ticket_status_history').delete().in('ticket_id', ticketIds); } catch {}
      try { await supabaseAdmin?.from('ticket_assignments').delete().in('ticket_id', ticketIds); } catch {}
      try { await supabaseClient.from('ticket_assignments').delete().in('ticket_id', ticketIds); } catch {}

      // 3. Supprimer les tickets eux-mêmes
      let delTicketSuccess = false;
      if (supabaseAdmin) {
        const { error: errAdmTickets } = await supabaseAdmin
          .from('tickets')
          .delete()
          .in('id', ticketIds);
        if (!errAdmTickets) delTicketSuccess = true;
      }
      if (!delTicketSuccess) {
        const { error: errTickets } = await supabaseClient
          .from('tickets')
          .delete()
          .in('id', ticketIds);
        if (errTickets && !delTicketSuccess) throw errTickets;
      }
    }

    // 4. Supprimer enfin le carnet lui-même
    let delCarnetSuccess = false;
    if (supabaseAdmin) {
      const { error: errAdmCarnet } = await supabaseAdmin
        .from('carnets')
        .delete()
        .or(`id.eq.${carnetId},id.eq.${id}`);
      if (!errAdmCarnet) delCarnetSuccess = true;
    }
    if (!delCarnetSuccess) {
      const { error: errCarnet } = await supabaseClient
        .from('carnets')
        .delete()
        .or(`id.eq.${carnetId},id.eq.${id}`);
      if (errCarnet && !delCarnetSuccess) throw errCarnet;
    }

    res.json({
      success: true,
      message: 'Le carnet et tous ses tickets et données dépendantes ont été entièrement supprimés de Supabase.'
    });
  } catch (err: any) {
    console.error('[API Carnets] Erreur suppression carnet:', err);
    res.status(500).json({ error: err.message });
  }
});

// Annulation d'un ticket individuel (ADMINISTRATEUR STRICTEMENT)
app.post('/api/tickets/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: 'Un motif d’annulation est obligatoire.' });
    }

    const ticketId = toValidUuid(id);
    const actor = req.authenticatedUser!;

    if (!supabaseAdmin) throw new Error('Supabase non initialisé côté serveur');

    const nowIso = new Date().toISOString();
    const { error: ticketErr } = await supabaseAdmin
      .from('tickets')
      .update({
        status: 'CANCELLED',
        cancelled_at: nowIso,
        cancelled_by: actor.id,
        cancellation_reason: reason.trim()
      })
      .eq('id', ticketId);

    if (ticketErr) throw ticketErr;

    res.json({
      success: true,
      message: 'Ticket annulé avec succès.'
    });
  } catch (err: any) {
    console.error('[API Tickets] Erreur annulation ticket:', err);
    res.status(500).json({ error: err.message });
  }
});

// Réinitialisation complète de la base de données (ADMINISTRATEUR STRICTEMENT - F-01)
app.post('/api/admin/reset', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé côté serveur');

    const actor = req.authenticatedUser!;
    const { confirmationPhrase } = req.body;

    // 1. Validation de confirmation explicite
    if (confirmationPhrase !== 'CONFIRMER' && confirmationPhrase !== 'CONFIRMER_PURGE_PORTUS') {
      return res.status(400).json({
        error: 'Confirmation refusée : Vous devez fournir la confirmationPhrase exacte ("CONFIRMER" ou "CONFIRMER_PURGE_PORTUS").',
        code: 'CONFIRMATION_REQUIRED',
      });
    }

    // 2. Protection en environnement de production
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DATABASE_RESET !== 'true') {
      return res.status(403).json({
        error: 'Opération interdite : La réinitialisation est bloquée en production (ALLOW_DATABASE_RESET=true requis).',
        code: 'FORBIDDEN_IN_PRODUCTION',
      });
    }

    console.log('[API Admin] Début de la réinitialisation opérationnelle demandée par:', actor.email);

    // 3. Ordre de suppression respectant les contraintes FK (audit_logs STRICTEMENT PRÉSERVÉ)
    const tablesToPurge = [
      'controls',
      'fraud_reports',
      'sales',
      'ticket_status_history',
      'ticket_assignments',
      'remittance_adjustments',
      'remittances',
      'expenses',
      'tickets',
      'carnets',
      'notifications',
      'login_attempts',
    ];

    for (const table of tablesToPurge) {
      const { error: delErr } = await supabaseAdmin
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delErr) {
        console.error(`[API Admin Reset] Échec suppression dans ${table}:`, delErr.message);
        throw new Error(`Échec de la suppression dans la table ${table} : ${delErr.message}`);
      }
    }

    // 4. Inscription immuable dans audit_logs
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: actor.id,
        user_email: actor.email,
        action: 'SYSTEM_RESET',
        entity: 'DATABASE',
        entity_id: 'ALL_OPERATIONAL_DATA',
        details: `Purge complète des données opérationnelles effectuée par l’administrateur ${actor.email}. Table audit_logs préservée.`,
        created_at: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.warn('[API Admin Reset] Avertissement écriture audit log:', auditErr);
    }

    console.log('[API Admin] Réinitialisation opérationnelle terminée avec succès.');

    res.json({
      success: true,
      message: 'Base de données opérationnelle réinitialisée avec succès. Piste d’audit préservée.',
    });
  } catch (err: any) {
    console.error('[API Admin] Erreur réinitialisation base:', err);
    res.status(500).json({ error: err.message });
  }
});

// Création de carnet (ADMINISTRATEUR STRICTEMENT - F-02)
app.post('/api/carnets', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé');
    const { carnet, tickets } = req.body;
    if (!carnet || !carnet.carnetNumber) {
      return res.status(400).json({ error: 'Données de carnet invalides' });
    }

    const actor = req.authenticatedUser!;
    const carnetId = toValidUuid(carnet.id);
    const assignedToResp = ensureUuidOrNull(carnet.assignedToResponsableId);
    const sectorId = await resolveSectorUuid(carnet.sectorId);

    // S'assurer de la présence du profil créateur dans la table 'profiles' pour respecter la contrainte FK
    try {
      await supabaseAdmin.from('profiles').upsert({
        id: actor.id,
        username: actor.username || 'admin',
        full_name: actor.fullName || 'ADMINISTRATEUR',
        role: 'ADMINISTRATEUR',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    } catch {}

    const { error: carnetErr } = await supabaseAdmin.from('carnets').upsert({
      id: carnetId,
      carnet_number: carnet.carnetNumber,
      series_prefix: carnet.seriesPrefix || 'VRD',
      generation_batch: carnet.generationBatch || 'GEN-1',
      size: Number(carnet.size) || 30,
      start_number: Number(carnet.startNumber) || 1,
      end_number: Number(carnet.endNumber) || (Number(carnet.startNumber || 1) + Number(carnet.size || 30) - 1),
      created_by: actor.id,
      assigned_to_responsable: assignedToResp,
      sector_id: sectorId,
      status: carnet.status || 'GENERATED',
      created_at: carnet.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (carnetErr) throw carnetErr;

    if (Array.isArray(tickets) && tickets.length > 0) {
      // Autorité HMAC unifiée (F-02) :
      // On insère sans qr_payload préalable pour que le trigger PostgreSQL trg_generate_secure_ticket_qr
      // calcule et enregistre la signature HMAC officielle de manière autoritaire.
      const formattedTickets = tickets.map((t: any) => {
        const tid = toValidUuid(t.id);
        const price = Number(t.price) || 5000;

        return {
          id: tid,
          ticket_number: t.ticketNumber,
          carnet_id: carnetId,
          generation_batch: t.generationBatch || 'GEN-1',
          qr_payload: null, // Généré et signé authoritairement par PostgreSQL
          status: t.status || 'GENERATED',
          price,
          assigned_responsable_id: assignedToResp,
          assigned_agent_id: ensureUuidOrNull(t.assignedAgentId),
          sector_id: sectorId,
          created_at: t.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

      for (let i = 0; i < formattedTickets.length; i += 50) {
        const chunk = formattedTickets.slice(i, i + 50);
        const { error: tickErr } = await supabaseAdmin.from('tickets').upsert(chunk, { onConflict: 'id' });
        if (tickErr) throw tickErr;
      }
    }

    // Récupérer les tickets avec les payloads signés par PostgreSQL
    const { data: savedTickets } = await supabaseAdmin
      .from('tickets')
      .select('id, ticket_number, qr_payload, price, status')
      .eq('carnet_id', carnetId);

    res.json({
      success: true,
      carnetId,
      ticketsCount: tickets?.length || 0,
      tickets: savedTickets || [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Synchronisation par lot (AUTHENTIFICATION OBLIGATOIRE - F-03)
app.post('/api/carnets/sync', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé');
    const actor = req.authenticatedUser!;
    const { carnets, tickets, sales } = req.body;
    let syncedCarnets = 0;
    let syncedTickets = 0;
    let syncedSales = 0;
    const syncResults: Array<{ saleId: string; ticketId?: string; status: 'SUCCESS' | 'ERROR'; message?: string }> = [];

    // 1. Synchronisation des carnets entiers (Admin ou Superviseur)
    if (Array.isArray(carnets) && carnets.length > 0 && (actor.role === 'ADMINISTRATEUR' || actor.role === 'RESPONSABLE')) {
      for (const carnet of carnets) {
        const carnetId = toValidUuid(carnet.id);
        const { error } = await supabaseAdmin.from('carnets').upsert({
          id: carnetId,
          carnet_number: carnet.carnetNumber,
          series_prefix: carnet.seriesPrefix || 'VRD',
          size: Number(carnet.size) || 30,
          start_number: Number(carnet.startNumber) || 1,
          end_number: Number(carnet.endNumber) || (Number(carnet.startNumber || 1) + Number(carnet.size || 30) - 1),
          created_by: toValidUuid(carnet.createdById || actor.id),
          assigned_to_responsable: ensureUuidOrNull(carnet.assignedToResponsableId),
          sector_id: ensureUuidOrNull(carnet.sectorId),
          status: carnet.status || 'GENERATED',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (!error) syncedCarnets++;
      }
    }

    // 2. Récupérer le tarif officiel configurable (F-03)
    let officialTicketPrice = 5000;
    try {
      const { data: priceSetting } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'ticket_price_fcfa')
        .maybeSingle();
      if (priceSetting?.value) {
        officialTicketPrice = typeof priceSetting.value === 'number' ? priceSetting.value : Number(priceSetting.value) || 5000;
      }
    } catch {}

    // 3. Synchronisation des ventes (Validation par élément, sans interruption du lot - F-03)
    if (Array.isArray(sales) && sales.length > 0) {
      for (const sale of sales) {
        const saleId = toValidUuid(sale.id);
        const cleanPlate = (sale.plateNumber || '').toUpperCase().trim();

        // Plaque d'immatriculation strictement obligatoire
        if (!cleanPlate) {
          syncResults.push({
            saleId,
            status: 'ERROR',
            message: 'Plaque d’immatriculation manquante ou vide.',
          });
          continue;
        }

        const ticketId = toValidUuid(sale.ticketId);
        const idempotencyKey = toValidUuid(sale.syncIdempotencyKey || sale.id);

        // Vérification de l'existence et de l'appartenance du ticket
        const { data: existingTicket, error: tktErr } = await supabaseAdmin
          .from('tickets')
          .select('id, ticket_number, status, assigned_agent_id, sector_id')
          .eq('id', ticketId)
          .maybeSingle();

        if (tktErr || !existingTicket) {
          syncResults.push({
            saleId,
            ticketId,
            status: 'ERROR',
            message: 'Ticket inexistant dans le registre officiel.',
          });
          continue;
        }

        // Vérification des droits d'émission : assigné à l'agent ou au secteur
        const isOwner = existingTicket.assigned_agent_id === actor.id;
        const isSectorMatch = actor.sectorId && existingTicket.sector_id === actor.sectorId;
        const isPrivileged = actor.role === 'ADMINISTRATEUR' || actor.role === 'RESPONSABLE';

        if (!isOwner && !isSectorMatch && !isPrivileged) {
          syncResults.push({
            saleId,
            ticketId,
            status: 'ERROR',
            message: 'Ticket non attribué à cet agent ou à son secteur.',
          });
          continue;
        }

        // Vérification de compatibilité de statut (AVAILABLE, ASSIGNED_TO_AGENT ou déjà SOLD)
        if (existingTicket.status !== 'AVAILABLE' && existingTicket.status !== 'ASSIGNED_TO_AGENT' && existingTicket.status !== 'SOLD') {
          syncResults.push({
            saleId,
            ticketId,
            status: 'ERROR',
            message: `Statut de ticket incompatible (${existingTicket.status}) pour validation de vente.`,
          });
          continue;
        }

        const soldAtIso = sale.soldAt || new Date().toISOString();
        const driverPhone = sale.driverPhone?.trim() || null;

        const { error: saleErr } = await supabaseAdmin.from('sales').upsert({
          id: saleId,
          ticket_id: ticketId,
          ticket_number: sale.ticketNumber || existingTicket.ticket_number,
          agent_id: actor.id,
          sector_id: ensureUuidOrNull(sale.sectorId || existingTicket.sector_id || actor.sectorId),
          plate_number: cleanPlate,
          driver_phone: driverPhone,
          sold_at: soldAtIso,
          price: officialTicketPrice,
          sync_idempotency_key: idempotencyKey,
        }, { onConflict: 'sync_idempotency_key' });

        if (saleErr) {
          syncResults.push({
            saleId,
            ticketId,
            status: 'ERROR',
            message: saleErr.message,
          });
          continue;
        }

        // Mise à jour synchrone du ticket vers l'état VENDU
        await supabaseAdmin
          .from('tickets')
          .update({
            status: 'SOLD',
            plate_number: cleanPlate,
            driver_phone: driverPhone,
            sold_at: soldAtIso,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ticketId);

        syncedSales++;
        syncResults.push({
          saleId,
          ticketId,
          status: 'SUCCESS',
        });
      }
    }

    res.json({
      success: true,
      syncedCarnets,
      syncedTickets,
      syncedSales,
      results: syncResults,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Attribution de carnet (Superviseur ou Admin)
app.patch('/api/carnets/:id/assign', requireSupervisorOrAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé');
    const { id } = req.params;
    const { responsableId, sectorId } = req.body;
    const carnetId = toValidUuid(id);
    const resolvedRespId = ensureUuidOrNull(responsableId);
    const resolvedSectorId = ensureUuidOrNull(sectorId);

    const { error: carnetErr } = await supabaseAdmin
      .from('carnets')
      .update({
        assigned_to_responsable: resolvedRespId,
        sector_id: resolvedSectorId,
        status: resolvedRespId ? 'ASSIGNED_TO_RESPONSIBLE' : 'GENERATED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', carnetId);

    if (carnetErr) throw carnetErr;

    // En plus, mettre à jour tous les tickets associés pour qu'ils se synchronisent chez le responsable
    const { error: ticketErr } = await supabaseAdmin
      .from('tickets')
      .update({
        assigned_responsable_id: resolvedRespId,
        sector_id: resolvedSectorId,
        status: resolvedRespId ? 'ASSIGNED_TO_RESPONSIBLE' : 'GENERATED',
        updated_at: new Date().toISOString(),
      })
      .eq('carnet_id', carnetId)
      .in('status', ['GENERATED', 'AVAILABLE']);

    if (ticketErr) {
      console.warn('[API Carnets] Warning updating associated tickets:', ticketErr.message);
    }

    res.json({ success: true, carnetId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Attribution de tickets à un agent (Administrateur ou Responsable)
app.post('/api/tickets/assign', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé');
    const { ticketIds, agentId, responsibleId } = req.body;
    if (!Array.isArray(ticketIds) || ticketIds.length === 0 || !agentId) {
      return res.status(400).json({ error: 'Données d’attribution invalides' });
    }

    const actor = req.authenticatedUser!;
    if (actor.role !== 'ADMINISTRATEUR' && actor.role !== 'RESPONSABLE') {
      return res.status(403).json({ error: 'Accès interdit : Seul l’administrateur ou le responsable peut attribuer des tickets.' });
    }

    const updatedRows = [];
    const nowIso = new Date().toISOString();

    for (const tId of ticketIds) {
      const { data: updated, error: tktErr } = await supabaseAdmin
        .from('tickets')
        .update({
          status: 'ASSIGNED_TO_AGENT',
          assigned_agent_id: agentId,
          assigned_responsable_id: responsibleId || actor.id,
          updated_at: nowIso,
        })
        .eq('id', tId)
        .in('status', ['ASSIGNED_TO_RESPONSIBLE', 'AVAILABLE', 'GENERATED'])
        .select();

      if (tktErr) throw tktErr;
      if (updated && updated.length > 0) {
        updatedRows.push(updated[0]);
        
        // Enregistrer l'historique d'attribution
        try {
          await supabaseAdmin.from('ticket_status_history').insert({
            ticket_id: tId,
            old_status: 'ASSIGNED_TO_RESPONSIBLE',
            new_status: 'ASSIGNED_TO_AGENT',
            changed_by: actor.id,
            reason: `Attribution à l'agent ${agentId} via API Express`
          });
        } catch (historyErr) {
          console.warn('Warning inserting ticket status history:', historyErr);
        }
      }
    }

    res.json({ success: true, count: updatedRows.length });
  } catch (err: any) {
    console.error('[API Tickets] Erreur d’attribution:', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// EXPENSES (DÉPENSES) PERSISTÉES EN BASE
// ------------------------------------------------------------------
app.get('/api/expenses', requireAuth, async (req, res) => {
  try {
    const dbClient = getDatabaseClient(req);
    const actor = req.authenticatedUser!;

    let query = dbClient
      .from('expenses')
      .select('*, creator:profiles!created_by(full_name, role), approver:profiles!approved_by(full_name), resp:profiles!responsible_id(full_name), sectors(name)')
      .order('expense_date', { ascending: false });

    // Isolation
    if (actor.role === 'RESPONSABLE') {
      query = query.or(`responsible_id.eq.${actor.id},created_by.eq.${actor.id}`);
    } else if (actor.role === 'AGENT' || actor.role === 'CAISSIER') {
      query = query.eq('created_by', actor.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ expenses: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé');
    const actor = req.authenticatedUser!;
    const { amount, category, description, expenseDate, receiptUrl, responsibleId } = req.body;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Montant de dépense invalide (doit être > 0).' });
    }
    if (!description || description.trim().length === 0) {
      return res.status(400).json({ error: 'Description obligatoire.' });
    }

    const expenseId = crypto.randomUUID();
    const countRes = await supabaseAdmin.from('expenses').select('id', { count: 'exact', head: true });
    const count = (countRes.count || 0) + 1;
    const expenseNumber = `EXP-2026-${String(count).padStart(6, '0')}`;

    const newExpense = {
      id: expenseId,
      expense_number: expenseNumber,
      amount: numAmount,
      category: category || 'AUTRE',
      description: description.trim(),
      expense_date: expenseDate || new Date().toISOString().slice(0, 10),
      receipt_url: receiptUrl || null,
      status: 'PENDING',
      created_by: actor.id,
      responsible_id: ensureUuidOrNull(responsibleId || actor.sectorId ? actor.id : null),
      sector_id: ensureUuidOrNull(actor.sectorId),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin.from('expenses').insert(newExpense).select().single();
    if (error) throw error;

    // Audit
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor.id,
      actor_name: actor.fullName,
      actor_role: actor.role,
      action: 'EXPENSE_CREATED',
      target_entity: 'Expense',
      target_id: expenseId,
      details: `Création dépense ${expenseNumber} (${numAmount} FCFA - ${category})`,
    });

    res.status(201).json({ expense: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/expenses/:id/approve', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé');
    const { id } = req.params;
    const actor = req.authenticatedUser!;

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update({
        status: 'VALIDATED',
        approved_by: actor.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, expense: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// VÉRIFICATION PRIVACY-AWARE DES QR CODES (Section 15 & F-04)
// ------------------------------------------------------------------
app.post('/api/verify', async (req, res) => {
  try {
    const { identifier, scannedToken, plateNumber } = req.body;
    if (!identifier || identifier.trim() === '') {
      return res.status(400).json({ valid: false, message: 'Identifiant requis.' });
    }

    // Rate Limiting (F-04) : 60 vérifications par minute par IP
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const rateLimit = checkRateLimit(`verify-ip:${clientIp}`, 60, 60 * 1000);
    if (!rateLimit.allowed) {
      return res.status(429).json({ valid: false, message: 'Trop de vérifications rapprochées. Veuillez patienter.' });
    }

    // Vérifier si appelant authentifié (contrôleur)
    const caller = await authenticateSession(req);
    const isControllerOrAdmin = caller && ['CONTROLEUR', 'ADMINISTRATEUR', 'RESPONSABLE'].includes(caller.role);

    if (!supabaseAdmin) {
      return res.status(500).json({ valid: false, message: 'Serveur de vérification non initialisé.' });
    }

    const { data: result, error } = await supabaseAdmin.rpc('verify_ticket_secure', {
      p_ticket_identifier: identifier.trim(),
      p_scanned_token: scannedToken ? scannedToken.trim() : null,
      p_plate_number: plateNumber ? plateNumber.trim() : null,
    });

    if (error) throw error;

    // RÈGLE ABSOLUE : Si signature invalide => valid = false
    if (!result.signature_verified && result.status === 'FORGED_SIGNATURE') {
      result.valid = false;
    }

    // PRIVACY FILTER : Réponse publique minimale vs contrôleur complet
    if (!isControllerOrAdmin) {
      return res.json({
        valid: result.valid,
        status: result.status,
        ticket_number: result.ticket_number,
        plate_number: result.plate_number,
        message: result.message,
        verification_timestamp: new Date().toISOString(),
      });
    }

    // Réponse complète pour contrôleur officiel
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// ------------------------------------------------------------------
// PROTECTION ANTI-SSRF POUR WORKFLOWS AGENTIQUES ET REQUÊTES (S8703)
// ------------------------------------------------------------------
import dns from 'dns';
import { promisify } from 'util';

const lookupAsync = promisify(dns.lookup);

/**
 * Détermine si une adresse IP est privée, de bouclage, link-local ou réservée (non-routable/dangereuse)
 * Conforme aux exigences de sécurité tssecurity:S8703 pour les agents et les workflows backend.
 */
export function isPrivateIP(ip: string): boolean {
  const cleanIp = ip.trim();

  // IPv4 Checks
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return true; // Invalide => considéré comme non sûr

    const [p0, p1, p2, p3] = parts;

    // Loopback (127.0.0.0/8)
    if (p0 === 127) return true;

    // RFC 1918 Private Ranges:
    // 10.0.0.0/8
    if (p0 === 10) return true;
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    // 192.168.0.0/16
    if (p0 === 192 && p1 === 168) return true;

    // Carrier-grade NAT (100.64.0.0/10)
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;

    // Link-local (169.254.0.0/16)
    if (p0 === 169 && p1 === 254) return true;

    // Multicast (224.0.0.0/4)
    if (p0 >= 224 && p0 <= 239) return true;

    // Broadcast (255.255.255.255)
    if (p0 === 255 && p1 === 255 && p2 === 255 && p3 === 255) return true;

    // Documentation (192.0.2.0/24, 198.51.100.0/22, 203.0.113.0/24)
    if (p0 === 192 && p1 === 0 && p2 === 2) return true;
    if (p0 === 198 && p1 === 51 && p2 === 100) return true;
    if (p0 === 203 && p1 === 0 && p2 === 113) return true;

    // Benchmarking (198.18.0.0/15)
    if (p0 === 198 && p1 >= 18 && p1 <= 19) return true;

    // Unspecified / Shared (0.0.0.0/8)
    if (p0 === 0) return true;

    return false;
  }

  // IPv6 Checks
  if (cleanIp.includes(':')) {
    const lower = cleanIp.toLowerCase();
    // Loopback (::1)
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    // Unspecified (::)
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
    // Unique Local (fc00::/7)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // Link-local (fe80::/10)
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
    // Multicast (ff00::/8)
    if (lower.startsWith('ff')) return true;

    return false;
  }

  return true; // Non-identifié => bloqué par défaut
}

/**
 * Valide de manière stricte une URL pour éviter les attaques de SSRF (Server-Side Request Forgery)
 * Convient aux workflows agentiques et à toute récupération d'URL dynamique côté serveur.
 */
export async function validateUrlForSSRF(urlStr: string): Promise<{ isValid: boolean; error?: string; url?: URL }> {
  try {
    const parsedUrl = new URL(urlStr);

    // Protocoles autorisés : HTTP et HTTPS uniquement
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { isValid: false, error: 'Protocole non supporté. Seuls HTTP et HTTPS sont autorisés.' };
    }

    const hostname = parsedUrl.hostname;
    if (!hostname) {
      return { isValid: false, error: 'Nom d’hôte invalide ou absent.' };
    }

    // Si l'hôte est directement une IP (v4 ou v6), la valider immédiatement
    const ipPattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    const ipv6Pattern = /^[0-9a-fA-F:]+$/;

    if (ipPattern.test(hostname) || ipv6Pattern.test(hostname)) {
      if (isPrivateIP(hostname)) {
        return { isValid: false, error: 'Accès aux adresses IP privées ou locales interdit.' };
      }
      return { isValid: true, url: parsedUrl };
    }

    // Résolution DNS systématique pour bloquer les redirections ou bypass (DNS Rebinding)
    try {
      const lookupResult = await lookupAsync(hostname, { all: true });
      for (const entry of lookupResult) {
        if (isPrivateIP(entry.address)) {
          return {
            isValid: false,
            error: `Accès bloqué : le nom d’hôte résout vers une adresse IP non-routable ou privée (${entry.address}).`,
          };
        }
      }
    } catch {
      return { isValid: false, error: 'Résolution DNS du nom d’hôte impossible.' };
    }

    return { isValid: true, url: parsedUrl };
  } catch (err: any) {
    return { isValid: false, error: `Format d’URL invalide : ${err.message}` };
  }
}

/**
 * Exécute une requête fetch sécurisée contre les attaques SSRF
 */
export async function ssrfSafeFetch(urlStr: string, init?: any): Promise<any> {
  const validation = await validateUrlForSSRF(urlStr);
  if (!validation.isValid || !validation.url) {
    throw new Error(`SSRF Blocked: ${validation.error || 'URL non sécurisée.'}`);
  }
  // Utiliser le fetch natif global de Node.js
  const fetchFn = (globalThis as any).fetch;
  if (!fetchFn) {
    throw new Error('Fetch natif non disponible sur ce runtime de serveur.');
  }
  return fetchFn(validation.url.toString(), init);
}

// Endpoint de proxy sécurisé pour toute requête externe ou de workflow agentique (ADMINISTRATEUR STRICTEMENT - F-07)
app.post('/api/assistant/fetch-safe', requireAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL requise.' });
    }

    const validation = await validateUrlForSSRF(url);
    if (!validation.isValid) {
      return res.status(400).json({ error: `SSRF bloqué : ${validation.error}` });
    }

    // Effectuer l'appel en toute sécurité
    const response = await ssrfSafeFetch(url);
    const contentType = response.headers.get('content-type') || '';
    
    // Plafond strict de taille de réponse à 500 Ko pour prévenir l'épuisement mémoire (F-07)
    const rawText = await response.text();
    if (rawText.length > 512_000) {
      return res.status(413).json({ error: 'La réponse distante dépasse le plafond autorisé de 500 Ko.' });
    }

    if (contentType.includes('application/json')) {
      try {
        const data = JSON.parse(rawText);
        return res.json({ success: true, contentType, data });
      } catch {
        return res.json({ success: true, contentType, data: rawText });
      }
    } else {
      return res.json({ success: true, contentType, data: rawText });
    }
  } catch (err: any) {
    res.status(500).json({ error: `Erreur d’appel sécurisé : ${err.message}` });
  }
});

// ------------------------------------------------------------------
// ASSISTANT OPÉRATIONNEL EN LECTURE SEULE (Section 66 & F-08)
// ------------------------------------------------------------------
app.post('/api/assistant/query', requireAuth, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question requise.' });
    }

    if (!supabaseAdmin) {
      return res.json({
        answer: "Le service d'assistance PORTUS fonctionne actuellement en mode local. Connectez Supabase pour les statistiques cloud complètes.",
      });
    }

    const q = question.toLowerCase();
    const today = new Date().toISOString().slice(0, 10);

    if (q.includes('vendu') || q.includes('vente') || q.includes('tickets aujourd')) {
      const { count } = await supabaseAdmin
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .gte('sold_at', `${today}T00:00:00`);

      const totalSold = count || 0;

      // Récupération dynamique du tarif officiel configuré (F-08)
      let currentPrice = 5000;
      try {
        const { data: priceSetting } = await supabaseAdmin
          .from('app_settings')
          .select('value')
          .eq('key', 'ticket_price_fcfa')
          .maybeSingle();
        if (priceSetting?.value) {
          currentPrice = typeof priceSetting.value === 'number' ? priceSetting.value : Number(priceSetting.value) || 5000;
        }
      } catch {}

      const revenue = totalSold * currentPrice;
      return res.json({
        answer: `Aujourd'hui (${today}), un total de **${totalSold} ticket(s)** a été vendu sur le corridor de Vridi, représentant une recette brute de **${revenue.toLocaleString('fr-FR')} FCFA** (tarif officiel : ${currentPrice.toLocaleString('fr-FR')} FCFA/ticket).`,
      });
    }

    if (q.includes('contrôle') || q.includes('vérifi') || q.includes('fraude')) {
      const { count: ctrlCount } = await supabaseAdmin
        .from('controls')
        .select('id', { count: 'exact', head: true })
        .gte('controlled_at', `${today}T00:00:00`);

      const { count: fraudCount } = await supabaseAdmin
        .from('fraud_reports')
        .select('id', { count: 'exact', head: true })
        .gte('reported_at', `${today}T00:00:00`);

      return res.json({
        answer: `Activité de contrôle routier aujourd'hui : **${ctrlCount || 0} véhicule(s)** contrôlés sur le périmètre portuaire, et **${fraudCount || 0} anomalie(s)/signalement(s)** enregistrés.`,
      });
    }

    if (q.includes('carnet') || q.includes('stock') || q.includes('épuisé') || q.includes('restant')) {
      const { count: totalCarnets } = await supabaseAdmin.from('carnets').select('id', { count: 'exact', head: true });
      const { count: availableTickets } = await supabaseAdmin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['AVAILABLE', 'ASSIGNED_TO_RESPONSIBLE', 'ASSIGNED_TO_AGENT']);

      return res.json({
        answer: `État des stocks : **${totalCarnets || 0} carnets** enregistrés au total. Il reste **${availableTickets || 0} tickets valides** en circulation ou disponibles dans les stocks des secteurs.`,
      });
    }

    if (q.includes('caisse') || q.includes('remise') || q.includes('dépense') || q.includes('solde')) {
      const { data: remisesData } = await supabaseAdmin.from('remittances').select('amount');
      const { data: expensesData } = await supabaseAdmin.from('expenses').select('amount').eq('status', 'VALIDATED');

      const totalRemises = (remisesData || []).reduce((s, r) => s + (r.amount || 0), 0);
      const totalExpenses = (expensesData || []).reduce((s, e) => s + (e.amount || 0), 0);
      const netCash = Math.max(0, totalRemises - totalExpenses);

      return res.json({
        answer: `Situation financière globale : **${totalRemises.toLocaleString('fr-FR')} FCFA** de remises encaissées, **${totalExpenses.toLocaleString('fr-FR')} FCFA** de dépenses validées, soit un solde de caisse net estimé à **${netCash.toLocaleString('fr-FR')} FCFA**.`,
      });
    }

    res.json({
      answer: `Je suis l'assistant opérationnel en lecture seule de PORTUS. Vous pouvez me poser des questions sur les ventes du jour, le nombre de contrôles routiers, l'état des stocks de carnets ou la trésorerie.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// CONFIGURATION SERVEUR ET VITE MIDDLEWARE
// ------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PORTUS Server] En écoute sur http://0.0.0.0:${PORT}`);
  });
}

// Ne pas démarrer le serveur autonome sous environnement Serverless Vercel ou lors des tests
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app };
export default app;
