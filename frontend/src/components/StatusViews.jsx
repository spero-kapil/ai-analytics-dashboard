import { Inbox, RefreshCw, ServerCrash, TriangleAlert } from 'lucide-react';

export function LoadingView() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading usage data…</span>
      <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white" aria-hidden="true" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex animate-pulse items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-slate-200" />
              <div className="h-4 flex-1 rounded bg-slate-200" />
            </div>
            <div className="h-3 animate-pulse rounded-full bg-slate-200" />
            <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorView({ message, onRetry, retrying }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-rose-200 bg-white px-6 py-14 text-center shadow-sm" role="alert">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <ServerCrash size={22} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-900">Unable to load usage data</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
      >
        <RefreshCw size={15} className={retrying ? 'animate-spin' : ''} aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}

export function ErrorBanner({ message }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>Showing the last loaded data. {message}</span>
    </div>
  );
}

export function EmptyView({ providerName }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Inbox size={22} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-900">No {providerName} accounts yet</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Accounts appear here once usage data for {providerName} is reported to the API.
      </p>
    </div>
  );
}
