export type DistrictPriority = 'high' | 'medium' | 'low' | 'no signal';

export interface HealthStatus {
  ok: boolean;
  newsdataKey: boolean;
  creditsUsedToday: number;
  creditsLast15Min: number;
  dailyLimit: number;
  windowLimit: number;
}

export interface NewsArticle {
  id: string;
  title: string;
  description: string | null;
  link: string;
  pubDate: string | null;
  sourceName: string;
  sourceUrl: string | null;
  country?: string[];
  category?: string[];
  language?: string | null;
}

export interface NewsResponse {
  cached: boolean;
  fetchedAt: string;
  requestPreview: string;
  articles: NewsArticle[];
  credits: HealthStatus;
}

export interface DistrictPlan {
  name: string;
  priority: DistrictPriority;
  reason: string;
  articleIds: string[];
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

export interface PlanResponse {
  query: string;
  region?: string;
  attempts?: PlanAttempt[];
  timings?: PlanTimings;
  news: NewsResponse;
  plan: {
    districts: DistrictPlan[];
    caveats: string[];
  };
}

export interface ApiErrorPayload {
  error: string;
  message: string;
  upstreamStatus?: number | null;
  retryAfter?: number | null;
}

export interface UnderTheHoodData {
  endpoint: string;
  requestPreview: string;
  cached: boolean;
  fetchedAt: string;
  rawJson: unknown;
}
