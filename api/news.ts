import type { Request, Response } from 'express';
import { ApiError, logRouteResult, sendApiError, verifyClassCode } from './_lib/errors.ts';
import { queryNewsData } from './_lib/newsdata.ts';

export default async function newsHandler(req: Request, res: Response): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendApiError(
      req,
      res,
      '/api/news',
      new ApiError(405, 'bad_request', 'Method not allowed. Use GET /api/news.')
    );
    return;
  }

  try {
    verifyClassCode(req);

    const q = typeof req.query?.q === 'string' ? req.query.q : '';
    const country = typeof req.query?.country === 'string' ? req.query.country : '';
    const language = typeof req.query?.language === 'string' ? req.query.language : '';
    const category = typeof req.query?.category === 'string' ? req.query.category : '';

    const news = await queryNewsData({ q, country, language, category });
    logRouteResult(req.method || 'GET', '/api/news', 200, news.cached);
    res.status(200).json(news);
  } catch (err) {
    sendApiError(req, res, '/api/news', err);
  }
}
