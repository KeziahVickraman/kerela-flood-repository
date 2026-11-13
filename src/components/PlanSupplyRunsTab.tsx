import React from 'react';
import { ExternalLink, Info, Loader2, Send } from 'lucide-react';
import type { DistrictPriority, NewsArticle, PlanResponse } from '../types';
import { formatRelativeTime, isSafeHttpUrl } from '../utils/time';

interface PlanSupplyRunsTabProps {
  situation: string;
  onSituationChange: (value: string) => void;
  onGenerate: () => void;
  loading: boolean;
  disabled: boolean;
  inlineError: string | null;
  plan: PlanResponse | null;
}

const PRIORITY_STYLES: Record<
  DistrictPriority,
  {
    label: string;
    card: string;
    badge: string;
  }
> = {
  high: {
    label: 'High priority',
    card: 'border-red-300 bg-red-50/75 dark:border-red-900/80 dark:bg-red-950/35',
    badge: 'bg-red-700 text-white dark:bg-red-500 dark:text-slate-950',
  },
  medium: {
    label: 'Medium priority',
    card: 'border-amber-300 bg-amber-50/75 dark:border-amber-800/80 dark:bg-amber-950/35',
    badge: 'bg-amber-700 text-white dark:bg-amber-400 dark:text-slate-950',
  },
  low: {
    label: 'Low priority',
    card: 'border-emerald-300 bg-emerald-50/75 dark:border-emerald-900/80 dark:bg-emerald-950/35',
    badge: 'bg-emerald-700 text-white dark:bg-emerald-400 dark:text-slate-950',
  },
  'no signal': {
    label: 'No signal',
    card: 'border-slate-200 bg-slate-100/80 dark:border-slate-800 dark:bg-slate-900/60',
    badge: 'bg-slate-600 text-white dark:bg-slate-700 dark:text-slate-100',
  },
};

export function PlanSupplyRunsTab({
  situation,
  onSituationChange,
  onGenerate,
  loading,
  disabled,
  inlineError,
  plan,
}: PlanSupplyRunsTabProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disabled && !loading) {
      onGenerate();
    }
  };

  const districts = plan?.plan?.districts ?? [];
  const caveats = plan?.plan?.caveats ?? [];
  const articlesById = new Map<string, NewsArticle>(
    (plan?.news?.articles ?? []).map((article) => [article.id, article])
  );

  const priorityCounts = plan
    ? {
        high: districts.filter((d) => d.priority === 'high').length,
        medium: districts.filter((d) => d.priority === 'medium').length,
        low: districts.filter((d) => d.priority === 'low').length,
        noSignal: districts.filter((d) => d.priority === 'no signal').length,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Situation Input Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6"
      >
        <div className="space-y-3">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline">
            <label
              htmlFor="situation-textarea"
              className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Field situation briefing
            </label>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Targets India news headlines (<span className="font-mono">country: &quot;in&quot;</span>)
            </span>
          </div>

          <textarea
            id="situation-textarea"
            rows={3}
            value={situation}
            onChange={(e) => onSituationChange(e.target.value)}
            aria-invalid={Boolean(inlineError)}
            aria-describedby={inlineError ? 'situation-error' : undefined}
            className={`w-full rounded-lg border p-3.5 text-base leading-relaxed transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 ${
              inlineError
                ? 'border-red-500 bg-red-50/40 text-slate-900 dark:border-red-500 dark:bg-red-950/20 dark:text-slate-100'
                : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
            }`}
            placeholder="Describe the weather situation and logistics needs..."
          />

          {inlineError && (
            <p id="situation-error" className="text-sm font-medium text-red-700 dark:text-red-400">
              {inlineError}
            </p>
          )}

          <div className="flex flex-col items-start justify-between gap-3 pt-1 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Generates a compact NewsData query via Gemini, fetches recent headlines, and triages all 14 Kerala districts.
            </p>
            <button
              type="submit"
              disabled={disabled || loading}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 py-2.5 text-base font-semibold text-white transition-colors hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Generating plan...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Generate plan
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6" aria-busy="true" aria-label="Generating supply plan">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="h-5 w-44 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-7 w-72 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 14 }).map((_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between">
                  <div className="h-6 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-6 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-4 w-4/5 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results View */}
      {!loading && plan && (
        <div className="space-y-6">
          {/* Gemini Query Chip + Priority Summary */}
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Gemini search query:
              </span>
              <span className="inline-flex items-center gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 font-mono text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
                <span className="break-all">{plan.query}</span>
                <span className="rounded bg-sky-200/80 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-sky-900 dark:bg-sky-800 dark:text-sky-100 whitespace-nowrap">
                  {plan.query.length}/100
                </span>
              </span>
            </div>

            {priorityCounts && (
              <div className="flex flex-wrap items-center gap-4 text-sm font-medium tabular-nums">
                <span className="text-red-700 dark:text-red-400">
                  High: {priorityCounts.high}
                </span>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                <span className="text-amber-700 dark:text-amber-400">
                  Medium: {priorityCounts.medium}
                </span>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                <span className="text-emerald-700 dark:text-emerald-400">
                  Low: {priorityCounts.low}
                </span>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                <span className="text-slate-600 dark:text-slate-400">
                  No signal: {priorityCounts.noSignal}
                </span>
              </div>
            )}
          </div>

          {/* 14 Districts Grid */}
          <div>
            <h2 className="mb-3 font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              Kerala District Supply Priority (14 Districts)
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {districts.map((item) => {
                const style = PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES['no signal'];
                const supportingArticles = item.articleIds
                  .map((id) => articlesById.get(id))
                  .filter((a): a is NewsArticle => Boolean(a));

                return (
                  <article
                    key={item.name}
                    className={`flex flex-col justify-between rounded-xl border p-5 ${style.card}`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                          {item.name}
                        </h3>
                        <span
                          className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 ${style.badge}`}
                        >
                          {style.label}
                        </span>
                      </div>

                      <p className="mt-3 text-base leading-relaxed text-slate-800 dark:text-slate-200">
                        {item.reason}
                      </p>
                    </div>

                    <div className="mt-4 border-t border-slate-900/10 pt-3 dark:border-white/10">
                      {supportingArticles.length > 0 ? (
                        <ul className="space-y-2">
                          {supportingArticles.map((article) => (
                            <li key={article.id} className="text-sm">
                              {isSafeHttpUrl(article.link) ? (
                                <a
                                  href={article.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group inline-flex items-start gap-1.5 font-medium text-sky-800 underline decoration-sky-700/40 underline-offset-2 hover:text-sky-950 hover:decoration-sky-900 dark:text-sky-300 dark:decoration-sky-400/40 dark:hover:text-sky-100"
                                >
                                  <span>{article.title}</span>
                                  <ExternalLink
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-75 group-hover:opacity-100"
                                    aria-hidden="true"
                                  />
                                </a>
                              ) : (
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {article.title}
                                </span>
                              )}
                              <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                                <span>{article.sourceName}</span>
                                {article.pubDate && (
                                  <>
                                    <span className="mx-1.5" aria-hidden="true">·</span>
                                    <span>{formatRelativeTime(article.pubDate)}</span>
                                  </>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          No supporting headlines matched this district.
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* Caveats List */}
          {caveats.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Planning caveats &amp; data limits
                </h2>
              </div>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-slate-700 dark:text-slate-300">
                {caveats.map((caveat, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {caveat}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Initial Empty State */}
      {!loading && !plan && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-base font-medium text-slate-700 dark:text-slate-300">
            Click &ldquo;Generate plan&rdquo; above to turn the situation briefing into a NewsData search and a 14-district priority grid.
          </p>
        </div>
      )}
    </div>
  );
}
