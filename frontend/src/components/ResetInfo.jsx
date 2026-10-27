import { formatDateTime, formatDuration } from '../lib/format.js';

export default function ResetInfo({ resetAt, now }) {
  if (typeof resetAt !== 'number') {
    return <span className="text-sm text-slate-500">Reset time not provided</span>;
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
