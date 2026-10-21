import { formatPercent, LEVEL_STYLES, remainingLevel } from '../lib/format.js';

// Remaining usage fills from the left in a severity colour; consumed usage is
// the hatched remainder on the right.
export default function UsageBar({ usedPercent, remainingPercent, label }) {
  const known = typeof remainingPercent === 'number';
  const styles = LEVEL_STYLES[remainingLevel(remainingPercent)];

  return (
    <div>
      <div
        role="progressbar"
        aria-label={`${label}: remaining usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? remainingPercent : undefined}
        aria-valuetext={known ? `${formatPercent(remainingPercent)} remaining` : 'Usage unavailable'}
        className="usage-consumed flex h-3 w-full overflow-hidden rounded-full bg-slate-200"
      >
        {known && (
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${styles.bar}`}
            style={{ width: `${remainingPercent}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={`font-semibold ${styles.text}`}>
          {known ? `${formatPercent(remainingPercent)} remaining` : 'Usage data unavailable'}
        </span>
        {typeof usedPercent === 'number' && (
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="usage-consumed inline-block h-2.5 w-2.5 rounded-sm bg-slate-200" aria-hidden="true" />
            {formatPercent(usedPercent)} used
          </span>
        )}
      </div>
    </div>
  );
}
