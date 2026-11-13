import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Loader2,
  MapPin,
  Newspaper,
  Send,
} from 'lucide-react';
import type { DistrictPriority, NewsArticle, PlanResponse } from '../types';
import { formatLanguageCode, formatRelativeTime, isSafeHttpUrl } from '../utils/time';
import { KeralaSchematicMap } from './KeralaSchematicMap';

export type ScenarioPresetId = 'floods' | 'landslides' | 'custom';

interface PlanSupplyRunsTabProps {
  situation: string;
  onSituationChange: (value: string) => void;
  region: string;
  onRegionChange: (value: string) => void;
  onGenerate: () => void;
  loading: boolean;
  disabled: boolean;
  inlineError: string | null;
  plan: PlanResponse | null;
}

const SCENARIO_PRESETS: Array<{ id: ScenarioPresetId; label: string }> = [
  { id: 'floods', label: 'Monsoon floods & road closures' },
  { id: 'landslides', label: 'Landslide risk in hill districts (Idukki, Wayanad)' },
  { id: 'custom', label: 'Custom' },
];

export function buildPresetText(preset: ScenarioPresetId, region: string): string {
  const cleanRegion = region.trim() || 'Kerala';
  if (preset === 'floods') {
    return `Heavy monsoon rain in ${cleanRegion} this week; we need to know which districts have flooding, landslides or closed roads.`;
  }
  if (preset === 'landslides') {
    return `Assess landslide risk, red rain alerts, and hill highway closures across ${cleanRegion}, especially hill districts like Idukki and Wayanad, this week.`;
  }
  return '';
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
  region,
  onRegionChange,
  onGenerate,
  loading,
  disabled,
  inlineError,
  plan,
}: PlanSupplyRunsTabProps) {
  const [selectedPreset, setSelectedPreset] = useState<ScenarioPresetId>('floods');
  const [gridExpanded, setGridExpanded] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);

  // Reset expansion and district filter whenever a new plan arrives
  useEffect(() => {
    setGridExpanded(false);
    setSelectedDistrict(null);
  }, [plan]);

  const handleSelectPreset = (presetId: ScenarioPresetId) => {
    setSelectedPreset(presetId);
    if (presetId !== 'custom') {
      onSituationChange(buildPresetText(presetId, region));
    }
  };

  const handleRegionUpdate = (nextRegion: string) => {
    onRegionChange(nextRegion);
    if (selectedPreset !== 'custom') {
      onSituationChange(buildPresetText(selectedPreset, nextRegion));
    }
  };

  const handleTextareaChange = (nextValue: string) => {
    onSituationChange(nextValue);
    if (selectedPreset !== 'custom') {
      setSelectedPreset('custom');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disabled && !loading) {
      onGenerate();
    }
  };

  const districts = plan?.plan?.districts ?? [];
  const caveats = plan?.plan?.caveats ?? [];
  const articles = plan?.news?.articles ?? [];
  const attempts = plan?.attempts ?? [];
  const timings = plan?.timings;
  const planRegion = plan?.region?.trim() || 'Kerala';
  const isKeralaPlan = planRegion.toLowerCase() === 'kerala';

  const articlesById = new Map<string, NewsArticle>(
    articles.map((article) => [article.id, article])
  );

  const allNoSignal =
    districts.length > 0 && districts.every((d) => d.priority === 'no signal');
  const showDistrictGrid = !allNoSignal || gridExpanded;

  const priorityCounts = plan
    ? {
        high: districts.filter((d) => d.priority === 'high').length,
        medium: districts.filter((d) => d.priority === 'medium').length,
        low: districts.filter((d) => d.priority === 'low').length,
        noSignal: districts.filter((d) => d.priority === 'no signal').length,
      }
    : null;

  const totalFetchedAcrossAttempts = attempts.reduce(
    (sum, a) => sum + a.articleCount,
    0
  );

  return (
    <div className="space-y-6">
      {/* Situation Input Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6"
      >
        <div className="space-y-4">
          {/* Scenario Picker + Region Field */}
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                Scenario preset
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Scenario presets">
                {SCENARIO_PRESETS.map((preset) => {
                  const active = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 ${
                        active
                          ? 'border-sky-700 bg-sky-700 text-white dark:border-sky-400 dark:bg-sky-500 dark:text-slate-950'
                          : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-full sm:w-64 lg:shrink-0">
              <label
                htmlFor="region-input"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                <MapPin className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <span>Region / Indian state</span>
              </label>
              <input
                id="region-input"
                type="text"
                maxLength={60}
                value={region}
                onChange={(e) => handleRegionUpdate(e.target.value)}
                placeholder="Kerala"
                className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-base text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline">
            <label
              htmlFor="situation-textarea"
              className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Field situation briefing
            </label>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Targets <span className="font-mono">country: &quot;in&quot;</span> · <span className="font-mono">language: &quot;en,ml&quot;</span>
            </span>
          </div>

          <textarea
            id="situation-textarea"
            rows={3}
            value={situation}
            onChange={(e) => handleTextareaChange(e.target.value)}
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
              Anchors the NewsData search to {region.trim() || 'Kerala'}, fetches English &amp; Malayalam headlines, and runs Gemini triage.
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
            {Array.from({ length: 6 }).map((_, index) => (
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
          {/* Pipeline Strip (Query chip + Attempts + Timings + Priority counts) */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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

            {/* Pipeline Steps & Attempts Strip */}
            <div className="border-t border-slate-100 pt-3.5 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  1. Gemini query
                  {timings ? (
                    <span className="ml-1.5 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      ({timings.queryMs}ms)
                    </span>
                  ) : null}
                </span>

                <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />

                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  2. NewsData ({articles.length} unique
                  {attempts.length > 1 ? ` from ${totalFetchedAcrossAttempts}` : ''}
                  {attempts.length > 0
                    ? `, ${attempts.every((a) => a.cached) ? 'cached' : attempts.some((a) => a.cached) ? 'mixed cache' : 'live'}`
                    : ''}
                  )
                  {timings ? (
                    <span className="ml-1.5 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      ({timings.newsMs}ms)
                    </span>
                  ) : null}
                </span>

                <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />

                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  3. Gemini triage
                  {timings ? (
                    <span className="ml-1.5 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      ({timings.triageMs}ms)
                    </span>
                  ) : null}
                </span>
              </div>

              {attempts.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {attempts.map((attempt, idx) => (
                    <div key={`${attempt.query}-${idx}`} className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Attempt {idx + 1}:
                      </span>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                        {attempt.query}
                      </code>
                      <span className="tabular-nums">
                        → {attempt.articleCount} article{attempt.articleCount === 1 ? '' : 's'} (
                        {attempt.cached ? 'cached' : 'live'})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* All No-Signal Collapsed Summary OR Map + District Grid */}
          {allNoSignal && !showDistrictGrid ? (
            <div className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900/70 dark:bg-emerald-950/30 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                    No flood signal in {planRegion} headlines right now — that&apos;s good news for the region, and a real result.
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    All {districts.length} districts returned &ldquo;no signal&rdquo; from the {articles.length} headline
                    {articles.length === 1 ? '' : 's'} inspected below.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setGridExpanded(true)}
                className="inline-flex min-h-[42px] items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 sm:self-center"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                Show district grid ({districts.length})
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {planRegion} District Supply Priority ({districts.length} Districts)
                </h2>
                <div className="flex items-center gap-2">
                  {selectedDistrict && (
                    <button
                      type="button"
                      onClick={() => setSelectedDistrict(null)}
                      className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
                    >
                      Filtered: {selectedDistrict} ×
                    </button>
                  )}
                  {allNoSignal && gridExpanded && (
                    <button
                      type="button"
                      onClick={() => setGridExpanded(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      Collapse grid
                    </button>
                  )}
                </div>
              </div>

              <div
                className={
                  isKeralaPlan
                    ? 'grid grid-cols-1 items-start gap-6 lg:grid-cols-[290px_1fr] xl:grid-cols-[310px_1fr]'
                    : 'block'
                }
              >
                {isKeralaPlan && (
                  <div className="lg:sticky lg:top-6">
                    <KeralaSchematicMap
                      districts={districts}
                      selectedDistrict={selectedDistrict}
                      onSelectDistrict={setSelectedDistrict}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {districts.map((item) => {
                    const style =
                      PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES['no signal'];
                    const supportingArticles = item.articleIds
                      .map((id) => articlesById.get(id))
                      .filter((a): a is NewsArticle => Boolean(a));
                    const isHighlighted =
                      selectedDistrict?.toLowerCase() === item.name.toLowerCase();
                    const isDimmed = Boolean(selectedDistrict) && !isHighlighted;

                    return (
                      <article
                        key={item.name}
                        className={`flex flex-col justify-between rounded-xl border p-5 transition-opacity ${
                          style.card
                        } ${
                          isHighlighted
                            ? 'ring-2 ring-sky-600 dark:ring-sky-400'
                            : isDimmed
                              ? 'opacity-55'
                              : ''
                        }`}
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
            </div>
          )}

          {/* Always Show Returned Articles: "What the news actually said" */}
          <section
            aria-label="What the news actually said"
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-sky-700 dark:text-sky-400" aria-hidden="true" />
                <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                  What the news actually said ({articles.length})
                </h2>
              </div>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Direct headlines returned by NewsData (EN &amp; ML)
              </span>
            </div>

            {articles.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-5 text-base text-slate-600 dark:border-slate-800 dark:text-slate-400">
                NewsData returned 0 headlines across all search attempts for this briefing.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {articles.map((article, idx) => {
                  const langCode = formatLanguageCode(article.language);
                  return (
                    <article
                      key={`${article.id}-${idx}`}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-base font-semibold leading-snug text-slate-900 dark:text-slate-100">
                            {isSafeHttpUrl(article.link) ? (
                              <a
                                href={article.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-start gap-1.5 hover:text-sky-700 dark:hover:text-sky-300"
                              >
                                <span>{article.title}</span>
                                <ExternalLink
                                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-sky-700 dark:group-hover:text-sky-300"
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

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
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
                          <span aria-hidden="true">·</span>
                          <time
                            dateTime={article.pubDate ?? undefined}
                            title={article.pubDate ?? undefined}
                            className="tabular-nums"
                          >
                            {formatRelativeTime(article.pubDate)}
                          </time>
                        </div>

                        {article.description && (
                          <p className="mt-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                            {article.description}
                          </p>
                        )}
                      </div>

                      {isSafeHttpUrl(article.link) && (
                        <div className="mt-3 border-t border-slate-200/80 pt-2.5 dark:border-slate-800">
                          <a
                            href={article.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-200"
                          >
                            Open original at {article.sourceName}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

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
            Pick a scenario or edit the briefing above, then click &ldquo;Generate plan&rdquo; to see the query chain, schematic map, and news feed.
          </p>
        </div>
      )}
    </div>
  );
}
