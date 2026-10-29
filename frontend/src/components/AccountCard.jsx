import { CalendarClock, Gauge, Mail } from 'lucide-react';
import { formatPercent, formatRelative, LEVEL_STYLES, remainingLevel } from '../lib/format.js';
import CursorMeters from './CursorMeters.jsx';
import ResetInfo from './ResetInfo.jsx';
import UsageBar from './UsageBar.jsx';

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-slate-800">{children}</dd>
    </div>
  );
}

function MeterSection({ meter, now, providerId }) {
  const level = remainingLevel(meter.remainingPercent);

  return (
    <section className="space-y-4 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0" aria-label={meter.label}>
      {meter.period === null && <h4 className="text-sm font-semibold text-slate-700">{meter.label}</h4>}
      <dl className="grid grid-cols-3 gap-3">
        <Detail label="Usage type">{meter.period ?? 'Not specified'}</Detail>
        <Detail label="Usage">{formatPercent(meter.usedPercent)}</Detail>
        <Detail label="Remaining">
          <span className={LEVEL_STYLES[level].text}>{formatPercent(meter.remainingPercent)}</span>
        </Detail>
      </dl>
      <UsageBar usedPercent={meter.usedPercent} remainingPercent={meter.remainingPercent} label={meter.label} />
      <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <CalendarClock size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Reset</div>
          <ResetInfo resetAt={meter.resetAt} now={now} providerId={providerId} period={meter.period} />
        </div>
      </div>
    </section>
  );
}

const lowestRemaining = (meters) =>
  meters.reduce((low, meter) => (typeof meter.remainingPercent === 'number' && (low === null || meter.remainingPercent < low) ? meter.remainingPercent : low), null);

export default function AccountCard({ account, index, now }) {
  const lowest = lowestRemaining(account.meters);
  const level = remainingLevel(lowest);

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-hidden="true">
            <Mail size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-400">Account {index + 1}</p>
            <h3 className="truncate text-base font-semibold text-slate-900" title={account.email ?? undefined}>
              {account.email ?? 'Unnamed account'}
            </h3>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
          {account.plan ?? 'Unknown plan'}
        </span>
      </header>

      <div className="flex-1 space-y-4">
        {account.meters.length > 0 ? (
          account.providerId === 'cursor' ? (
            <CursorMeters meters={account.meters} now={now} />
          ) : (
            account.meters.map((meter) => (
              <MeterSection key={meter.id} meter={meter} now={now} providerId={account.providerId} />
            ))
          )
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
            <Gauge size={16} aria-hidden="true" />
            No usage data reported for this account yet.
          </div>
        )}
      </div>

      <footer className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>{account.lastUpdated ? `Updated ${formatRelative(Math.min(account.lastUpdated, now), now)}` : 'Last update unknown'}</span>
        {lowest !== null && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${LEVEL_STYLES[level].badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_STYLES[level].dot}`} aria-hidden="true" />
            {level === 'critical' ? 'Low' : level === 'warning' ? 'Moderate' : 'Available'}
          </span>
        )}
      </footer>
    </article>
  );
}
