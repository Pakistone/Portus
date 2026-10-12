/**
 * Safe API Network Utility for PORTUS — U.J.S.R.V.
 * Prevents "Unexpected token 'T', 'The page c'... is not valid JSON"
 * by strictly verifying HTTP status and Content-Type before attempting JSON parsing.
 */

export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  isHtml: boolean;
  rawText?: string;
  error?: string;
}

/**
 * Récupère le jeton d'authentification valide en cache de session ou local.
 */
export function getStoredAuthToken(): string | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const s = sessionStorage.getItem('portus_access_token');
      if (s && s.trim()) return s.trim();
    }
    if (typeof localStorage !== 'undefined') {
      const l = localStorage.getItem('portus_access_token');
      if (l && l.trim()) return l.trim();
      // Recherche éventuelle de jeton Supabase Auth dans localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('auth-token'))) {
          try {
            const parsed = JSON.parse(localStorage.getItem(key) || '{}');
            if (parsed.access_token) return parsed.access_token;
          } catch {}
        }
      }
    }
  } catch {}
  return null;
}

/**
 * Génère les headers par défaut incluant Authorization Bearer si disponible.
 */
export function getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (!headers['Authorization']) {
    const token = getStoredAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

/**
 * Safely fetches a URL and parses JSON only if the response has an application/json content-type.
 * Automatically injects the Authorization Bearer header if a valid session token is available.
 * If Vercel or any proxy returns a 404/500 HTML page (e.g. "The page could not be found"),
 * it gracefully returns ok: false, data: null without crashing or throwing SyntaxError.
 */
export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeFetchResult<T>> {
  try {
    // Normalisation des en-têtes avec injection automatique du jeton Bearer
    const headers = new Headers(init?.headers || {});
    if (!headers.has('Authorization')) {
      const token = getStoredAuthToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    const modifiedInit: RequestInit = {
      ...init,
      headers,
    };

    const res = await fetch(input, modifiedInit);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isJson = contentType.includes('application/json');

    if (!isJson) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        data: null,
        isHtml: true,
        rawText: text.slice(0, 300),
        error: res.status === 404 
          ? `Route API non trouvée (404). Vérifiez le déploiement backend Vercel.` 
          : `Réponse serveur non-JSON reçue (${res.status}).`,
      };
    }

    try {
      const data = (await res.json()) as T;
      return {
        ok: res.ok,
        status: res.status,
        data,
        isHtml: false,
      };
    } catch (parseErr: any) {
      return {
        ok: false,
        status: res.status,
        data: null,
        isHtml: false,
        error: `Erreur de décodage JSON : ${parseErr.message}`,
      };
    }
  } catch (netErr: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      isHtml: false,
      error: `Erreur réseau : ${netErr?.message || 'Serveur injoignable'}`,
    };
  }
}
