import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Code2, Copy } from 'lucide-react';
import type { UnderTheHoodData } from '../types';

interface UnderTheHoodPanelProps {
  data: UnderTheHoodData | null;
}

export function UnderTheHoodPanel({ data }: UnderTheHoodPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const formattedJson = data ? JSON.stringify(data.rawJson, null, 2) : '';

  const handleCopy = async () => {
    if (!formattedJson) return;
    try {
      await navigator.clipboard.writeText(formattedJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable in restricted context; ignore quietly
    }
  };

  return (
    <section
      aria-label="Under the hood inspector"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-600 dark:hover:bg-slate-800/50 rounded-xl"
      >
        <div className="flex items-center gap-2.5">
          {isOpen ? (
            <ChevronDown className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          )}
          <Code2 className="h-5 w-5 text-sky-700 dark:text-sky-400" aria-hidden="true" />
          <span className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Under the hood
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            API request preview, cache status &amp; raw JSON
          </span>
        </div>

        {data && (
          <div className="hidden items-center gap-3 text-xs font-mono text-slate-600 dark:text-slate-300 sm:flex">
            <span>{data.cached ? 'Cached' : 'Live fetch'}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{new Date(data.fetchedAt).toLocaleTimeString()}</span>
          </div>
        )}
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          {!data ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Run &ldquo;Generate plan&rdquo; or &ldquo;Search&rdquo; to inspect the redacted server request, cache metadata, and raw JSON response.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Request preview (API key redacted)
                  </div>
                  <div className="mt-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                    {data.requestPreview || data.endpoint}
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Response cached</span>
                    <span
                      className={`font-semibold ${
                        data.cached
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-sky-700 dark:text-sky-400'
                      }`}
                    >
                      {data.cached ? 'Yes (cached)' : 'No (fresh)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">fetchedAt</span>
                    <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200 truncate">
                      {data.fetchedAt}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Raw JSON response ({data.endpoint})
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        Copy JSON
                      </>
                    )}
                  </button>
                </div>
                <pre className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 dark:border-slate-800">
                  <code>{formattedJson}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
