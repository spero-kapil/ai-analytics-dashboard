import { CalendarClock } from 'lucide-react';
import { sortCursorMeters } from '../lib/cursor.js';
import { formatPercent, LEVEL_STYLES, remainingLevel } from '../lib/format.js';
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

function PeriodBadge({ period }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
      {period ?? 'Monthly'}
    </span>
  );
}

function CursorReset({ resetAt, now, label, period }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <CalendarClock size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
          {period && <PeriodBadge period={period} />}
        </div>
        <ResetInfo resetAt={resetAt} now={now} />
      </div>
    </div>
  );
}

function DetailMeter({ meter }) {
  const level = remainingLevel(meter.remainingPercent);
  const period = meter.period ?? 'Monthly';

  return (
    <section className="space-y-4 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0" aria-label={meter.label}>
      <h4 className="text-sm font-semibold text-slate-700">{meter.label}</h4>
      <dl className="grid grid-cols-3 gap-3">
        <Detail label="Usage type">{period}</Detail>
        <Detail label="Usage">{formatPercent(meter.usedPercent)}</Detail>
        <Detail label="Remaining">
          <span className={LEVEL_STYLES[level].text}>{formatPercent(meter.remainingPercent)}</span>
        </Detail>
      </dl>
      <UsageBar usedPercent={meter.usedPercent} remainingPercent={meter.remainingPercent} label={meter.label} />
    </section>
  );
}

function CompactMeter({ meter }) {
  const period = meter.period ?? 'Monthly';

  return (
    <section className="space-y-3 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0" aria-label={meter.label}>
      <div className="min-w-0">
        <h4 className="truncate text-sm font-semibold text-slate-800">{meter.label}</h4>
        <p className="text-xs text-slate-500">{period} quota</p>
      </div>
      <UsageBar usedPercent={meter.usedPercent} remainingPercent={meter.remainingPercent} label={meter.label} />
    </section>
  );
}

export default function CursorMeters({ meters, now, variant = 'detail' }) {
  const ordered = sortCursorMeters(meters);
  const resetAt = ordered.find((meter) => typeof meter.resetAt === 'number')?.resetAt ?? null;
  const period = ordered.find((meter) => meter.period)?.period ?? 'Monthly';
  const Meter = variant === 'compact' ? CompactMeter : DetailMeter;

  return (
    <div className="space-y-4">
      {ordered.map((meter) => (
        <Meter key={meter.id} meter={meter} />
      ))}
      <div className="border-t border-slate-100 pt-4">
        <CursorReset
          resetAt={resetAt}
          now={now}
          label={variant === 'compact' ? 'Next reset' : 'Reset'}
          period={variant === 'compact' ? period : null}
        />
      </div>
    </div>
  );
}
