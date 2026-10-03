import app from '../server';

export default function handler(req: any, res: any) {
  // Garantir la compatibilité des routes si Vercel supprime le préfixe /api lors de la réécriture
  if (req.url && !req.url.startsWith('/api')) {
    req.url = `/api${req.url}`;
  }
  return app(req, res);
}
