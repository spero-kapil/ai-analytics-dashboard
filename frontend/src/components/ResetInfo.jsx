import { CalendarClock } from 'lucide-react';
import { formatDateTime, formatDuration } from '../lib/format.js';

const DEFAULT_UNAVAILABLE_RESET = 'Reset time not provided';
const CLAUDE_5H_UNAVAILABLE_RESET = 'Starts with your first message';

export default function ResetInfo({ resetAt, now, providerId, period }) {
  if (typeof resetAt !== 'number' || resetAt <= 0) {
    const message =
      providerId === 'claude' && period === '5-Hour'
        ? CLAUDE_5H_UNAVAILABLE_RESET
        : DEFAULT_UNAVAILABLE_RESET;
    return <span className="text-sm text-slate-500">{message}</span>;
  }
  const passed = resetAt <= now;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className="font-medium text-slate-700">{formatDateTime(resetAt)}</span>
      <span className={passed ? 'text-amber-600' : 'text-slate-500'}>
        {passed ? 'Reset passed, awaiting new data' : `In ${formatDuration(resetAt - now)}`}
      </span>
    </span>
  );
}

// Light-gray row under a usage bar: "Next reset: <date> | In 1d 20h".
export function ResetRow({ resetAt, now, providerId, period }) {
  const available = typeof resetAt === 'number' && resetAt > 0;
  const passed = available && resetAt <= now;
  const unavailableMessage =
    providerId === 'claude' && period === '5-Hour' ? CLAUDE_5H_UNAVAILABLE_RESET : DEFAULT_UNAVAILABLE_RESET;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
      <CalendarClock size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
      {available ? (
        <>
          <span>Next reset:</span>
          <span className="font-medium text-slate-700">{formatDateTime(resetAt)}</span>
          <span className="h-3 w-px bg-slate-300" aria-hidden="true" />
          <span className={passed ? 'text-amber-600' : 'text-slate-500'}>
            {passed ? 'Reset passed, awaiting new data' : `In ${formatDuration(resetAt - now)}`}
          </span>
        </>
      ) : (
        <span>{unavailableMessage}</span>
      )}
    </div>
  );
}
