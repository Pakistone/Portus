/**
 * Contexte d'authentification pour PORTUS — U.J.S.R.V.
 * 
 * RÈGLES MÉTIER :
 * - Connexion : nom d'utilisateur + mot de passe
 * - Pas de PIN, Pas de 2FA
 * - Après 5 tentatives échouées : verrouillage temporaire de 15 minutes
 * - ⚠️ RÈGLE CRITIQUE : NE JAMAIS transformer ou normaliser les mots de passe.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User, Role, LoginAttempt } from '../types';
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS } from '../config/constants';
import { getDB, INITIAL_USERS } from '../db/indexedDb';
import { SupabaseDataLayer } from '../db/supabaseService';

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  loginError: string | null;
  sessionNotice: string | null;
  lockoutRemainingSeconds: number | null;
  login: (username: string, passwordRaw: string) => Promise<boolean>;
  logout: (reason?: string) => Promise<void>;
  switchUserRole: (role: Role) => Promise<void>;
  changePassword: (currentPasswordRaw: string, newPasswordRaw: string) => Promise<{ success: boolean; error?: string }>;
  clearSessionNotice: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CURRENT_USER_SESSION_KEY = 'portus_session_user_id';
const SESSION_START_KEY = 'portus_session_created_at';
const SESSION_LAST_ACTIVE_KEY = 'portus_session_last_active';

// Limites de sécurité de session
const SESSION_INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes d'inactivité
const SESSION_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 heures maximum par session

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [lockoutRemainingSeconds, setLockoutRemainingSeconds] = useState<number | null>(null);

  const clearSessionNotice = () => setSessionNotice(null);

  // Helper pour enregistrer chaque tentative dans IndexedDB et Supabase
  const logAttempt = async (params: {
    username: string;
    profileId?: string;
    isSuccessful: boolean;
    failureReason?: string;
  }) => {
    try {
      const db = await getDB();
      const attempt: LoginAttempt = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        username: params.username,
        profileId: params.profileId,
        isSuccessful: params.isSuccessful,
        failureReason: params.failureReason,
        attemptedAt: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };

      if (db.objectStoreNames.contains('login_attempts')) {
        await db.put('login_attempts', attempt);
      }

      // Envoi à Supabase si connecté
      if (SupabaseDataLayer.isAvailable()) {
        SupabaseDataLayer.recordLoginAttempt(params).catch((e) =>
          console.warn('Supabase login_attempt sync warning:', e)
        );
      }
    } catch (err) {
      console.warn('Erreur enregistrement tentative login:', err);
    }
  };

  // Déconnexion sécurisée
  const logout = async (reason?: string) => {
    const userToLog = currentUser;
    if (userToLog) {
      try {
        const db = await getDB();
        await db.put('audit_logs', {
          id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          actorId: userToLog.id,
          actorName: userToLog.fullName,
          actorRole: userToLog.role,
          action: reason ? 'SESSION_EXPIRED' : 'LOGOUT',
          timestamp: new Date().toISOString(),
          targetEntity: 'User',
          targetId: userToLog.id,
          details: reason || 'Déconnexion volontaire de l’utilisateur',
        });
      } catch (e) {
        console.warn('Erreur log logout:', e);
      }
    }

    sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
    sessionStorage.removeItem(SESSION_START_KEY);
    sessionStorage.removeItem(SESSION_LAST_ACTIVE_KEY);
    setCurrentUser(null);

    if (reason) {
      setSessionNotice(reason);
    }
  };

  // Mettre à jour l'horodatage de dernière activité
  const touchActivity = () => {
    sessionStorage.setItem(SESSION_LAST_ACTIVE_KEY, Date.now().toString());
  };

  // Vérifier la session au démarrage
  useEffect(() => {
    async function restoreSession() {
      try {
        const db = await getDB();
        const savedUserId = sessionStorage.getItem(CURRENT_USER_SESSION_KEY);
        const sessionStart = sessionStorage.getItem(SESSION_START_KEY);
        const lastActive = sessionStorage.getItem(SESSION_LAST_ACTIVE_KEY);

        if (savedUserId) {
          const now = Date.now();
          const startMs = sessionStart ? parseInt(sessionStart, 10) : now;
          const activeMs = lastActive ? parseInt(lastActive, 10) : now;

          // Vérifier si la session a expiré par inactivité ou durée max
          if (now - activeMs > SESSION_INACTIVITY_LIMIT_MS) {
            await logout('Votre session a expiré suite à une inactivité prolongée (30 min).');
            return;
          }
          if (now - startMs > SESSION_MAX_LIFETIME_MS) {
            await logout('Votre session a atteint la durée maximale autorisée (8h). Veuillez vous reconnecter.');
            return;
          }

          const user = await db.get('users', savedUserId);
          if (user && user.isActive) {
            setCurrentUser(user);
            touchActivity();
          } else {
            await logout('Ce compte est désactivé ou introuvable.');
          }
        }
      } catch (err) {
        console.error('Erreur chargement session', err);
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, []);

  // Détecteurs d'activité utilisateur (throttle toutes les 15s)
  useEffect(() => {
    if (!currentUser) return;

    let lastUpdate = 0;
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastUpdate > 15000) {
        lastUpdate = now;
        touchActivity();
      }
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
    };
  }, [currentUser]);

  // Surveillance périodique de session (toutes les 15 secondes)
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(async () => {
      const now = Date.now();
      const sessionStart = sessionStorage.getItem(SESSION_START_KEY);
      const lastActive = sessionStorage.getItem(SESSION_LAST_ACTIVE_KEY);

      if (sessionStart && now - parseInt(sessionStart, 10) > SESSION_MAX_LIFETIME_MS) {
        clearInterval(interval);
        await logout('Votre session de travail a atteint la limite de 8h. Veuillez vous reconnecter.');
        return;
      }

      if (lastActive && now - parseInt(lastActive, 10) > SESSION_INACTIVITY_LIMIT_MS) {
        clearInterval(interval);
        await logout('Session fermée pour cause d’inactivité (30 min).');
        return;
      }

      // Vérifier si le compte est toujours actif en base
      try {
        const db = await getDB();
        const dbUser = await db.get('users', currentUser.id);
        if (dbUser && !dbUser.isActive) {
          clearInterval(interval);
          await logout('Votre compte a été désactivé par l’administrateur général.');
        }
      } catch {
        // Ignorer les erreurs ponctuelles IndexedDB
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [currentUser]);

  // Décompte de verrouillage (15 minutes)
  useEffect(() => {
    if (!lockoutRemainingSeconds || lockoutRemainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setLockoutRemainingSeconds((prev) => {
        if (!prev || prev <= 1) {
          clearInterval(timer);
          setLoginError(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutRemainingSeconds]);

  const login = async (usernameInput: string, passwordRaw: string): Promise<boolean> => {
    setLoginError(null);
    setLockoutRemainingSeconds(null);

    const cleanUsername = usernameInput.trim().toLowerCase();
    if (!cleanUsername || !passwordRaw) {
      setLoginError('Veuillez renseigner votre nom d’utilisateur et votre mot de passe.');
      return false;
    }

    try {
      const db = await getDB();
      const user = await db.getFromIndex('users', 'by-username', cleanUsername);

      // Si l'utilisateur n'existe pas : NE PAS RÉVÉLER l'inexistence (message neutre et sécurisé)
      if (!user) {
        await logAttempt({
          username: cleanUsername,
          isSuccessful: false,
          failureReason: 'Identifiant introuvable ou incorrect',
        });
        setLoginError('Identifiant ou mot de passe incorrect.');
        return false;
      }

      // Vérifier si le compte a été désactivé par l'administrateur
      if (!user.isActive) {
        await logAttempt({
          username: cleanUsername,
          profileId: user.id,
          isSuccessful: false,
          failureReason: 'Compte désactivé par l’administrateur',
        });
        setLoginError('Accès refusé. Ce compte a été désactivé par l’administrateur.');
        return false;
      }

      // Vérifier le verrouillage temporaire (15 minutes après 5 échecs consécutifs)
      const now = new Date();
      if (user.lockedUntil) {
        const lockedUntilDate = new Date(user.lockedUntil);
        if (lockedUntilDate > now) {
          const remainingSec = Math.ceil((lockedUntilDate.getTime() - now.getTime()) / 1000);
          setLockoutRemainingSeconds(remainingSec);
          await logAttempt({
            username: cleanUsername,
            profileId: user.id,
            isSuccessful: false,
            failureReason: 'Tentative sur compte temporairement verrouillé (15 min)',
          });
          setLoginError(
            `Compte temporairement bloqué suite à 5 tentatives consécutives infructueuses. Réessayez dans ${Math.ceil(remainingSec / 60)} minute(s).`
          );
          return false;
        } else {
          // Verrouillage expiré, réinitialiser
          user.lockedUntil = null;
          user.failedAttempts = 0;
          await db.put('users', user);
        }
      }

      // Récupérer le mot de passe stocké (RÈGLE ABSOLUE : SANS AUCUNE NORMALISATION NI MODIFICATION)
      const passwordsMap = (await db.get('settings', 'user_passwords')) || {};
      const expectedPassword = passwordsMap[cleanUsername];

      if (expectedPassword !== passwordRaw) {
        // Échec de connexion : incrémenter le compteur d'échecs consécutifs
        const newAttempts = (user.failedAttempts || 0) + 1;
        let lockedTime: string | null = null;

        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          // Bloquer le compte pour 15 minutes exactes
          const lockExpiration = new Date(now.getTime() + LOCKOUT_DURATION_MS);
          lockedTime = lockExpiration.toISOString();
          user.lockedUntil = lockedTime;
          user.failedAttempts = newAttempts;
          await db.put('users', user);

          // Enregistrer dans Supabase si connecté
          if (SupabaseDataLayer.isAvailable()) {
            SupabaseDataLayer.upsertProfile(user).catch(() => {});
          }

          // Enregistrer la tentative
          await logAttempt({
            username: cleanUsername,
            profileId: user.id,
            isSuccessful: false,
            failureReason: `Compte verrouillé 15 minutes après ${MAX_LOGIN_ATTEMPTS} tentatives échouées`,
          });

          // Log d'audit immuable
          await db.put('audit_logs', {
            id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            actorId: user.id,
            actorName: user.fullName,
            actorRole: user.role,
            action: 'ACCOUNT_LOCKED',
            timestamp: new Date().toISOString(),
            targetEntity: 'User',
            targetId: user.id,
            details: `Compte verrouillé pendant 15 minutes suite à ${MAX_LOGIN_ATTEMPTS} échecs consécutifs.`,
          });

          setLockoutRemainingSeconds(LOCKOUT_DURATION_MS / 1000);
          setLoginError(
            `Compte temporairement bloqué pendant 15 minutes suite à ${MAX_LOGIN_ATTEMPTS} tentatives infructueuses.`
          );
          return false;
        } else {
          user.failedAttempts = newAttempts;
          await db.put('users', user);

          // Enregistrer dans Supabase
          if (SupabaseDataLayer.isAvailable()) {
            SupabaseDataLayer.upsertProfile(user).catch(() => {});
          }

          // Enregistrer la tentative
          await logAttempt({
            username: cleanUsername,
            profileId: user.id,
            isSuccessful: false,
            failureReason: `Mot de passe incorrect (Tentative ${newAttempts}/${MAX_LOGIN_ATTEMPTS})`,
          });

          // Log d'audit échec
          await db.put('audit_logs', {
            id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            actorId: user.id,
            actorName: user.fullName,
            actorRole: user.role,
            action: 'LOGIN_FAILED',
            timestamp: new Date().toISOString(),
            targetEntity: 'User',
            targetId: user.id,
            details: `Échec d'authentification (Tentative ${newAttempts}/${MAX_LOGIN_ATTEMPTS})`,
          });

          const attemptsLeft = MAX_LOGIN_ATTEMPTS - newAttempts;
          setLoginError(
            `Identifiant ou mot de passe incorrect. Attention : ${attemptsLeft} tentative(s) restante(s) avant blocage temporaire du compte.`
          );
          return false;
        }
      }

      // Connexion réussie : réinitialiser les compteurs d'échecs et le verrouillage
      user.failedAttempts = 0;
      user.lockedUntil = null;
      user.updatedAt = new Date().toISOString();
      await db.put('users', user);

      if (SupabaseDataLayer.isAvailable()) {
        SupabaseDataLayer.upsertProfile(user).catch(() => {});
      }

      // Enregistrer la tentative réussie
      await logAttempt({
        username: cleanUsername,
        profileId: user.id,
        isSuccessful: true,
      });

      // Log d'audit succès
      await db.put('audit_logs', {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actorId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        action: 'LOGIN_SUCCESS',
        timestamp: new Date().toISOString(),
        targetEntity: 'User',
        targetId: user.id,
        details: 'Authentification réussie',
      });

      sessionStorage.setItem(CURRENT_USER_SESSION_KEY, user.id);
      setCurrentUser(user);
      return true;
    } catch (err) {
      console.error('Erreur lors du login', err);
      setLoginError('Une erreur technique est survenue.');
      return false;
    }
  };

  // Changement de mot de passe sécurisé par l'utilisateur connecté
  const changePassword = async (
    currentPasswordRaw: string,
    newPasswordRaw: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'Session non active.' };
    }

    if (!newPasswordRaw || newPasswordRaw.length < 6) {
      return { success: false, error: 'Le nouveau mot de passe doit comporter au moins 6 caractères.' };
    }

    try {
      const db = await getDB();
      const passwordsMap = (await db.get('settings', 'user_passwords')) || {};
      const expectedPassword = passwordsMap[currentUser.username] || 'ujsrv2026';

      if (currentPasswordRaw !== expectedPassword) {
        return { success: false, error: 'Le mot de passe actuel saisi est incorrect.' };
      }

      // Enregistrer le nouveau mot de passe brut SANS normalisation
      passwordsMap[currentUser.username] = newPasswordRaw;
      await db.put('settings', passwordsMap, 'user_passwords');

      // Réinitialiser les compteurs
      const user = await db.get('users', currentUser.id);
      if (user) {
        user.failedAttempts = 0;
        user.lockedUntil = null;
        user.updatedAt = new Date().toISOString();
        await db.put('users', user);
        setCurrentUser(user);
      }

      await db.put('audit_logs', {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.role,
        action: 'PASSWORD_CHANGED',
        timestamp: new Date().toISOString(),
        targetEntity: 'User',
        targetId: currentUser.id,
        details: `Modification réussie de mot de passe personnel par ${currentUser.username}`,
      });

      return { success: true };
    } catch (err: any) {
      console.error('Erreur changement mot de passe:', err);
      return { success: false, error: err?.message || 'Erreur technique lors du changement de mot de passe.' };
    }
  };

  // Sélecteur de rôle (Testeur de rôles rapide / prévisualisation)
  const switchUserRole = async (targetRole: Role) => {
    try {
      const db = await getDB();
      // Trouver le premier utilisateur actif ayant ce rôle
      const user = await db.getFromIndex('users', 'by-role', targetRole);
      if (user && user.isActive) {
        user.failedAttempts = 0;
        user.lockedUntil = null;
        await db.put('users', user);
        sessionStorage.setItem(CURRENT_USER_SESSION_KEY, user.id);
        setCurrentUser(user);
      } else {
        const initUser = INITIAL_USERS.find((u) => u.role === targetRole);
        if (initUser) {
          const { passwordHash: _h, ...clean } = initUser;
          clean.isActive = true;
          clean.failedAttempts = 0;
          clean.lockedUntil = null;
          await db.put('users', clean);
          sessionStorage.setItem(CURRENT_USER_SESSION_KEY, clean.id);
          setCurrentUser(clean);
        }
      }
    } catch (err) {
      console.error('Erreur switch role', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        loginError,
        sessionNotice,
        lockoutRemainingSeconds,
        login,
        logout,
        switchUserRole,
        changePassword,
        clearSessionNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l’intérieur d’un AuthProvider');
  }
  return context;
}
