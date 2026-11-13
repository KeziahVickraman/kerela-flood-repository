export const DAILY_LIMIT = 200;
export const WINDOW_LIMIT = 30;
export const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const WINDOW_MS = 15 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const UPSTREAM_TIMEOUT_MS = 10_000; // 10 seconds
export const GEMINI_MODEL = 'gemini-4-hydrogen';

export const KERALA_DISTRICTS = [
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

export const REQUIRED_CAVEATS = [
  'Free-tier NewsData headlines are delayed by roughly 12 hours and may lag behind rapidly changing flood conditions.',
  'Analysis is based on headlines and short descriptions only—no full article text is available.',
];

export type ErrorCode =
  | 'missing_key'
  | 'invalid_key'
  | 'missing_or_invalid_class_code'
  | 'rate_limited'
  | 'bad_request'
  | 'upstream_error'
  | 'gemini_error';

export type DistrictPriority = 'high' | 'medium' | 'low' | 'no signal';

export interface HealthPayload {
  ok: true;
  newsdataKey: boolean;
  creditsUsedToday: number;
  creditsLast15Min: number;
  dailyLimit: number;
  windowLimit: number;
}

export interface NormalizedArticle {
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

export interface NewsPayload {
  cached: boolean;
  fetchedAt: string;
  requestPreview: string;
  articles: NormalizedArticle[];
  credits: HealthPayload;
}

export interface CacheEntry {
  expiresAt: number;
  fetchedAt: string;
  requestPreview: string;
  articles: NormalizedArticle[];
}

export interface PlanAttempt {
  query: string;
  articleCount: number;
  cached: boolean;
}

export interface PlanTimings {
  queryMs: number;
  newsMs: number;
  triageMs: number;
  totalMs: number;
}

const creditTimestamps: number[] = [];
const responseCache = new Map<string, CacheEntry>();

export function hasNewsDataKey(): boolean {
  return Boolean(process.env.NEWSDATA_API_KEY?.trim());
}

export function pruneCreditHistory(now: number): void {
  const cutoff = now - DAY_MS;
  while (creditTimestamps.length > 0 && creditTimestamps[0] < cutoff) {
    creditTimestamps.shift();
  }
}

export function recordCreditUse(now: number = Date.now()): void {
  creditTimestamps.push(now);
}

export function getCreditsSnapshot(now: number = Date.now()): HealthPayload {
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

export function getLocalRetryAfterSeconds(now: number = Date.now()): number {
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

export function getCachedNews(cacheKey: string, now: number = Date.now()): CacheEntry | null {
  const entry = responseCache.get(cacheKey);
  if (entry && entry.expiresAt > now) {
    return entry;
  }
  if (entry) {
    responseCache.delete(cacheKey);
  }
  return null;
}

export function setCachedNews(
  cacheKey: string,
  data: Omit<CacheEntry, 'expiresAt'>,
  now: number = Date.now()
): void {
  responseCache.set(cacheKey, {
    ...data,
    expiresAt: now + CACHE_TTL_MS,
  });
}
