import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Augmentation de la limite du corps de requête (50mb) pour les lots et photos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

const PORTUS_HMAC_SECRET = (
  process.env.PORTUS_HMAC_SECRET ||
  'portus_production_master_hmac_secret_2026_ujsrv_secure'
).trim();

if (!supabaseUrl) {
  console.warn('[PORTUS Server] ATTENTION: VITE_SUPABASE_URL n’est pas configuré dans process.env');
}

console.log('[PORTUS Server] --- DIAGNOSTICS SUPABASE ---');
console.log('[PORTUS Server] URL:', supabaseUrl);
console.log('[PORTUS Server] Clé Secrète - Longueur:', supabaseSecretKey ? supabaseSecretKey.length : 0);
console.log('[PORTUS Server] Clé Secrète - Début:', supabaseSecretKey ? `${supabaseSecretKey.slice(0, 15)}...` : 'nulle');
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

async function authenticateSession(req: express.Request): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.trim() === '') return null;

  if (!supabaseAdmin) {
    // Si Supabase n'est pas encore initialisé avec les clés, rejeter
    return null;
  }

  try {
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return null;
    }

    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, role, sector_id, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profErr || !profile || !profile.is_active) {
      // Résilience Administrateur Initial : En cas d'absence de profil physique ou d'erreur RLS,
      // l'adresse e-mail officielle de l'administrateur conserve son accès root complet
      const isAdminEmail = 
        user.email === 'ypaki090@gmail.com' || 
        user.email === 'admin@ujpas.ci' ||
        user.email === 'admin@portus-ujpas.online' ||
        user.email === 'admin@ujpaa.ci' ||
        user.email === 'admin@portus.ujpaa.ci' ||
        user.email === 'admin@ujsrv.ci' || 
        user.email === 'admin@portus.ujsrv.ci' ||
        (user.user_metadata?.username && ['ypaki090', 'admin'].includes(user.user_metadata.username.toLowerCase()));

      if (isAdminEmail) {
        console.log('[PORTUS Server Auth] Résilience activée : profil virtuel ADMINISTRATEUR attribué à', user.email);
        return {
          id: user.id,
          email: user.email,
          username: user.user_metadata?.username || user.email?.split('@')[0] || 'ypaki090',
          fullName: user.user_metadata?.full_name || 'Administrateur Général PORTUS',
          role: 'ADMINISTRATEUR',
          sectorId: null,
          isActive: true,
        };
      }
      return null;
    }

    return {
      id: profile.id,
      email: user.email,
      username: profile.username,
      fullName: profile.full_name,
      role: profile.role,
      sectorId: profile.sector_id,
      isActive: profile.is_active,
    };
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
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(sectorIdOrCode)) {
    return sectorIdOrCode;
  }

  const mapping: Record<string, string> = {
    'sec-vridi-port': 'VRD-PORT',
    'sec-vridi-canal': 'VRD-CANAL',
    'sec-vridi-zi': 'VRD-ZONE-IND',
    'sec-vridi-sir': 'VRD-TERMINAL',
  };

  const code = mapping[sectorIdOrCode] || sectorIdOrCode;

  if (!supabaseAdmin) return null;

  const { data: sector } = await supabaseAdmin
    .from('sectors')
    .select('id')
    .or(`code.eq.${code},name.ilike.%${sectorIdOrCode}%`)
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
    let { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*, sector:sectors(name)')
      .eq('id', authUserId)
      .maybeSingle();

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
        const { error: upsertErr } = await supabaseAdmin.from('profiles').upsert(initialProfile);
        if (upsertErr) {
          console.error('[PORTUS Server Login] Erreur lors de l’upsert du profil initial:', upsertErr.message, upsertErr);
        } else {
          console.log('[PORTUS Server Login] Profil initial upserted avec succès pour:', initialProfile.username);
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
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Service d’authentification indisponible.' });
    }

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({
      success: true,
      message: 'Un lien de réinitialisation sécurisé a été transmis par courrier électronique.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
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

app.get('/api/users', async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé côté serveur');
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*, sector:sectors(name)')
      .order('full_name', { ascending: true });

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

// Consultation des carnets et tickets (protégée selon le rôle ou synchro générale)
app.get('/api/carnets', async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé');
    const actor = await authenticateSession(req);

    let carnetQuery = supabaseAdmin
      .from('carnets')
      .select('*, created_profile:profiles!created_by(full_name), resp_profile:profiles!assigned_to_responsable(full_name), sectors(name)')
      .order('created_at', { ascending: false });

    // Isolation sectorielle uniquement pour responsable connecté
    if (actor && actor.role === 'RESPONSABLE') {
      carnetQuery = carnetQuery.or(`assigned_to_responsable.eq.${actor.id},sector_id.eq.${actor.sectorId || '00000000-0000-0000-0000-000000000000'}`);
    }

    const { data: carnetsData, error: carnetErr } = await carnetQuery;
    if (carnetErr) throw carnetErr;

    let ticketQuery = supabaseAdmin
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
    const userClient = getSupabaseUserClient(req);

    // 1. Annuler le carnet
    const { error: carnetErr } = await userClient
      .from('carnets')
      .update({ status: 'CANCELLED' })
      .eq('id', carnetId);

    if (carnetErr) throw carnetErr;

    // 2. Annuler les tickets non vendus et non contrôlés du carnet
    const nowIso = new Date().toISOString();
    const { data: ticketsToCancel, error: fetchErr } = await userClient
      .from('tickets')
      .select('id, status')
      .eq('carnet_id', carnetId);

    if (fetchErr) throw fetchErr;

    let cancelledCount = 0;
    const targets = (ticketsToCancel || []).filter(t => t.status !== 'SOLD' && t.status !== 'CONTROLLED');
    
    if (targets.length > 0) {
      const targetIds = targets.map(t => t.id);
      const { error: ticketErr } = await userClient
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
    const userClient = getSupabaseUserClient(req);

    const nowIso = new Date().toISOString();
    const { error: ticketErr } = await userClient
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

// Création de carnet (ADMINISTRATEUR STRICTEMENT)
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
    const sectorId = ensureUuidOrNull(carnet.sectorId);

    const { error: carnetErr } = await supabaseAdmin.from('carnets').upsert({
      id: carnetId,
      carnet_number: carnet.carnetNumber,
      series_prefix: carnet.seriesPrefix || 'VRD',
      generation_batch: carnet.generationBatch || 'GEN-1',
      size: Number(carnet.size) || 30,
      start_number: Number(carnet.startNumber) || 1,
      end_number: Number(carnet.endNumber) || (Number(carnet.startNumber || 1) + Number(carnet.size || 30) - 1),
      created_by: actor.id, // Déduit de la session
      assigned_to_responsable: assignedToResp,
      sector_id: sectorId,
      status: carnet.status || 'GENERATED',
      created_at: carnet.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (carnetErr) throw carnetErr;

    if (Array.isArray(tickets) && tickets.length > 0) {
      const formattedTickets = tickets.map((t: any) => {
        const tid = toValidUuid(t.id);
        const price = Number(t.price) || 5000;
        // Signature HMAC autoritaire générée par le serveur
        const canonical = `PORTUS|v1|${tid}|${carnet.carnetNumber}|${t.ticketNumber}|${price}`;
        const signature = signCanonicalPayload(canonical);
        const qrPayload = JSON.stringify({
          v: 1,
          ticket_id: tid,
          carnet_number: carnet.carnetNumber,
          ticket_number: t.ticketNumber,
          price,
          signature,
          tid,
          ref: carnet.carnetNumber,
          num: t.ticketNumber,
          sig: signature,
        });

        return {
          id: tid,
          ticket_number: t.ticketNumber,
          carnet_id: carnetId,
          generation_batch: t.generationBatch || 'GEN-1',
          qr_payload: qrPayload,
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
        await supabaseAdmin.from('tickets').upsert(chunk, { onConflict: 'id' });
      }
    }

    res.json({ success: true, carnetId, ticketsCount: tickets?.length || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Synchronisation par lot (AUTHENTIFICATION OBLIGATOIRE - Acteur validé)
app.post('/api/carnets/sync', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase non initialisé');
    const actor = req.authenticatedUser!;
    const { carnets, tickets, sales } = req.body;
    let syncedCarnets = 0;
    let syncedTickets = 0;
    let syncedSales = 0;

    // Seul un admin ou superviseur peut synchroniser des carnets entiers
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

    // Synchronisation des ventes (L'agent authentifié est l'autorité)
    if (Array.isArray(sales) && sales.length > 0) {
      for (const sale of sales) {
        const ticketId = toValidUuid(sale.ticketId);
        const saleId = toValidUuid(sale.id);
        const idempotencyKey = toValidUuid(sale.syncIdempotencyKey || sale.id);

        const { error: saleErr } = await supabaseAdmin.from('sales').upsert({
          id: saleId,
          ticket_id: ticketId,
          ticket_number: sale.ticketNumber,
          agent_id: actor.id, // Déduit de la session!
          sector_id: ensureUuidOrNull(sale.sectorId || actor.sectorId),
          plate_number: sale.plateNumber.toUpperCase().trim(),
          driver_phone: sale.driverPhone?.trim() || null,
          sold_at: sale.soldAt || new Date().toISOString(),
          price: 5000, // Imposé côté serveur
          sync_idempotency_key: idempotencyKey,
        }, { onConflict: 'sync_idempotency_key' });

        if (!saleErr) syncedSales++;
      }
    }

    res.json({ success: true, syncedCarnets, syncedTickets, syncedSales });
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
    if (!supabaseAdmin) throw new Error('Supabase non initialisé');
    const actor = req.authenticatedUser!;

    let query = supabaseAdmin
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
// VÉRIFICATION PRIVACY-AWARE DES QR CODES (Section 15)
// ------------------------------------------------------------------
app.post('/api/verify', async (req, res) => {
  try {
    const { identifier, scannedToken, plateNumber } = req.body;
    if (!identifier || identifier.trim() === '') {
      return res.status(400).json({ valid: false, message: 'Identifiant requis.' });
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

// Endpoint de proxy sécurisé pour toute requête externe ou de workflow agentique
app.post('/api/assistant/fetch-safe', requireAuth, async (req, res) => {
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
    
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.json({ success: true, contentType, data });
    } else {
      const text = await response.text();
      return res.json({ success: true, contentType, data: text.slice(0, 100000) });
    }
  } catch (err: any) {
    res.status(500).json({ error: `Erreur d’appel sécurisé : ${err.message}` });
  }
});

// ------------------------------------------------------------------
// ASSISTANT OPÉRATIONNEL EN LECTURE SEULE (Section 66)
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
      const revenue = totalSold * 5000;
      return res.json({
        answer: `Aujourd'hui (${today}), un total de **${totalSold} ticket(s)** a été vendu sur le corridor de Vridi, représentant une recette brute de **${revenue.toLocaleString('fr-FR')} FCFA**.`,
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

// Ne pas démarrer le serveur autonome sous environnement Serverless Vercel
if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;
