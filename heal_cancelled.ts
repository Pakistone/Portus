import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const sbUrl = 'https://wbbpaebrhobuaoherwmg.supabase.co';
const jwtSecret = process.env.SUPABASE_SECRET_KEY || '';

if (!jwtSecret) {
  console.error('SUPABASE_SECRET_KEY is missing.');
  process.exit(1);
}

function signJwt(payload: any, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const base64UrlEncode = (obj: any) => {
    return Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function run() {
  const adminId = 'db2145a8-bdd8-492c-a2b4-f20126881b30'; // ADMINISTRATEUR ID
  const payload = {
    sub: adminId,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  console.log('Generating JWT signed as administrator...');
  const token = signJwt(payload, jwtSecret);

  console.log('Instantiating Supabase client with the generated admin JWT...');
  const client = createClient(sbUrl, 'sb_publishable_C55bwXXFjzdKGWo8y_DyzA_lVZSu727', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  console.log('Attempting to heal active tickets of cancelled carnet C-2026-001...');
  const carnetId1 = 'c0000000-0000-0000-0000-000000000001';
  const { data: tkts1, error: err1 } = await client
    .from('tickets')
    .update({
      status: 'CANCELLED',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Annulation synchronisée du carnet parent'
    })
    .eq('carnet_id', carnetId1)
    .not('status', 'eq', 'CANCELLED')
    .select('id');

  if (err1) {
    console.error('Failed for C-2026-001:', err1.message);
  } else {
    console.log(`Successfully cancelled ${tkts1?.length || 0} tickets for C-2026-001!`);
  }

  console.log('Attempting to heal active tickets of cancelled carnet C-2026-002 (the 3 tickets booklet)...');
  const carnetId2 = '91c84575-f731-4073-a76a-70fd9321f096';
  const { data: tkts2, error: err2 } = await client
    .from('tickets')
    .update({
      status: 'CANCELLED',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Annulation synchronisée du carnet parent'
    })
    .eq('carnet_id', carnetId2)
    .not('status', 'eq', 'CANCELLED')
    .select('id');

  if (err2) {
    console.error('Failed for C-2026-002:', err2.message);
  } else {
    console.log(`Successfully cancelled ${tkts2?.length || 0} tickets for C-2026-002!`);
  }
}

run();
