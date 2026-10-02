import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Augmentation de la limite du corps de requête (50mb) pour les lots de carnets, tickets et photos de preuve
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Client Supabase Administrateur (côté serveur uniquement - SUPABASE_SECRET_KEY)
const PRODUCTION_SUPABASE_URL = 'https://wbbpaebrhobuaoherwmg.supabase.co';
const envUrl = process.env.VITE_SUPABASE_URL?.trim();
const supabaseUrl = (envUrl && !envUrl.includes('xyvdmqvwqlpypsbqpkru'))
  ? envUrl
  : PRODUCTION_SUPABASE_URL;

const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || '';

if (!supabaseSecretKey) {
  console.warn('[PORTUS Server] ATTENTION: SUPABASE_SECRET_KEY n’est pas défini dans process.env!');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey || 'placeholder', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Middleware de vérification du rôle Administrateur
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Session non authentifiée (Jeton Bearer manquant)' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      console.warn('[PORTUS Server requireAdmin] authErr:', authErr?.message);
      return res.status(401).json({ error: 'Jeton de session invalide ou expiré' });
    }

    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profErr || !profile || profile.role !== 'ADMINISTRATEUR' || !profile.is_active) {
      return res.status(403).json({ error: 'Action strictement réservée à l’administrateur général PORTUS' });
    }

    (req as any).adminUser = user;
    next();
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erreur interne d’authentification' });
  }
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

  const { data: sector } = await supabaseAdmin
    .from('sectors')
    .select('id')
    .or(`code.eq.${code},name.ilike.%${sectorIdOrCode}%`)
    .maybeSingle();

  return sector?.id || null;
}

// ------------------------------------------------------------------
// ROUTES API ADMINISTRATEUR (PROXY SÉCURISÉ)
// ------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'PORTUS Production Backend', timestamp: new Date().toISOString() });
});

// Récupération de tous les utilisateurs depuis Supabase profiles
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
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

// Création d'un utilisateur officiel (Supabase Auth + public.profiles)
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { username, fullName, role, sectorId, phone, passwordRaw } = req.body;

    if (!username || !fullName || !passwordRaw) {
      return res.status(400).json({ error: 'Nom d’utilisateur, nom complet et mot de passe sont obligatoires' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const email = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@portus.ujsrv.ci`;

    // Vérifier l'unicité de l'identifiant
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: `Le nom d’utilisateur "${cleanUsername}" est déjà utilisé dans la base.` });
    }

    // 1. Création dans Supabase Auth (autorité de mot de passe)
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
      console.error('[API Admin] Erreur auth.admin.createUser:', authErr);
      return res.status(400).json({ error: authErr?.message || 'Erreur lors de la création Supabase Auth' });
    }

    const newUserId = authData.user.id;
    const resolvedSectorId = (role === 'AGENT' || role === 'RESPONSABLE') ? await resolveSectorUuid(sectorId) : null;

    // 2. Création du profil autoritaire dans public.profiles
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
      console.error('[API Admin] Erreur profiles upsert:', profileErr);
      // Rollback auth
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      return res.status(500).json({ error: `Erreur insertion profil : ${profileErr.message}` });
    }

    console.log(`[API Admin] Utilisateur créé avec succès : ${cleanUsername} (${newUserId}) - Rôle: ${role}`);
    res.status(201).json({ user: newProfile });
  } catch (err: any) {
    console.error('[API Admin] Erreur création:', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

// Modification d'un utilisateur
app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phone, sectorId, role, isActive } = req.body;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (fullName !== undefined) updates.full_name = fullName.trim();
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (sectorId !== undefined) updates.sector_id = sectorId ? await resolveSectorUuid(sectorId) : null;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select('*, sector:sectors(name)')
      .single();

    if (error) throw error;
    res.json({ user: data });
  } catch (err: any) {
    console.error('[API Admin] Erreur mise à jour:', err);
    res.status(500).json({ error: err.message });
  }
});

// Réinitialisation du mot de passe d'un utilisateur par l'admin
app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPasswordRaw } = req.body;

    if (!newPasswordRaw || newPasswordRaw.length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit comporter au moins 6 caractères' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: newPasswordRaw,
    });

    if (error) throw error;
    console.log(`[API Admin] Mot de passe réinitialisé pour l'utilisateur ${id}`);
    res.json({ success: true, message: 'Mot de passe mis à jour avec succès dans Supabase Auth' });
  } catch (err: any) {
    console.error('[API Admin] Erreur reset password:', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// ROUTES GESTION DES CARNETS ET TICKETS (CLOUD SUPABASE)
// ------------------------------------------------------------------

const DEFAULT_ADMIN_UUID = 'db2145a8-bdd8-492c-a2b4-f20126881b30';

function toValidUuid(val?: string | null): string {
  if (!val) return crypto.randomUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(val)) return val;
  const hash = crypto.createHash('sha256').update(val).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function ensureUuid(val?: string | null, fallback = DEFAULT_ADMIN_UUID): string {
  if (!val) return fallback;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(val)) return val;
  return fallback;
}

function ensureUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(val)) return val;
  return null;
}

// Récupération de tous les carnets et tickets depuis Supabase
app.get('/api/carnets', async (req, res) => {
  try {
    const { data: carnetsData, error: carnetErr } = await supabaseAdmin
      .from('carnets')
      .select('*, created_profile:profiles!created_by(full_name), resp_profile:profiles!assigned_to_responsable(full_name), sectors(name)')
      .order('created_at', { ascending: false });

    if (carnetErr) throw carnetErr;

    const { data: ticketsData, error: ticketErr } = await supabaseAdmin
      .from('tickets')
      .select('*, carnets(carnet_number), resp:profiles!assigned_responsable_id(full_name), agent:profiles!assigned_agent_id(full_name, phone), sectors(name)')
      .order('ticket_number', { ascending: true })
      .limit(3000);

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
    console.error('[API Carnets] Erreur fetch:', err);
    res.status(500).json({ error: err.message });
  }
});

// Enregistrement d'un nouveau carnet et de ses tickets
app.post('/api/carnets', async (req, res) => {
  try {
    const { carnet, tickets } = req.body;
    if (!carnet || !carnet.carnetNumber) {
      return res.status(400).json({ error: 'Données de carnet invalides' });
    }

    const carnetId = toValidUuid(carnet.id);
    const createdBy = ensureUuid(carnet.createdById);
    const assignedToResp = ensureUuidOrNull(carnet.assignedToResponsableId);
    const sectorId = ensureUuidOrNull(carnet.sectorId);

    // 1. Insertion du carnet
    const { error: carnetErr } = await supabaseAdmin.from('carnets').upsert({
      id: carnetId,
      carnet_number: carnet.carnetNumber,
      series_prefix: carnet.seriesPrefix || 'VRD',
      generation_batch: carnet.generationBatch || 'GEN-1',
      size: Number(carnet.size) || 30,
      start_number: Number(carnet.startNumber) || 1,
      end_number: Number(carnet.endNumber) || (Number(carnet.startNumber || 1) + Number(carnet.size || 30) - 1),
      created_by: createdBy,
      assigned_to_responsable: assignedToResp,
      sector_id: sectorId,
      status: carnet.status || 'GENERATED',
      created_at: carnet.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (carnetErr) {
      console.error('[API Carnets] Erreur insertion carnet:', carnetErr);
      return res.status(500).json({ error: carnetErr.message });
    }

    // 2. Insertion des tickets par paquets de 50
    if (Array.isArray(tickets) && tickets.length > 0) {
      const formattedTickets = tickets.map((t: any) => ({
        id: toValidUuid(t.id),
        ticket_number: t.ticketNumber,
        carnet_id: carnetId,
        generation_batch: t.generationBatch || 'GEN-1',
        qr_payload: t.qrPayload || t.ticketNumber,
        status: t.status || 'GENERATED',
        price: Number(t.price) || 5000,
        assigned_responsable_id: ensureUuidOrNull(t.assignedResponsableId || carnet.assignedToResponsableId),
        assigned_agent_id: ensureUuidOrNull(t.assignedAgentId),
        sector_id: ensureUuidOrNull(t.sectorId || carnet.sectorId),
        plate_number: t.plateNumber || null,
        driver_phone: t.driverPhone || null,
        sold_at: t.soldAt || null,
        created_at: t.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      for (let i = 0; i < formattedTickets.length; i += 50) {
        const chunk = formattedTickets.slice(i, i + 50);
        const { error: tktErr } = await supabaseAdmin.from('tickets').upsert(chunk, { onConflict: 'id' });
        if (tktErr) {
          console.warn('[API Carnets] Erreur insertion chunk tickets:', tktErr.message);
        }
      }
    }

    console.log(`[API Carnets] Carnet ${carnet.carnetNumber} (${tickets?.length || 0} tickets) sauvegardé sur Supabase`);
    res.json({ success: true, carnetId, ticketsCount: tickets?.length || 0 });
  } catch (err: any) {
    console.error('[API Carnets] Exception:', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

// Synchronisation globale (upload par lot de carnets et tickets locaux)
app.post('/api/carnets/sync', async (req, res) => {
  try {
    const { carnets, tickets } = req.body;
    let syncedCarnets = 0;
    let syncedTickets = 0;

    if (Array.isArray(carnets) && carnets.length > 0) {
      for (const carnet of carnets) {
        const carnetId = toValidUuid(carnet.id);
        const { error } = await supabaseAdmin.from('carnets').upsert({
          id: carnetId,
          carnet_number: carnet.carnetNumber,
          series_prefix: carnet.seriesPrefix || 'VRD',
          generation_batch: carnet.generationBatch || 'GEN-1',
          size: Number(carnet.size) || 30,
          start_number: Number(carnet.startNumber) || 1,
          end_number: Number(carnet.endNumber) || (Number(carnet.startNumber || 1) + Number(carnet.size || 30) - 1),
          created_by: ensureUuid(carnet.createdById),
          assigned_to_responsable: ensureUuidOrNull(carnet.assignedToResponsableId),
          sector_id: ensureUuidOrNull(carnet.sectorId),
          status: carnet.status || 'GENERATED',
          created_at: carnet.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (!error) syncedCarnets++;
      }
    }

    if (Array.isArray(tickets) && tickets.length > 0) {
      const formatted = tickets.map((t: any) => ({
        id: toValidUuid(t.id),
        ticket_number: t.ticketNumber,
        carnet_id: toValidUuid(t.carnetId),
        generation_batch: t.generationBatch || 'GEN-1',
        qr_payload: t.qrPayload || t.ticketNumber,
        status: t.status || 'GENERATED',
        price: Number(t.price) || 5000,
        assigned_responsable_id: ensureUuidOrNull(t.assignedResponsableId),
        assigned_agent_id: ensureUuidOrNull(t.assignedAgentId),
        sector_id: ensureUuidOrNull(t.sectorId),
        plate_number: t.plateNumber || null,
        driver_phone: t.driverPhone || null,
        sold_at: t.soldAt || null,
        created_at: t.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      for (let i = 0; i < formatted.length; i += 50) {
        const chunk = formatted.slice(i, i + 50);
        const { error } = await supabaseAdmin.from('tickets').upsert(chunk, { onConflict: 'id' });
        if (!error) syncedTickets += chunk.length;
      }
    }

    console.log(`[API Carnets Sync] Synchro terminée : ${syncedCarnets} carnets, ${syncedTickets} tickets`);
    res.json({ success: true, syncedCarnets, syncedTickets });
  } catch (err: any) {
    console.error('[API Carnets Sync] Erreur:', err);
    res.status(500).json({ error: err.message });
  }
});

// Attribution d'un carnet à un responsable
app.patch('/api/carnets/:id/assign', async (req, res) => {
  try {
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

    // Mise à jour des tickets du carnet
    await supabaseAdmin
      .from('tickets')
      .update({
        assigned_responsable_id: resolvedRespId,
        sector_id: resolvedSectorId,
        status: resolvedRespId ? 'ASSIGNED_TO_RESPONSIBLE' : 'GENERATED',
        updated_at: new Date().toISOString(),
      })
      .eq('carnet_id', carnetId)
      .eq('status', 'GENERATED');

    res.json({ success: true, carnetId });
  } catch (err: any) {
    console.error('[API Carnets Assign] Erreur:', err);
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

startServer();
