import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DAILY_LIMIT = 200;
const WINDOW_LIMIT = 30;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 10_000; // 10 seconds
const GEMINI_MODEL = 'gemini-2.5-flash';

const KERALA_DISTRICTS = [
  'Thiruvananthapuram',
  'Kollam',
  'Pathanamthitta',
  'Alappuzha',
  'Kottayam',
  'Idukki',
  'Ernakulam',
  'Thrissur',
  'Palakkad',
  'Malappuram',
  'Kozhikode',
  'Wayanad',
  'Kannur',
  'Kasaragod',
] as const;

const REQUIRED_CAVEATS = [
  'Free-tier NewsData headlines are delayed by roughly 12 hours and may lag behind rapidly changing flood conditions.',
  'Analysis is based on headlines and short descriptions only—no full article text is available.',
];

type ErrorCode =
  | 'missing_key'
  | 'invalid_key'
  | 'missing_or_invalid_class_code'
  | 'rate_limited'
  | 'bad_request'
  | 'upstream_error'
  | 'gemini_error';

type DistrictPriority = 'high' | 'medium' | 'low' | 'no signal';

interface HealthPayload {
  ok: true;
  newsdataKey: boolean;
  creditsUsedToday: number;
  creditsLast15Min: number;
  dailyLimit: number;
  windowLimit: number;
}

interface NormalizedArticle {
  id: string;
  title: string;
  description: string | null;
  link: string;
  pubDate: string | null;
  sourceName: string;
  sourceUrl: string | null;
  country: string[];
  category: string[];
  language: string | null;
}

interface NewsPayload {
  cached: boolean;
  fetchedAt: string;
  requestPreview: string;
  articles: NormalizedArticle[];
  credits: HealthPayload;
}

interface CacheEntry {
  expiresAt: number;
  fetchedAt: string;
  requestPreview: string;
  articles: NormalizedArticle[];
}

class ApiError extends Error {
  status: number;
  code: ErrorCode;
  upstreamStatus: number | null;
  retryAfter: number | null;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    upstreamStatus: number | null = null,
    retryAfter: number | null = null
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.upstreamStatus = upstreamStatus;
    this.retryAfter = retryAfter;
  }
}

const creditTimestamps: number[] = [];
const responseCache = new Map<string, CacheEntry>();

function hasNewsDataKey(): boolean {
  return Boolean(process.env.NEWSDATA_API_KEY?.trim());
}

function pruneCreditHistory(now: number): void {
  const cutoff = now - DAY_MS;
  while (creditTimestamps.length > 0 && creditTimestamps[0] < cutoff) {
    creditTimestamps.shift();
  }
}

function getCreditsSnapshot(now: number = Date.now()): HealthPayload {
  pruneCreditHistory(now);
  const startOfUtcDay = new Date(now);
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  const dayStart = startOfUtcDay.getTime();
  const windowStart = now - WINDOW_MS;

  const creditsUsedToday = creditTimestamps.filter((ts) => ts >= dayStart).length;
  const creditsLast15Min = creditTimestamps.filter((ts) => ts >= windowStart).length;

  return {
    ok: true,
    newsdataKey: hasNewsDataKey(),
    creditsUsedToday,
    creditsLast15Min,
    dailyLimit: DAILY_LIMIT,
    windowLimit: WINDOW_LIMIT,
  };
}

function getLocalRetryAfterSeconds(now: number): number {
  pruneCreditHistory(now);
  const windowStart = now - WINDOW_MS;
  const inWindow = creditTimestamps.filter((ts) => ts >= windowStart);
  if (inWindow.length >= WINDOW_LIMIT) {
    return Math.max(1, Math.ceil((inWindow[0] + WINDOW_MS - now) / 1000));
  }
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((tomorrow.getTime() - now) / 1000));
}

function requireClassCode(req: Request, _res: Response, next: NextFunction): void {
  const expected = process.env.CLASS_ACCESS_CODE?.trim();
  if (!expected) {
    next();
    return;
  }
  const provided = req.header('x-class-code')?.trim();
  if (!provided || provided !== expected) {
    next(
      new ApiError(
        401,
        'missing_or_invalid_class_code',
        'Missing or invalid x-class-code header for this classroom demo.'
      )
    );
    return;
  }
  next();
}

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
    sourceUrl: typeof raw.source_url === 'string' && raw.source_url.trim() ? raw.source_url.trim() : null,
    country: Array.isArray(raw.country)
      ? raw.country.filter((c): c is string => typeof c === 'string')
      : [],
    category: Array.isArray(raw.category)
      ? raw.category.filter((c): c is string => typeof c === 'string')
      : [],
    language: typeof raw.language === 'string' ? raw.language : null,
  };
}

async function queryNewsData(input: {
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
  if (!apiKey) {
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

  const cachedEntry = responseCache.get(cacheKey);
  if (cachedEntry && cachedEntry.expiresAt > now) {
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

  creditTimestamps.push(now);

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
  responseCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    fetchedAt,
    requestPreview,
    articles,
  });

  return {
    cached: false,
    fetchedAt,
    requestPreview,
    articles,
    credits: getCreditsSnapshot(),
  };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiError(
      500,
      'gemini_error',
      'GEMINI_API_KEY is not configured on the server.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function truncateQuery(raw: string): string {
  const cleaned = raw.replace(/[\r\n"`]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 100) return cleaned;
  const sliced = cleaned.slice(0, 100);
  const lastSpace = sliced.lastIndexOf(' ');
  const trimmed = lastSpace > 40 ? sliced.slice(0, lastSpace).trim() : sliced.trim();
  return trimmed.replace(/\b(OR|AND|NOT)$/i, '').trim().slice(0, 100);
}

async function generateSearchQueryWithGemini(situation: string): Promise<string> {
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Situation from a flood-relief NGO in Kerala, India:\n"${situation}"\n\nReturn ONE concise NewsData.io search query string (at most 100 characters) joining key terms with OR so it retrieves recent headlines about floods, landslides, heavy rain, or road closures in Kerala.`,
      config: {
        systemInstruction:
          'Return structured JSON matching {"query": string}. Keep query <= 100 characters, joining terms with OR (e.g. "Kerala flood OR landslide OR monsoon OR road closure").',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'Single NewsData search query string of at most 100 characters joining terms with OR.',
            },
          },
          required: ['query'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as { query?: string };
    const candidate = truncateQuery(parsed.query ?? '');
    if (!candidate) {
      throw new Error('Gemini returned an empty search query.');
    }
    return candidate.slice(0, 100);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini query generation failed.';
    throw new ApiError(502, 'gemini_error', `Gemini step A failed: ${message}`);
  }
}

async function rankDistrictsWithGemini(situation: string, articles: NormalizedArticle[]) {
  const ai = getGeminiClient();
  const validArticleIds = new Set(articles.map((a) => a.id));

  const compactArticles = articles.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description ?? '',
    sourceName: a.sourceName,
    pubDate: a.pubDate ?? '',
  }));

  const prompt = `NGO Situation: "${situation}"

Returned NewsData articles (ONLY use these exact article IDs):
${compactArticles.length > 0 ? JSON.stringify(compactArticles, null, 2) : '[]'}

Rank all 14 districts of Kerala (${KERALA_DISTRICTS.join(', ')}) for relief supply runs this week:
- "high": Direct reports of flooding, landslides, red/orange alerts, submerged roads, or evacuations in that district.
- "medium": Heavy rain alerts, rising river/dam levels, or nearby disruptions affecting that district.
- "low": Mentioned with minor rain or normal precautions without acute disruption.
- "no signal": No returned article provides evidence for that district. Never guess or fabricate evidence.

Rules:
1. Return an entry for all 14 Kerala districts.
2. In "articleIds", cite ONLY exact "id" values from the provided articles list (empty array if "no signal").
3. Always include caveats noting that the free-tier NewsData feed is about 12 hours old and contains headlines/descriptions only (no full article text).`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction:
          'You are a careful humanitarian logistics planner. Rely strictly on the provided article IDs and headlines. Mark districts with no evidence as "no signal".',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            districts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  priority: {
                    type: Type.STRING,
                    enum: ['high', 'medium', 'low', 'no signal'],
                  },
                  reason: { type: Type.STRING },
                  articleIds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['name', 'priority', 'reason', 'articleIds'],
              },
            },
            caveats: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['districts', 'caveats'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      districts?: Array<{
        name?: string;
        priority?: DistrictPriority;
        reason?: string;
        articleIds?: string[];
      }>;
      caveats?: string[];
    };

    const byName = new Map(
      (parsed.districts ?? []).map((d) => [(d.name ?? '').trim().toLowerCase(), d])
    );

    const districts = KERALA_DISTRICTS.map((districtName) => {
      const match = byName.get(districtName.toLowerCase());
      const validIds = Array.from(
        new Set(
          (match?.articleIds ?? []).filter(
            (id): id is string => typeof id === 'string' && validArticleIds.has(id)
          )
        )
      );

      let priority: DistrictPriority =
        match?.priority && ['high', 'medium', 'low', 'no signal'].includes(match.priority)
          ? match.priority
          : 'no signal';

      if (validIds.length === 0 && priority !== 'no signal') {
        priority = 'no signal';
      }

      const reason =
        priority === 'no signal' && validIds.length === 0
          ? match?.reason?.trim() ||
            'No returned headlines mentioned this district.'
          : match?.reason?.trim() || 'Referenced in recent monsoon headlines.';

      return {
        name: districtName,
        priority,
        reason,
        articleIds: validIds,
      };
    });

    const rawCaveats = Array.isArray(parsed.caveats)
      ? parsed.caveats.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : [];

    const hasDelayCaveat = rawCaveats.some((c) => /12\s*hour|delay/i.test(c));
    const hasHeadlineCaveat = rawCaveats.some((c) => /headline|full\s*text/i.test(c));
    const caveats = [...rawCaveats];
    if (!hasDelayCaveat) caveats.unshift(REQUIRED_CAVEATS[0]);
    if (!hasHeadlineCaveat) caveats.push(REQUIRED_CAVEATS[1]);

    return { districts, caveats };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini district ranking failed.';
    throw new ApiError(502, 'gemini_error', `Gemini step C failed: ${message}`);
  }
}

function logApiRequest(req: Request, res: Response): void {
  const cached = Boolean(res.locals.cached);
  const credits = getCreditsSnapshot();
  console.log(
    `${req.method} ${req.path} status=${res.statusCode} cached=${cached} credits=${credits.creditsUsedToday}/${credits.dailyLimit} (15m:${credits.creditsLast15Min}/${credits.windowLimit})`
  );
}

async function startServer() {
  if (!hasNewsDataKey()) {
    console.warn(
      'WARNING: NEWSDATA_API_KEY is not set. /api/health will report newsdataKey: false and NewsData requests will return 401 missing_key.'
    );
  }

  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.use('/api', (req, res, next) => {
    res.locals.cached = false;
    res.on('finish', () => {
      logApiRequest(req, res);
    });
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json(getCreditsSnapshot());
  });

  app.use('/api', (req, res, next) => {
    if (req.path === '/health') {
      next();
      return;
    }
    requireClassCode(req, res, next);
  });

  app.get('/api/news', async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const country = typeof req.query.country === 'string' ? req.query.country : '';
      const language = typeof req.query.language === 'string' ? req.query.language : '';
      const category = typeof req.query.category === 'string' ? req.query.category : '';

      const news = await queryNewsData({ q, country, language, category });
      res.locals.cached = news.cached;
      res.json(news);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plan', async (req, res, next) => {
    try {
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
      res.locals.cached = news.cached;

      const plan = await rankDistrictsWithGemini(situation, news.articles);

      res.json({
        query,
        news,
        plan,
      });
    } catch (err) {
      next(err);
    }
  });

  // Consistent JSON error handler for /api/*
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      if (err.code === 'rate_limited' && err.retryAfter !== null) {
        res.setHeader('Retry-After', String(err.retryAfter));
      }
      res.status(err.status).json({
        error: err.code,
        message: err.message,
        upstreamStatus: err.upstreamStatus,
        retryAfter: err.retryAfter,
      });
      return;
    }

    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    res.status(500).json({
      error: 'upstream_error',
      message,
      upstreamStatus: null,
      retryAfter: null,
    });
  });

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
