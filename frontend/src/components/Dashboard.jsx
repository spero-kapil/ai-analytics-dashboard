import { CalendarClock, Gauge, Inbox } from 'lucide-react';
import CursorMeters from './CursorMeters.jsx';
import ProviderLogo from './ProviderLogo.jsx';
import ResetInfo from './ResetInfo.jsx';
import UsageBar from './UsageBar.jsx';

function PeriodBadge({ period }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
      {period ?? 'Unspecified'}
    </span>
  );
}

function UsageStructure({ meter, now, providerId }) {
  return (
    <section className="space-y-3 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0" aria-label={meter.label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-slate-800">{meter.label}</h4>
          <p className="text-xs text-slate-500">
            {meter.period ? `${meter.period} quota` : 'Usage limit period not specified'}
          </p>
        </div>
        {meter.period && <PeriodBadge period={meter.period} />}
      </div>
      <UsageBar usedPercent={meter.usedPercent} remainingPercent={meter.remainingPercent} label={meter.label} />
      <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <CalendarClock size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Next reset</div>
          <ResetInfo resetAt={meter.resetAt} now={now} providerId={providerId} period={meter.period} />
        </div>
      </div>
    </section>
  );
}

function AccountUsage({ account, now }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900" title={account.email ?? undefined}>
          {account.email ?? 'Unnamed account'}
        </h3>
        <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
          {account.plan ?? 'Unknown plan'}
        </span>
      </header>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">Usage details</p>
      <div className="space-y-4">
        {account.meters.length > 0 ? (
          account.providerId === 'cursor' ? (
            <CursorMeters meters={account.meters} now={now} variant="compact" />
          ) : (
            account.meters.map((meter) => (
              <UsageStructure key={meter.id} meter={meter} now={now} providerId={account.providerId} />
            ))
          )
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
            <Gauge size={16} aria-hidden="true" />
            No usage data reported for this account yet.
          </div>
        )}
      </div>
    </article>
  );
}

function ProviderSection({ provider, now, onSelectProvider }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={`${provider.name} usage`}>
      <header className="mb-4 flex items-center gap-3">
        <ProviderLogo provider={provider} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-slate-900">{provider.name}</h2>
          <p className="truncate text-xs text-slate-500">
            {provider.vendor ? `${provider.vendor} · ` : ''}
            {provider.accounts.length === 0
              ? 'No accounts'
              : `${provider.accounts.length} account${provider.accounts.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {onSelectProvider && provider.accounts.length > 0 && (
          <button
            type="button"
            onClick={() => onSelectProvider(provider.id)}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
          >
            View details
          </button>
        )}
      </header>

      {provider.accounts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
          No {provider.name} accounts reported yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {provider.accounts.map((account) => (
            <AccountUsage key={account.id} account={account} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Dashboard({ providers, now, onSelectProvider }) {
  const hasAccounts = providers.some((provider) => provider.accounts.length > 0);

  if (!hasAccounts) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Inbox size={22} aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-slate-900">No usage data yet</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Aggregated usage appears here once accounts report data to the API.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {providers
        .filter((provider) => provider.accounts.length > 0)
        .map((provider) => (
          <ProviderSection key={provider.id} provider={provider} now={now} onSelectProvider={onSelectProvider} />
        ))}
    </div>
  );
}
