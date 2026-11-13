import { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { ErrorBanner } from './components/ErrorBanner';
import { PlanSupplyRunsTab } from './components/PlanSupplyRunsTab';
import { RawSearchTab, type RawSearchParams } from './components/RawSearchTab';
import { StatusBar } from './components/StatusBar';
import { UnderTheHoodPanel } from './components/UnderTheHoodPanel';
import type {
  ApiErrorPayload,
  HealthStatus,
  NewsResponse,
  PlanResponse,
  UnderTheHoodData,
} from './types';

type ActiveTab = 'plan' | 'raw';

const DEFAULT_SITUATION =
  'Heavy monsoon rain in Kerala this week; we need to know which districts have flooding, landslides or closed roads.';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('plan');

  // Kept strictly in React state (never localStorage)
  const [classCode, setClassCode] = useState('');
  const [highlightClassCode, setHighlightClassCode] = useState(false);
  const classCodeInputRef = useRef<HTMLInputElement | null>(null);

  // Health & credit meters
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(false);

  // Plan tab state
  const [situation, setSituation] = useState(DEFAULT_SITUATION);
  const [planLoading, setPlanLoading] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planHood, setPlanHood] = useState<UnderTheHoodData | null>(null);

  // Raw search tab state
  const [rawParams, setRawParams] = useState<RawSearchParams>({
    q: 'Kerala flood OR landslide',
    country: 'in',
    language: 'en',
    category: 'any',
  });
  const [rawLoading, setRawLoading] = useState(false);
  const [news, setNews] = useState<NewsResponse | null>(null);
  const [newsHood, setNewsHood] = useState<UnderTheHoodData | null>(null);

  // Error & rate-limit countdown state
  const [error, setError] = useState<ApiErrorPayload | null>(null);
  const [errorSourceTab, setErrorSourceTab] = useState<ActiveTab | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const lastActionRef = useRef<(() => void) | null>(null);

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Countdown tick for rate_limited responses
  useEffect(() => {
    if (retryCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setRetryCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryCountdown]);

  const buildHeaders = useCallback(
    (includeJson = false): Record<string, string> => {
      const headers: Record<string, string> = {};
      if (includeJson) {
        headers['Content-Type'] = 'application/json';
      }
      const trimmedCode = classCode.trim();
      if (trimmedCode) {
        headers['x-class-code'] = trimmedCode;
      }
      return headers;
    },
    [classCode]
  );

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/health', {
        headers: buildHeaders(false),
      });
      if (!res.ok) {
        setHealthError(true);
        return;
      }
      const data = (await res.json()) as HealthStatus;
      setHealth(data);
      setHealthError(false);
    } catch {
      setHealthError(true);
    } finally {
      setHealthLoading(false);
    }
  }, [buildHeaders]);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  const handleApiFailure = useCallback(
    (status: number, body: unknown, tab: ActiveTab) => {
      const parsed =
        body && typeof body === 'object' ? (body as Partial<ApiErrorPayload>) : {};

      const payload: ApiErrorPayload = {
        error: typeof parsed.error === 'string' ? parsed.error : `http_${status}`,
        message:
          typeof parsed.message === 'string'
            ? parsed.message
            : `Server responded with status ${status}.`,
        upstreamStatus: parsed.upstreamStatus ?? null,
        retryAfter: typeof parsed.retryAfter === 'number' ? parsed.retryAfter : null,
      };

      setError(payload);
      setErrorSourceTab(tab);

      if (payload.error === 'rate_limited') {
        const seconds =
          payload.retryAfter && payload.retryAfter > 0
            ? Math.ceil(payload.retryAfter)
            : 30;
        setRetryCountdown(seconds);
      }

      if (payload.error === 'missing_or_invalid_class_code') {
        setHighlightClassCode(true);
      }
    },
    []
  );

  const handleGeneratePlan = useCallback(async () => {
    if (planLoading || retryCountdown > 0) return;

    lastActionRef.current = () => {
      void handleGeneratePlan();
    };

    setPlanLoading(true);
    setError(null);
    setHighlightClassCode(false);

    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          situation,
          country: 'in',
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        handleApiFailure(res.status, body, 'plan');
        return;
      }

      const data = body as PlanResponse;
      setPlan(data);
      if (data.news?.credits) {
        setHealth(data.news.credits);
      }
      setPlanHood({
        endpoint: 'POST /api/plan',
        requestPreview: data.news?.requestPreview ?? 'POST /api/plan',
        cached: Boolean(data.news?.cached),
        fetchedAt: data.news?.fetchedAt ?? new Date().toISOString(),
        rawJson: data,
      });
    } catch {
      setError({
        error: 'network_error',
        message: 'Could not reach the backend server. Check that the server is running and try again.',
      });
      setErrorSourceTab('plan');
    } finally {
      setPlanLoading(false);
      void fetchHealth();
    }
  }, [buildHeaders, fetchHealth, handleApiFailure, planLoading, retryCountdown, situation]);

  const handleRawSearch = useCallback(async () => {
    if (rawLoading || retryCountdown > 0) return;

    lastActionRef.current = () => {
      void handleRawSearch();
    };

    setRawLoading(true);
    setError(null);
    setHighlightClassCode(false);

    try {
      const search = new URLSearchParams();
      if (rawParams.q.trim()) search.set('q', rawParams.q.trim());
      if (rawParams.country.trim()) search.set('country', rawParams.country.trim());
      if (rawParams.language.trim()) search.set('language', rawParams.language.trim());
      if (rawParams.category && rawParams.category !== 'any') {
        search.set('category', rawParams.category);
      }

      const endpoint = `/api/news?${search.toString()}`;
      const res = await fetch(endpoint, {
        headers: buildHeaders(false),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        handleApiFailure(res.status, body, 'raw');
        return;
      }

      const data = body as NewsResponse;
      setNews(data);
      if (data.credits) {
        setHealth(data.credits);
      }
      setNewsHood({
        endpoint: `GET ${endpoint}`,
        requestPreview: data.requestPreview ?? endpoint,
        cached: Boolean(data.cached),
        fetchedAt: data.fetchedAt ?? new Date().toISOString(),
        rawJson: data,
      });
    } catch {
      setError({
        error: 'network_error',
        message: 'Could not reach the backend server. Check that the server is running and try again.',
      });
      setErrorSourceTab('raw');
    } finally {
      setRawLoading(false);
      void fetchHealth();
    }
  }, [buildHeaders, fetchHealth, handleApiFailure, rawLoading, rawParams, retryCountdown]);

  const handleFocusClassCode = () => {
    setHighlightClassCode(true);
    classCodeInputRef.current?.focus();
    classCodeInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const planInlineError =
    error?.error === 'bad_request' && errorSourceTab === 'plan'
      ? error.message
      : null;

  const rawInlineError =
    error?.error === 'bad_request' && errorSourceTab === 'raw'
      ? error.message
      : null;

  const activeUnderTheHood = activeTab === 'plan' ? planHood : newsHood;
  const actionsDisabled = retryCountdown > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              Kerala Flood Desk
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 whitespace-nowrap">
                Non-commercial demo
              </span>
              <span className="rounded-md border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 whitespace-nowrap">
                Data ~12h delayed
              </span>
              <span className="rounded-md border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 whitespace-nowrap">
                Headlines only, no full text
              </span>
            </div>
          </div>

          <div className="flex items-center self-start md:self-center">
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {darkMode ? (
                <>
                  <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  <span>Light mode</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <span>Dark mode</span>
                </>
              )}
            </button>
          </div>
        </header>

        <main className="space-y-6">
          {/* Status bar + Class code */}
          <StatusBar
            health={health}
            healthLoading={healthLoading}
            healthError={healthError}
            classCode={classCode}
            onClassCodeChange={(val) => {
              setClassCode(val);
              if (highlightClassCode) setHighlightClassCode(false);
            }}
            highlightClassCode={highlightClassCode}
            classCodeInputRef={classCodeInputRef}
            onRefreshHealth={() => void fetchHealth()}
          />

          {/* Friendly Error Banners */}
          <ErrorBanner
            error={error}
            retryCountdown={retryCountdown}
            onFocusClassCode={handleFocusClassCode}
            onRetry={lastActionRef.current ?? undefined}
            onDismiss={() => setError(null)}
          />

          {/* Navigation Tabs */}
          <div className="flex items-center border-b border-slate-200 dark:border-slate-800">
            <div className="flex gap-1" role="tablist" aria-label="Kerala Flood Desk modes">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'plan'}
                onClick={() => setActiveTab('plan')}
                className={`min-h-[44px] border-b-2 px-4 py-2.5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-600 whitespace-nowrap shrink-0 ${
                  activeTab === 'plan'
                    ? 'border-sky-700 text-sky-800 dark:border-sky-400 dark:text-sky-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Plan supply runs
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'raw'}
                onClick={() => setActiveTab('raw')}
                className={`min-h-[44px] border-b-2 px-4 py-2.5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-600 whitespace-nowrap shrink-0 ${
                  activeTab === 'raw'
                    ? 'border-sky-700 text-sky-800 dark:border-sky-400 dark:text-sky-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Raw search
              </button>
            </div>
          </div>

          {/* Active Tab Content */}
          {activeTab === 'plan' ? (
            <PlanSupplyRunsTab
              situation={situation}
              onSituationChange={(value) => {
                setSituation(value);
                if (planInlineError) setError(null);
              }}
              onGenerate={() => void handleGeneratePlan()}
              loading={planLoading}
              disabled={actionsDisabled}
              inlineError={planInlineError}
              plan={plan}
            />
          ) : (
            <RawSearchTab
              params={rawParams}
              onParamsChange={(next) => {
                setRawParams(next);
                if (rawInlineError) setError(null);
              }}
              onSearch={() => void handleRawSearch()}
              loading={rawLoading}
              disabled={actionsDisabled}
              inlineError={rawInlineError}
              news={news}
            />
          )}

          {/* Under the hood collapsible panel (shown on both tabs) */}
          <UnderTheHoodPanel data={activeUnderTheHood} />
        </main>
      </div>
    </div>
  );
}
