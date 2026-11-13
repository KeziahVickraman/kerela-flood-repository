import type { Request, Response } from 'express';
import { getCreditsSnapshot } from './_lib/data.ts';
import { logRouteResult } from './_lib/errors.ts';

export default function healthHandler(req: Request, res: Response): void {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    logRouteResult(req.method, '/api/health', 405, false);
    res.status(405).json({
      error: 'bad_request',
      message: 'Method not allowed. Use GET /api/health.',
      upstreamStatus: null,
      retryAfter: null,
    });
    return;
  }

  const snapshot = getCreditsSnapshot();
  logRouteResult(req.method || 'GET', '/api/health', 200, false);
  res.status(200).json(snapshot);
}
