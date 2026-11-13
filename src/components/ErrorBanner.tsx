import { AlertTriangle, Clock, KeyRound, RefreshCw, ShieldAlert } from 'lucide-react';
import type { ApiErrorPayload } from '../types';

interface ErrorBannerProps {
  error: ApiErrorPayload | null;
  retryCountdown: number;
  onFocusClassCode: () => void;
  onRetry?: () => void;
  onDismiss: () => void;
}

export function ErrorBanner({
  error,
  retryCountdown,
  onFocusClassCode,
  onRetry,
  onDismiss,
}: ErrorBannerProps) {
  if (!error) return null;

  // bad_request errors are rendered inline next to the corresponding input field
  if (error.error === 'bad_request') {
    return null;
  }

  if (error.error === 'missing_key' || error.error === 'invalid_key') {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-base font-semibold">
              Server NewsData key issue {error.upstreamStatus ? `(HTTP ${error.upstreamStatus})` : ''}
            </p>
            <p className="text-sm leading-relaxed text-red-900 dark:text-red-200">
              The server&apos;s NewsData key is missing or invalid. That&apos;s a 401 from the provider. The fix is on the server, not in your browser.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="self-start rounded-lg px-3 py-1.5 text-sm font-medium text-red-900 transition-colors hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/50 whitespace-nowrap shrink-0"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (error.error === 'missing_or_invalid_class_code') {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="text-base font-semibold">Class code required</p>
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Please enter a valid class code in the bar above to run requests against this classroom server.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onFocusClassCode}
          className="self-start rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 whitespace-nowrap shrink-0"
        >
          Enter class code
        </button>
      </div>
    );
  }

  if (error.error === 'rate_limited') {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="text-base font-semibold">
              Rate limit reached {error.upstreamStatus ? `(HTTP ${error.upstreamStatus})` : ''}
            </p>
            <p className="text-sm text-amber-900 dark:text-amber-200">
              {error.message || 'Too many requests in the current credit window.'}{' '}
              {retryCountdown > 0 ? (
                <span className="font-mono font-semibold tabular-nums">
                  Try again in {retryCountdown}s.
                </span>
              ) : (
                <span>You can retry your request now.</span>
              )}
            </p>
          </div>
        </div>
        {retryCountdown > 0 && (
          <div className="rounded-lg border border-amber-300 bg-white px-3.5 py-2 font-mono text-base font-semibold tabular-nums text-amber-900 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-300 whitespace-nowrap shrink-0">
            {retryCountdown}s
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="text-base font-semibold">Request could not be completed</p>
          <p className="text-sm text-red-900 dark:text-red-200">
            {error.message || 'An unexpected error occurred while contacting the server.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 dark:bg-red-500 dark:text-slate-950 dark:hover:bg-red-400 whitespace-nowrap"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-3 py-2 text-sm font-medium text-red-900 transition-colors hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/50 whitespace-nowrap"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
