import { ChevronDown, Gauge, User } from 'lucide-react';
import { sortCursorMeters } from '../lib/cursor.js';
import { formatPercent, formatRelative, LEVEL_STYLES, remainingLevel, usageBand } from '../lib/format.js';
import CursorMeters from './CursorMeters.jsx';
import { ResetRow } from './ResetInfo.jsx';
import UsageBar from './UsageBar.jsx';

// Dashboard header: the identity block doubles as the collapse toggle.
// Collapsed cards drop the plan badge so only the email remains.
function AccountToggle({ account, expanded, onToggle, compact = false }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full min-w-0 items-center gap-3 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 ${compact ? 'h-9 w-9' : 'h-11 w-11'}`}
        aria-hidden="true"
      >
        <User size={compact ? 16 : 20} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-slate-900" title={account.email ?? undefined}>
          {account.email ?? 'Unnamed account'}
        </h3>
        {!compact && (
          <span className="mt-1 inline-flex max-w-full truncate rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
            {account.plan ?? 'Unknown plan'}
          </span>
        )}
      </div>
      <ChevronDown
        size={18}
        aria-hidden="true"
        className={`shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
      />
    </button>
  );
}

// Right 70%: one block per usage meter (weekly, 5-hour, …).
function UsageMeter({ meter, now, providerId, showReset = true }) {
  return (
    <section className="space-y-2.5 py-4 first:pt-0 last:pb-0" aria-label={meter.label}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-slate-900">{meter.label}</h4>
          <p className="text-xs text-slate-500">{meter.period ? `${meter.period} quota` : 'Usage limit period not specified'}</p>
        </div>
        {meter.period && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
            {meter.period}
          </span>
        )}
      </div>
      <UsageBar usedPercent={meter.usedPercent} remainingPercent={meter.remainingPercent} label={meter.label} />
      {showReset && <ResetRow resetAt={meter.resetAt} now={now} providerId={providerId} period={meter.period} />}
    </section>
  );
}

// Collapsed view: one thin bar per limit, labelled with its limit type and %.
function MiniMeter({ meter }) {
  const used =
    typeof meter.usedPercent === 'number'
      ? meter.usedPercent
      : typeof meter.remainingPercent === 'number'
        ? 100 - meter.remainingPercent
        : null;
  const known = used !== null;
  const name = meter.label ?? meter.period ?? 'Usage';

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-slate-600">{name}</span>
        <span className={`shrink-0 font-semibold ${known ? usageBand(used).text : 'text-slate-500'}`}>
          {known ? formatPercent(used) : 'N/A'}
        </span>
      </div>
      <UsageBar usedPercent={meter.usedPercent} remainingPercent={meter.remainingPercent} label={name} compact />
    </div>
  );
}

function CollapsedAccountCard({ account, meters, onToggle }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:shadow-md sm:px-5">
      <AccountToggle account={account} expanded={false} onToggle={onToggle} compact />
      {meters.length > 0 && (
        <div className="mt-3 space-y-2.5 pl-12">
          {meters.map((meter) => (
            <MiniMeter key={meter.id} meter={meter} />
          ))}
        </div>
      )}
    </article>
  );
}

const lowestRemaining = (meters) =>
  meters.reduce((low, meter) => (typeof meter.remainingPercent === 'number' && (low === null || meter.remainingPercent < low) ? meter.remainingPercent : low), null);

const nextResetMeter = (meters, now) => {
  const withReset = meters.filter((meter) => typeof meter.resetAt === 'number' && meter.resetAt > 0);
  if (withReset.length === 0) return meters[0] ?? null;
  const upcoming = withReset.filter((meter) => meter.resetAt > now);
  const pool = upcoming.length > 0 ? upcoming : withReset;
  return pool.reduce((soonest, meter) => (meter.resetAt < soonest.resetAt ? meter : soonest));
};

// Left 30%: who the account belongs to.
function AccountInfo({ account }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500" aria-hidden="true">
        <User size={20} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-900" title={account.email ?? undefined}>
          {account.email ?? 'Unnamed account'}
        </h3>
        <span className="mt-1 inline-flex max-w-full truncate rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
          {account.plan ?? 'Unknown plan'}
        </span>
      </div>
    </div>
  );
}

// Reusable account card. Splits 30/70 when the card is wide enough
// (container query), and stacks the two sections otherwise. The left
// column stretches so its divider matches the usage column height.
// Dashboard cards move "Updated" into the identity column and replace
// the status footer with a Next Reset row. Dashboard cards can also be
// collapsed to a compact view (email, limit names, progress bars) by
// clicking their header. Collapse state is controlled by the parent
// (`collapsed` + `onToggle`) so the provider header can collapse all cards.
export default function AccountCard({ account, now, variant = 'detail', collapsed: collapsedProp = false, onToggle }) {
  const isDashboard = variant === 'dashboard';
  const collapsed = isDashboard && collapsedProp;
  const open = !collapsed;
  const toggle = onToggle ?? (() => {});

  const lowest = lowestRemaining(account.meters);
  const level = remainingLevel(lowest);
  const isCursor = account.providerId === 'cursor';
  const resetMeter = nextResetMeter(account.meters, now);
  const updatedLabel = account.lastUpdated
    ? `Updated ${formatRelative(Math.min(account.lastUpdated, now), now)}`
    : 'Last update unknown';

  if (collapsed) {
    const meters = isCursor ? sortCursorMeters(account.meters) : account.meters;
    return <CollapsedAccountCard account={account} meters={meters} onToggle={toggle} />;
  }

  return (
    <article className="@container overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="grid grid-cols-1 @md:grid-cols-[minmax(22rem,3fr)_minmax(0,7fr)] @md:items-stretch">
        <div className={`flex flex-col border-b border-slate-100 p-4 sm:p-5 @md:border-b-0 @md:border-r @md:border-slate-200 ${isDashboard ? '' : 'items-center justify-center'}`}>
          <div className={isDashboard ? 'flex flex-1 items-center' : undefined}>
            {isDashboard ? <AccountToggle account={account} expanded={open} onToggle={toggle} /> : <AccountInfo account={account} />}
          </div>
          {isDashboard && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {updatedLabel}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col p-4 sm:p-5">
          <div className="min-w-0 flex-1 divide-y divide-slate-100">
            {account.meters.length > 0 ? (
              isCursor ? (
                <div className="py-0">
                  <CursorMeters meters={account.meters} now={now} variant="compact" showReset={!isDashboard} />
                </div>
              ) : (
                account.meters.map((meter) => (
                  <UsageMeter
                    key={meter.id}
                    meter={meter}
                    now={now}
                    providerId={account.providerId}
                    showReset={!isDashboard}
                  />
                ))
              )
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                <Gauge size={16} aria-hidden="true" />
                No usage data reported for this account yet.
              </div>
            )}
          </div>

          {isDashboard ? (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <ResetRow
                resetAt={resetMeter?.resetAt}
                now={now}
                providerId={account.providerId}
                period={resetMeter?.period}
              />
            </div>
          ) : (
            <footer className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span>{updatedLabel}</span>
              {lowest !== null && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${LEVEL_STYLES[level].badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_STYLES[level].dot}`} aria-hidden="true" />
                  {level === 'critical' ? 'Low' : level === 'warning' ? 'Moderate' : 'Available'}
                </span>
              )}
            </footer>
          )}
        </div>
      </div>
    </article>
  );
}
