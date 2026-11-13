import type { Request, Response } from 'express';
import { hasNewsDataKey } from './_lib/data.ts';
import { ApiError, logRouteResult, sendApiError, verifyClassCode } from './_lib/errors.ts';
import { generateSearchQueryWithGemini, rankDistrictsWithGemini } from './_lib/gemini.ts';
import { queryNewsData } from './_lib/newsdata.ts';

export default async function planHandler(req: Request, res: Response): Promise<void> {
  if (req.method && req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendApiError(
      req,
      res,
      '/api/plan',
      new ApiError(405, 'bad_request', 'Method not allowed. Use POST /api/plan.')
    );
    return;
  }

  try {
    verifyClassCode(req);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const situation = typeof body.situation === 'string' ? body.situation.trim() : '';
    const country =
      typeof body.country === 'string' && body.country.trim()
        ? body.country.trim().toLowerCase()
        : 'in';

    if (situation.length < 5 || situation.length > 1000) {
      throw new ApiError(
        400,
        'bad_request',
        'Field "situation" must be between 5 and 1000 characters.'
      );
    }

    if (!hasNewsDataKey()) {
      throw new ApiError(
        401,
        'missing_key',
        'NEWSDATA_API_KEY is not configured on the server.',
        401
      );
    }

    const query = await generateSearchQueryWithGemini(situation);
    const news = await queryNewsData({
      q: query,
      country,
      language: 'en',
    });
    const plan = await rankDistrictsWithGemini(situation, news.articles);

    logRouteResult(req.method || 'POST', '/api/plan', 200, news.cached);
    res.status(200).json({
      query,
      news,
      plan,
    });
  } catch (err) {
    sendApiError(req, res, '/api/plan', err);
  }
}
