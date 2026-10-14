import app from '../server';

export default function handler(req: any, res: any) {
  // Garantir la compatibilité des routes si Vercel supprime le préfixe /api lors de la réécriture
  if (req.url) {
    let url = req.url.startsWith('/') ? req.url : `/${req.url}`;
    if (!url.startsWith('/api')) {
      url = `/api${url}`;
    }
    req.url = url.replace(/\/+/g, '/');
  }
  return app(req, res);
}

