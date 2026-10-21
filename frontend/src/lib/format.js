const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
// 1793090400000 → "12:40 PM, October 21, 2026"
export const formatDateTime = (timestamp) => {
  if (typeof timestamp !== 'number') return null;
  const date = new Date(timestamp);
  return `${timeFormatter.format(date)}, ${dateFormatter.format(date)}`;
};

export const formatPercent = (value) => {
  if (typeof value !== 'number') return '—';
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
};

const UNITS = [
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['m', 60_000],
];

// Two most significant units: "2d 4h", "35m", "<1m".
export const formatDuration = (ms) => {
  const parts = [];
  let rest = Math.abs(ms);
  for (const [unit, size] of UNITS) {
    const amount = Math.floor(rest / size);
    if (amount > 0 || parts.length > 0) parts.push(`${amount}${unit}`);
    rest -= amount * size;
    if (parts.length === 2) break;
  }
  const text = parts.filter((part) => !part.startsWith('0')).join(' ');
  return text || '<1m';
};

export const formatRelative = (timestamp, now) => {
  if (typeof timestamp !== 'number') return null;
  const diff = timestamp - now;
  if (Math.abs(diff) < 60_000) return 'just now';
  return diff >= 0 ? `in ${formatDuration(diff)}` : `${formatDuration(diff)} ago`;
};

// Severity of a remaining percentage, shared by bars, badges and charts.
export const remainingLevel = (remaining) => {
  if (typeof remaining !== 'number') return 'unknown';
  if (remaining <= 20) return 'critical';
  if (remaining <= 50) return 'warning';
  return 'healthy';
};

export const LEVEL_STYLES = {
  healthy: { bar: 'bg-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500', hex: '#10b981' },
  warning: { bar: 'bg-amber-500', text: 'text-amber-700', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500', hex: '#f59e0b' },
  critical: { bar: 'bg-rose-500', text: 'text-rose-700', badge: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500', hex: '#f43f5e' },
  unknown: { bar: 'bg-slate-300', text: 'text-slate-500', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-300', hex: '#cbd5e1' },
};
