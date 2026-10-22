import { formatPercent, usageBand } from '../lib/format.js';

// Consumed usage fills from the left in a colour set by how much is used;
// remaining usage is the grey track on the right.
export default function UsageBar({ usedPercent, remainingPercent, label }) {
  const used = typeof usedPercent === 'number' ? usedPercent : typeof remainingPercent === 'number' ? 100 - remainingPercent : null;
  const known = used !== null;
  const band = usageBand(used);

  return (
    <div>
      <div
        role="progressbar"
        aria-label={`${label}: used usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? used : undefined}
        aria-valuetext={known ? `${formatPercent(used)} used` : 'Usage unavailable'}
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200"
      >
        {known && (
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${used}%`, backgroundColor: band.hex }}
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={`font-semibold ${known ? band.text : 'text-slate-500'}`}>
          {known ? `${formatPercent(used)} used` : 'Usage data unavailable'}
        </span>
        {typeof remainingPercent === 'number' && (
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-200" aria-hidden="true" />
            {formatPercent(remainingPercent)} remaining
          </span>
        )}
      </div>
    </div>
  );
}
