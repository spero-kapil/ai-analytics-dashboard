// Parses the human-readable text printed by Claude Code's `/usage` command.
// The text has no published schema, so every field is optional: anything that
// does not match is reported as null (shown as "Unavailable"), never guessed.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// e.g. "Current week (all models): 24% used · resets Oct 29, 10:30am (Asia/Kolkata)"
const WINDOW_LINE =
  /^\s*([A-Za-z][^:\n]*?):\s*(\d+(?:\.\d+)?)\s*%\s*used\b(?:\s*[·•|,-]\s*resets?\s+(.+?))?\s*$/i;

// Lines after this heading are local, approximate attribution stats, not limits.
const ATTRIBUTION_HEADING = /^\s*what'?s contributing/i;

export function parseUsageText(text, now = new Date()) {
  const lines = String(text ?? '').split(/\r?\n/);
  const windows = [];

  for (const line of lines) {
    if (ATTRIBUTION_HEADING.test(line)) break;
    const m = WINDOW_LINE.exec(line);
    if (!m) continue;

    const label = m[1].trim();
    const usedPercent = Number(m[2]);
    const resetText = m[3]?.trim() ?? null;
    const resetsAt = resetText ? parseResetTime(resetText, now) : null;

    windows.push({
      key: classifyWindow(label),
      label,
      usedPercent,
      remainingPercent: Math.max(0, round1(100 - usedPercent)),
      resetsAtRaw: resetText,
      resetsAt: resetsAt ? resetsAt.toISOString() : null,
    });
  }

  const billingLine = lines.find((l) => /using your (subscription|api)/i.test(l));

  return {
    billingNote: billingLine ? billingLine.trim() : null,
    fiveHour: windows.find((w) => w.key === 'five_hour') ?? null,
    weekly: windows.find((w) => w.key === 'weekly_all') ?? null,
    otherWindows: windows.filter((w) => w.key !== 'five_hour' && w.key !== 'weekly_all'),
    windowCount: windows.length,
  };
}

function classifyWindow(label) {
  const l = label.toLowerCase();
  if (l.includes('session')) return 'five_hour';
  if (l.includes('week')) {
    if (/\(all models\)/.test(l) || l === 'current week') return 'weekly_all';
    const model = /\(([^)]+)\)/.exec(l)?.[1] ?? 'unknown';
    return `weekly_${model.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  }
  return l.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Accepts "Oct 29, 10:30am (Asia/Kolkata)", "Oct 29 at 10am (UTC)", "9:10pm (Asia/Kolkata)".
// /usage omits the year, so the next occurrence after `now` is used.
export function parseResetTime(text, now = new Date()) {
  const tzMatch = /\(([^)]+)\)\s*$/.exec(text);
  const timeZone = tzMatch && isValidTimeZone(tzMatch[1].trim())
    ? tzMatch[1].trim()
    : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body = (tzMatch ? text.slice(0, tzMatch.index) : text).trim();

  const m = /^(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,|\s+at)?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(body);
  if (!m) return null;

  const [, monStr, dayStr, hourStr, minStr, ampm] = m;
  let hour = Number(hourStr);
  const minute = minStr ? Number(minStr) : 0;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return null;

  const today = zonedParts(now, timeZone);

  if (monStr) {
    const month = MONTHS[monStr.toLowerCase()];
    if (month === undefined) return null;
    const day = Number(dayStr);
    let date = zonedToUtc(today.year, month, day, hour, minute, timeZone);
    // Allow a little slack for windows that reset moments ago.
    if (date.getTime() < now.getTime() - 24 * 3600 * 1000) {
      date = zonedToUtc(today.year + 1, month, day, hour, minute, timeZone);
    }
    return date;
  }

  let date = zonedToUtc(today.year, today.month, today.day, hour, minute, timeZone);
  if (date.getTime() < now.getTime()) {
    date = new Date(date.getTime() + 24 * 3600 * 1000);
  }
  return date;
}

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return {
    year: get('year'), month: get('month') - 1, day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  };
}

function zonedToUtc(year, month, day, hour, minute, timeZone) {
  const wallAsUtc = Date.UTC(year, month, day, hour, minute);
  let guess = wallAsUtc;
  // Two passes settle DST transitions.
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const offset = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second) - guess;
    guess = wallAsUtc - offset;
  }
  return new Date(guess);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
