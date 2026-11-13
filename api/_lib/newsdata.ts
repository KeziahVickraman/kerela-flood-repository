import {
  getCachedNews,
  getCreditsSnapshot,
  getLocalRetryAfterSeconds,
  hasNewsDataKey,
  recordCreditUse,
  setCachedNews,
  UPSTREAM_TIMEOUT_MS,
  type ErrorCode,
  type NewsPayload,
  type NormalizedArticle,
} from './data.ts';
import { ApiError } from './errors.ts';

function buildQueryParams(input: {
  q?: string;
  country?: string;
  language?: string;
  category?: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  const q = (input.q ?? '').trim();
  const country = (input.country ?? '').trim().toLowerCase();
  const language = (input.language ?? '').trim().toLowerCase();
  const category = (input.category ?? '').trim().toLowerCase();

  if (q) params.set('q', q);
  if (country) params.set('country', country);
  if (language) params.set('language', language);
  if (category && category !== 'any') params.set('category', category);

  return params;
}

function normalizeArticle(raw: Record<string, unknown>, index: number): NormalizedArticle {
  const title =
    typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Untitled headline';
  const link = typeof raw.link === 'string' ? raw.link.trim() : '';
  const id =
    typeof raw.article_id === 'string' && raw.article_id.trim()
      ? raw.article_id.trim()
      : `article-${index}-${Buffer.from(link || title).toString('base64url').slice(0, 10)}`;

  const sourceName =
    typeof raw.source_name === 'string' && raw.source_name.trim()
      ? raw.source_name.trim()
      : typeof raw.source_id === 'string' && raw.source_id.trim()
        ? raw.source_id.trim()
        : 'Unknown source';

  return {
    id,
    title,
    description:
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim()
        : null,
    link,
    pubDate: typeof raw.pubDate === 'string' ? raw.pubDate : null,
    sourceName,
    sourceUrl:
      typeof raw.source_url === 'string' && raw.source_url.trim()
        ? raw.source_url.trim()
        : null,
    country: Array.isArray(raw.country)
      ? raw.country.filter((c): c is string => typeof c === 'string')
      : [],
    category: Array.isArray(raw.category)
      ? raw.category.filter((c): c is string => typeof c === 'string')
      : [],
    language: typeof raw.language === 'string' ? raw.language : null,
  };
}

export async function queryNewsData(input: {
  q?: string;
  country?: string;
  language?: string;
  category?: string;
}): Promise<NewsPayload> {
  const q = (input.q ?? '').trim();
  if (q.length > 100) {
    throw new ApiError(
      400,
      'bad_request',
      'Query parameter "q" must be 100 characters or fewer.'
    );
  }

  const apiKey = process.env.NEWSDATA_API_KEY?.trim();
  if (!apiKey || !hasNewsDataKey()) {
    throw new ApiError(
      401,
      'missing_key',
      'NEWSDATA_API_KEY is not configured on the server.',
      401
    );
  }

  const baseParams = buildQueryParams(input);
  const cacheKey = baseParams.toString();
  const now = Date.now();

  const cachedEntry = getCachedNews(cacheKey, now);
  if (cachedEntry) {
    return {
      cached: true,
      fetchedAt: cachedEntry.fetchedAt,
      requestPreview: cachedEntry.requestPreview,
      articles: cachedEntry.articles,
      credits: getCreditsSnapshot(now),
    };
  }

  const snapshot = getCreditsSnapshot(now);
  if (
    snapshot.creditsLast15Min >= snapshot.windowLimit ||
    snapshot.creditsUsedToday >= snapshot.dailyLimit
  ) {
    const retryAfter = getLocalRetryAfterSeconds(now);
    throw new ApiError(
      429,
      'rate_limited',
      'Local credit limit reached for the classroom demo. Please wait before retrying.',
      429,
      retryAfter
    );
  }

  const previewParams = new URLSearchParams(baseParams);
  previewParams.set('apikey', '***REDACTED***');
  const requestPreview = `https://newsdata.io/api/1/latest?${previewParams.toString()}`;

  const upstreamParams = new URLSearchParams(baseParams);
  upstreamParams.set('apikey', apiKey);
  const upstreamUrl = `https://newsdata.io/api/1/latest?${upstreamParams.toString()}`;

  recordCreditUse(now);

  let upstreamRes: globalThis.Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new ApiError(
      isTimeout ? 504 : 502,
      'upstream_error',
      isTimeout
        ? 'Upstream NewsData request timed out after 10 seconds.'
        : 'Failed to reach the upstream NewsData API.'
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await upstreamRes.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!upstreamRes.ok || body.status === 'error') {
    const resultsObj =
      body.results && typeof body.results === 'object'
        ? (body.results as Record<string, unknown>)
        : {};
    const upstreamMsg =
      (typeof resultsObj.message === 'string' && resultsObj.message) ||
      (typeof body.message === 'string' && body.message) ||
      `NewsData returned HTTP ${upstreamRes.status}.`;

    if (upstreamRes.status === 401 || upstreamRes.status === 403) {
      const code: ErrorCode = /missing/i.test(upstreamMsg) ? 'missing_key' : 'invalid_key';
      throw new ApiError(401, code, upstreamMsg, upstreamRes.status);
    }

    if (upstreamRes.status === 429) {
      const retryHeader = Number(upstreamRes.headers.get('retry-after'));
      const retryAfter =
        Number.isFinite(retryHeader) && retryHeader > 0 ? Math.ceil(retryHeader) : 900;
      throw new ApiError(429, 'rate_limited', upstreamMsg, 429, retryAfter);
    }

    if (upstreamRes.status === 400 || upstreamRes.status === 422) {
      throw new ApiError(400, 'bad_request', upstreamMsg, upstreamRes.status);
    }

    throw new ApiError(
      upstreamRes.status >= 500 ? 502 : upstreamRes.status,
      'upstream_error',
      upstreamMsg,
      upstreamRes.status
    );
  }

  const rawResults = Array.isArray(body.results) ? body.results : [];
  const articles = rawResults
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item, idx) => normalizeArticle(item, idx));

  const fetchedAt = new Date().toISOString();
  setCachedNews(cacheKey, { fetchedAt, requestPreview, articles });

  return {
    cached: false,
    fetchedAt,
    requestPreview,
    articles,
    credits: getCreditsSnapshot(),
  };
}
