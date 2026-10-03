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
 * Safely fetches a URL and parses JSON only if the response has an application/json content-type.
 * If Vercel or any proxy returns a 404/500 HTML page (e.g. "The page could not be found"),
 * it gracefully returns ok: false, data: null without crashing or throwing SyntaxError.
 */
export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeFetchResult<T>> {
  try {
    const res = await fetch(input, init);
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
