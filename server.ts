import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hasNewsDataKey } from './api/_lib/data.ts';
import healthHandler from './api/health.ts';
import newsHandler from './api/news.ts';
import planHandler from './api/plan.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (!hasNewsDataKey()) {
    console.warn(
      'WARNING: NEWSDATA_API_KEY is not set. /api/health will report newsdataKey: false and NewsData requests will return 401 missing_key.'
    );
  }

  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', healthHandler);
  app.get('/api/news', newsHandler);
  app.post('/api/plan', planHandler);

  const distDir = path.join(__dirname, 'dist');
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kerala Flood Desk server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
