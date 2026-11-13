import type { Request, Response } from 'express';
import {
  getCreditsSnapshot,
  hasNewsDataKey,
  type NewsPayload,
  type NormalizedArticle,
  type PlanAttempt,
} from './_lib/data.ts';
import { ApiError, logRouteResult, sendApiError, verifyClassCode } from './_lib/errors.ts';
import { generateSearchQueryWithGemini, rankDistrictsWithGemini } from './_lib/gemini.ts';
import { queryNewsData } from './_lib/newsdata.ts';

function clampSimpleQuery(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 100) return cleaned;
  return cleaned.slice(0, 100).trim();
}

function mergeArticles(existing: NormalizedArticle[], incoming: NormalizedArticle[]): NormalizedArticle[] {
  const seen = new Set<string>();
  const merged: NormalizedArticle[] = [];

  for (const article of [...existing, ...incoming]) {
    const dedupeKey = article.link || article.id;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    merged.push(article);
  }

  return merged;
}

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

  const totalStart = Date.now();

  try {
    verifyClassCode(req);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const situation = typeof body.situation === 'string' ? body.situation.trim() : '';
    const country =
      typeof body.country === 'string' && body.country.trim()
        ? body.country.trim().toLowerCase()
        : 'in';
    const region =
      typeof body.region === 'string' && body.region.trim()
        ? body.region.trim()
        : 'Kerala';

    if (situation.length < 5 || situation.length > 1000) {
      throw new ApiError(
        400,
        'bad_request',
        'Field "situation" must be between 5 and 1000 characters.'
      );
    }

    if (region.length > 60) {
      throw new ApiError(
        400,
        'bad_request',
        'Field "region" must be 60 characters or fewer.'
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

    // Step A: Anchored Gemini query (<= 100 chars)
    const queryStart = Date.now();
    const initialQuery = await generateSearchQueryWithGemini(situation, region);
    const queryMs = Date.now() - queryStart;

    // Step B: NewsData fetch (en,ml) with syntax/empty fallback + broader follow-up if < 3 articles
    const newsStart = Date.now();
    const attempts: PlanAttempt[] = [];
    let mergedArticles: NormalizedArticle[] = [];
    let finalNews: NewsPayload | null = null;
    let activeQuery = initialQuery;
    let syntaxFallbackUsed = false;

    try {
      const firstResult = await queryNewsData({
        q: initialQuery,
        country,
        language: 'en,ml',
      });
      attempts.push({
        query: initialQuery,
        articleCount: firstResult.articles.length,
        cached: firstResult.cached,
      });
      mergedArticles = mergeArticles(mergedArticles, firstResult.articles);
      finalNews = firstResult;
    } catch (err) {
      // If NewsData rejected parentheses/boolean syntax (400/422), fall back to a simple query
      if (err instanceof ApiError && err.code === 'bad_request') {
        attempts.push({
          query: initialQuery,
          articleCount: 0,
          cached: false,
        });
        syntaxFallbackUsed = true;
        const simpleQuery = clampSimpleQuery(`${region} rain`);
        activeQuery = simpleQuery;
        const fallbackResult = await queryNewsData({
          q: simpleQuery,
          country,
          language: 'en,ml',
        });
        attempts.push({
          query: simpleQuery,
          articleCount: fallbackResult.articles.length,
          cached: fallbackResult.cached,
        });
        mergedArticles = mergeArticles(mergedArticles, fallbackResult.articles);
        finalNews = fallbackResult;
      } else {
        throw err;
      }
    }

    // If fewer than 3 articles and we haven't already done a fallback call, run ONE broader follow-up call
    if (mergedArticles.length < 3 && !syntaxFallbackUsed) {
      const broaderQuery =
        mergedArticles.length === 0 && /[()]/.test(initialQuery)
          ? clampSimpleQuery(`${region} rain`)
          : clampSimpleQuery(`${region} weather OR ${region} rain OR ${region} road`);

      if (broaderQuery.toLowerCase() !== initialQuery.toLowerCase()) {
        const snapshot = getCreditsSnapshot();
        const withinBudget =
          snapshot.creditsLast15Min < snapshot.windowLimit &&
          snapshot.creditsUsedToday < snapshot.dailyLimit;

        if (withinBudget) {
          try {
            const secondResult = await queryNewsData({
              q: broaderQuery,
              country,
              language: 'en,ml',
            });
            attempts.push({
              query: broaderQuery,
              articleCount: secondResult.articles.length,
              cached: secondResult.cached,
            });
            mergedArticles = mergeArticles(mergedArticles, secondResult.articles);
            finalNews = secondResult;
          } catch (err) {
            // If follow-up hits rate limit or bad_request, keep Attempt 1 results rather than discarding them
            if (!(err instanceof ApiError && (err.code === 'rate_limited' || err.code === 'bad_request'))) {
              throw err;
            }
          }
        }
      }
    }

    const newsMs = Date.now() - newsStart;

    const combinedNews: NewsPayload = {
      cached: attempts.length > 0 && attempts.every((a) => a.cached),
      fetchedAt: finalNews?.fetchedAt ?? new Date().toISOString(),
      requestPreview: finalNews?.requestPreview ?? '',
      articles: mergedArticles,
      credits: getCreditsSnapshot(),
    };

    // Step C: Gemini bilingual triage & district prioritization
    const triageStart = Date.now();
    const plan = await rankDistrictsWithGemini(situation, mergedArticles, region);
    const triageMs = Date.now() - triageStart;
    const totalMs = Date.now() - totalStart;

    logRouteResult(req.method || 'POST', '/api/plan', 200, combinedNews.cached);
    res.status(200).json({
      query: activeQuery,
      region,
      attempts,
      timings: {
        queryMs,
        newsMs,
        triageMs,
        totalMs,
      },
      news: combinedNews,
      plan,
    });
  } catch (err) {
    sendApiError(req, res, '/api/plan', err);
  }
}
