import type { Request, Response } from 'express';
import app from '../server';

/**
 * Gestionnaire d'entrée serverless pour déploiement Vercel / Cloud Run — PORTUS — U.J.P.A.S.
 * Union des Jeunes du Port pour l'Assistance et la Sécurité — Zone Portuaire & Industrielle d'Abidjan.
 * Type strictement la requête et la réponse Express sans aucun 'any'.
 */
export default function handler(req: Request, res: Response): void {
  if (req.url) {
    let normalizedUrl = req.url.startsWith('/') ? req.url : `/${req.url}`;
    if (!normalizedUrl.startsWith('/api')) {
      normalizedUrl = `/api${normalizedUrl}`;
    }
    req.url = normalizedUrl.replace(/\/+/g, '/');
  }
  app(req, res);
}
