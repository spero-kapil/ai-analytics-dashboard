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
        {passed ? 'reset passed, awaiting new data' : `in ${formatDuration(resetAt - now)}`}
      </span>
    </span>
  );
}
