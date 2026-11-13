import React from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import type { HealthStatus } from '../types';

interface StatusBarProps {
  health: HealthStatus | null;
  healthLoading: boolean;
  healthError: boolean;
  classCode: string;
  onClassCodeChange: (value: string) => void;
  highlightClassCode: boolean;
  classCodeInputRef: React.RefObject<HTMLInputElement | null>;
  onRefreshHealth: () => void;
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const safeLimit = limit > 0 ? limit : 1;
  const ratio = used / safeLimit;
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  const isWarning = ratio > 0.8;

  return (
    <div className="min-w-[175px] flex-1 sm:flex-initial">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {label}:
        </span>
        <span
          className={`font-mono font-semibold tabular-nums whitespace-nowrap ${
            isWarning
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {used} / {limit}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <div
          className={`h-full rounded-full transition-all duration-200 ${
            isWarning
              ? 'bg-amber-500 dark:bg-amber-400'
              : 'bg-sky-600 dark:bg-sky-400'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function StatusBar({
  health,
  healthLoading,
  healthError,
  classCode,
  onClassCodeChange,
  highlightClassCode,
  classCodeInputRef,
  onRefreshHealth,
}: StatusBarProps) {
  const hasKey = health?.newsdataKey ?? false;
  const todayUsed = health?.creditsUsedToday ?? 0;
  const todayLimit = health?.dailyLimit ?? 200;
  const min15Used = health?.creditsLast15Min ?? 0;
  const min15Limit = health?.windowLimit ?? 30;

  return (
    <section
      aria-label="Server status and classroom controls"
      className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900 sm:px-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Server key indicator + Credit meters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
          <div className="flex items-center gap-2.5">
            {healthLoading && !health ? (
              <span className="inline-block h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-700" />
            ) : healthError && !health ? (
              <span
                className="inline-block h-3 w-3 rounded-full bg-red-600 dark:bg-red-500"
                aria-hidden="true"
              />
            ) : (
              <span
                className={`inline-block h-3 w-3 rounded-full ${
                  hasKey
                    ? 'bg-emerald-600 dark:bg-emerald-400'
                    : 'bg-red-600 dark:bg-red-500'
                }`}
                aria-hidden="true"
              />
            )}
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
              {healthLoading && !health
                ? 'Checking server...'
                : healthError && !health
                  ? 'Server unreachable'
                  : hasKey
                    ? 'Server key ready'
                    : 'Server key missing'}
            </span>
            <button
              type="button"
              onClick={onRefreshHealth}
              disabled={healthLoading}
              title="Refresh server health"
              aria-label="Refresh server health"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <RefreshCw className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="hidden h-7 w-px bg-slate-200 dark:bg-slate-800 sm:block" aria-hidden="true" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Meter label="Today" used={todayUsed} limit={todayLimit} />
            <Meter label="Last 15 min" used={min15Used} limit={min15Limit} />
          </div>
        </div>

        {/* Right: Optional Class code (React state only) */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <label
            htmlFor="class-code-input"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
          >
            <KeyRound className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>Class code</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              (optional)
            </span>
          </label>
          <input
            ref={classCodeInputRef}
            id="class-code-input"
            type="text"
            value={classCode}
            onChange={(e) => onClassCodeChange(e.target.value)}
            placeholder="Enter if required"
            autoComplete="off"
            spellCheck={false}
            className={`h-10 w-full rounded-lg border px-3 font-mono text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 sm:w-44 ${
              highlightClassCode
                ? 'border-amber-500 bg-amber-50 text-slate-900 ring-2 ring-amber-500/30 dark:border-amber-400 dark:bg-amber-950/30 dark:text-slate-100'
                : 'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500'
            }`}
          />
        </div>
      </div>
    </section>
  );
}
