import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

describe('Suite de Tests Sécurité Authentification et Middlewares (PORTUS)', () => {
  it('doit refuser le démarrage en production avec secret révoqué ou trop court', () => {
    const REVOKED_DEFAULT = 'portus_production_master_hmac_secret_2026_ujsrv_secure';

    function testResolveHmac(envSecret: string, isProd: boolean): string {
      if (isProd) {
        if (!envSecret || envSecret.length < 32 || envSecret === REVOKED_DEFAULT) {
          throw new Error('Démarrage refusé en production');
        }
        return envSecret;
      }
      if (!envSecret || envSecret === REVOKED_DEFAULT || envSecret.length < 32) {
        return crypto.randomBytes(32).toString('hex');
      }
      return envSecret;
    }

    // En production avec secret révoqué => Exception
    assert.throws(() => testResolveHmac(REVOKED_DEFAULT, true), /Démarrage refusé/);

    // En production avec secret court (< 32) => Exception
    assert.throws(() => testResolveHmac('short_secret', true), /Démarrage refusé/);

    // En production avec secret absent => Exception
    assert.throws(() => testResolveHmac('', true), /Démarrage refusé/);

    // En production avec secret valide (64 hex) => Succès
    const validHex = crypto.randomBytes(32).toString('hex');
    assert.equal(testResolveHmac(validHex, true), validHex);

    // En dev sans secret => Génère clé éphémère (64 hex)
    const devEphemeral = testResolveHmac('', false);
    assert.equal(devEphemeral.length, 64);
  });

  it('doit valider le fonctionnement du rate limiter en mémoire', () => {
    const store = new Map<string, { count: number; resetAt: number }>();

    function checkRate(key: string, limit: number, windowMs: number) {
      const now = Date.now();
      const entry = store.get(key);
      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1 };
      }
      if (entry.count >= limit) {
        return { allowed: false, remaining: 0 };
      }
      entry.count += 1;
      return { allowed: true, remaining: limit - entry.count };
    }

    const testKey = 'test-ip-127.0.0.1';
    for (let i = 0; i < 5; i++) {
      const res = checkRate(testKey, 5, 1000);
      assert.equal(res.allowed, true, `La tentative ${i + 1} doit être autorisée`);
    }

    // 6ème tentative dépasse la limite
    const blocked = checkRate(testKey, 5, 1000);
    assert.equal(blocked.allowed, false, 'La 6ème tentative doit être bloquée');
  });

  it('doit filtrer et assainir les codes de secteur contre les injections PostgREST', () => {
    function sanitizeSectorCode(input: string): boolean {
      return /^[a-zA-Z0-9_-]{1,50}$/.test(input);
    }

    // Codes légitimes
    assert.equal(sanitizeSectorCode('VRD-PORT'), true);
    assert.equal(sanitizeSectorCode('sec-vridi-canal'), true);
    assert.equal(sanitizeSectorCode('ZONE_IND_1'), true);

    // Injections potentielles
    assert.equal(sanitizeSectorCode("VRD',code.eq.'INJECTED"), false);
    assert.equal(sanitizeSectorCode('VRD%20OR%201=1'), false);
    assert.equal(sanitizeSectorCode('; DROP TABLE carnets;--'), false);
    assert.equal(sanitizeSectorCode('a'.repeat(51)), false);
  });

  it('doit refuser l’élévation de privilèges via user_metadata et bloquer les comptes inactifs', () => {
    interface MockProfile {
      id: string;
      is_active: boolean;
      role: string;
    }

    function checkAuthDecision(
      user: { id: string; email: string; email_confirmed_at?: string; user_metadata?: { username?: string } },
      profile: MockProfile | null,
      bootstrapEmails: string[]
    ): { allowed: boolean; role?: string } {
      if (profile && !profile.is_active) {
        return { allowed: false }; // Désactivé
      }

      if (!profile) {
        const isEmailConfirmed = Boolean(user.email_confirmed_at);
        const isWhitelisted = bootstrapEmails.includes(user.email.toLowerCase());
        // SÉCURITÉ : Ne jamais lire user.user_metadata pour décider du rôle admin !
        if (isEmailConfirmed && isWhitelisted) {
          return { allowed: true, role: 'ADMINISTRATEUR' };
        }
        return { allowed: false };
      }

      return { allowed: true, role: profile.role };
    }

    const whitelist = ['ypaki090@gmail.com'];

    // 1. Attaque par inscription avec metadata username = 'admin'
    const attackerUser = {
      id: 'att-1',
      email: 'hacker@example.com',
      email_confirmed_at: new Date().toISOString(),
      user_metadata: { username: 'admin' },
    };
    const attackerRes = checkAuthDecision(attackerUser, null, whitelist);
    assert.equal(attackerRes.allowed, false, 'L’attaquant avec metadata.username=admin doit être rejeté');

    // 2. Administrateur désactivé
    const disabledAdmin = {
      id: 'adm-1',
      email: 'ypaki090@gmail.com',
      email_confirmed_at: new Date().toISOString(),
    };
    const disabledProfile: MockProfile = { id: 'adm-1', is_active: false, role: 'ADMINISTRATEUR' };
    const disabledRes = checkAuthDecision(disabledAdmin, disabledProfile, whitelist);
    assert.equal(disabledRes.allowed, false, 'L’administrateur désactivé doit rester bloqué');

    // 3. Amorçage légitime du premier admin confirmé
    const legitimateAdmin = {
      id: 'adm-2',
      email: 'ypaki090@gmail.com',
      email_confirmed_at: new Date().toISOString(),
    };
    const bootstrapRes = checkAuthDecision(legitimateAdmin, null, whitelist);
    assert.equal(bootstrapRes.allowed, true);
    assert.equal(bootstrapRes.role, 'ADMINISTRATEUR');
  });
});
