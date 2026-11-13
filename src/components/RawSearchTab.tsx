import React from 'react';
import { ExternalLink, Loader2, Search } from 'lucide-react';
import type { NewsResponse } from '../types';
import { formatLanguageCode, formatRelativeTime, isSafeHttpUrl } from '../utils/time';

export interface RawSearchParams {
  q: string;
  country: string;
  language: string;
  category: string;
}

interface RawSearchTabProps {
  params: RawSearchParams;
  onParamsChange: (next: RawSearchParams) => void;
  onSearch: () => void;
  loading: boolean;
  disabled: boolean;
  inlineError: string | null;
  news: NewsResponse | null;
}

const CATEGORIES = [
  { value: 'any', label: 'Any category' },
  { value: 'top', label: 'top' },
  { value: 'environment', label: 'environment' },
  { value: 'politics', label: 'politics' },
  { value: 'business', label: 'business' },
  { value: 'health', label: 'health' },
  { value: 'world', label: 'world' },
];

export function RawSearchTab({
  params,
  onParamsChange,
  onSearch,
  loading,
  disabled,
  inlineError,
  news,
}: RawSearchTabProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disabled && !loading) {
      onSearch();
    }
  };

  const qLength = params.q.length;
  const qNearLimit = qLength >= 90;

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* q input (100 char limit) */}
          <div className="md:col-span-6">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label
                htmlFor="raw-q-input"
                className="text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                Query (<span className="font-mono">q</span>)
              </label>
              <span
                className={`font-mono text-xs font-semibold tabular-nums ${
                  qNearLimit
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {qLength} / 100
              </span>
            </div>
            <input
              id="raw-q-input"
              type="text"
              maxLength={100}
              value={params.q}
              onChange={(e) =>
                onParamsChange({ ...params, q: e.target.value.slice(0, 100) })
              }
              aria-invalid={Boolean(inlineError)}
              aria-describedby={inlineError ? 'raw-q-error' : undefined}
              placeholder="e.g. Kerala flood OR landslide"
              className={`h-11 w-full rounded-lg border px-3.5 text-base transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 ${
                inlineError
                  ? 'border-red-500 bg-red-50/40 text-slate-900 dark:border-red-500 dark:bg-red-950/20 dark:text-slate-100'
                  : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
              }`}
            />
            {inlineError && (
              <p id="raw-q-error" className="mt-1.5 text-sm font-medium text-red-700 dark:text-red-400">
                {inlineError}
              </p>
            )}
          </div>

          {/* country */}
          <div className="md:col-span-2">
            <label
              htmlFor="raw-country-input"
              className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              Country
            </label>
            <input
              id="raw-country-input"
              type="text"
              value={params.country}
              onChange={(e) => onParamsChange({ ...params, country: e.target.value })}
              placeholder="in"
              className="h-11 w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 font-mono text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          {/* language */}
          <div className="md:col-span-2">
            <label
              htmlFor="raw-language-input"
              className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              Language
            </label>
            <input
              id="raw-language-input"
              type="text"
              value={params.language}
              onChange={(e) => onParamsChange({ ...params, language: e.target.value })}
              placeholder="en"
              className="h-11 w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 font-mono text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          {/* category */}
          <div className="md:col-span-2">
            <label
              htmlFor="raw-category-select"
              className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              Category
            </label>
            <select
              id="raw-category-select"
              value={params.category}
              onChange={(e) => onParamsChange({ ...params, category: e.target.value })}
              className="h-11 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Calls <span className="font-mono">GET /api/news</span> directly through the classroom server proxy.
          </p>
          <button
            type="submit"
            disabled={disabled || loading}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 py-2.5 text-base font-semibold text-white transition-colors hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" aria-hidden="true" />
                Search
              </>
            )}
          </button>
        </div>
      </form>

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading articles">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="h-5 w-4/5 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="mt-2.5 h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="mt-4 space-y-2">
                <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-11/12 rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && news && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
              Headlines ({news.articles.length} returned)
            </h2>
          </div>

          {news.articles.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-base text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              No headlines matched those query parameters. Try broadening your <span className="font-mono">q</span> filter or setting category to <span className="font-mono">any</span>.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {news.articles.map((article, idx) => {
                const langCode = formatLanguageCode(article.language);
                return (
                <article
                  key={`${article.id}-${idx}`}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
                        {isSafeHttpUrl(article.link) ? (
                          <a
                            href={article.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-start gap-1.5 hover:text-sky-700 dark:hover:text-sky-300"
                          >
                            <span>{article.title}</span>
                            <ExternalLink
                              className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-sky-700 dark:group-hover:text-sky-300"
                              aria-hidden="true"
                            />
                          </a>
                        ) : (
                          article.title
                        )}
                      </h3>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-xs font-semibold shrink-0 ${
                          langCode === 'ML'
                            ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200'
                            : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {langCode}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <span>
                        Source:{' '}
                        {isSafeHttpUrl(article.sourceUrl) ? (
                          <a
                            href={article.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sky-700 underline decoration-sky-700/40 underline-offset-2 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-200"
                          >
                            {article.sourceName}
                          </a>
                        ) : (
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {article.sourceName}
                          </span>
                        )}
                      </span>
                      <span aria-hidden="true">·</span>
                      <time
                        dateTime={article.pubDate ?? undefined}
                        title={article.pubDate ?? undefined}
                        className="tabular-nums"
                      >
                        {formatRelativeTime(article.pubDate)}
                      </time>
                    </div>

                    <p className="mt-3 text-base leading-relaxed text-slate-700 dark:text-slate-300">
                      {article.description || 'No headline summary snippet provided by the source.'}
                    </p>
                  </div>

                  {isSafeHttpUrl(article.link) && (
                    <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-200"
                      >
                        Read at {article.sourceName}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  )}
                </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Initial Empty State */}
      {!loading && !news && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-base font-medium text-slate-700 dark:text-slate-300">
            Enter a query above and click &ldquo;Search&rdquo; to inspect raw headline results from <span className="font-mono">/api/news</span>.
          </p>
        </div>
      )}
    </div>
  );
}
