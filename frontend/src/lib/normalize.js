// Turns the /api/data response into providers → accounts → usage meters.
//
// Each API record looks like { provider, email_id, account_name, plan_type, data, last_updated },
// where `data` is provider-specific. Supported `data` shapes:
//   flat pairs:     { weekly_usage: 10, weekly_reset_time: '2026-10-27 06:43:58' }
//   named meters:   { 'Cursor Models': 50, 'Other Models': 10 }
//   nested periods: { weekly: { used_percent: 10, reset_at: '...' } }
//   nested models:  { monthly: { Cursor_Models: { used_percent: 10 }, other_models: { used_percent: 0 }, reset_time: '...' } }
//   limit lists:    { limits: [{ period: 'weekly', usedPercent: 10, resetAt: 1793091600000 }] }
// Percentages are "percent used" unless the field name says "remaining".
import { PROVIDERS, resolveProvider } from './providers.js';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const pick = (source, keys) => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return undefined;
};

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
    return match ? Number(match[1]) : null;
  }
  return null;
};

const clampPercent = (value) => {
  const number = toNumber(value);
  if (number === null) return null;
  return Math.round(Math.min(100, Math.max(0, number)) * 100) / 100;
};

// Server timestamps without a zone ("2026-10-27 06:43:58") are stored in UTC.
const NAIVE_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

export const parseTimestamp = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();

  const number = toNumber(value);
  if (number !== null) {
    if (number <= 0) return null;
    return number < 1e12 ? number * 1000 : number;
  }

  if (typeof value !== 'string') return null;
  const text = value.trim();
  const parsed = Date.parse(NAIVE_DATETIME_RE.test(text) ? `${text.replace(' ', 'T')}Z` : text);
  return Number.isNaN(parsed) ? null : parsed;
};

const PERIOD_PATTERNS = [
  [/^(hour|hourly|1_?h)$/, () => 'Hourly'],
  [/^(day|daily|1_?d)$/, () => 'Daily'],
  [/^(week|weekly|7_?d)$/, () => 'Weekly'],
  [/^(month|monthly|billing(_?period|_?cycle)?)$/, () => 'Monthly'],
  [/^(year|yearly|annual|annually)$/, () => 'Yearly'],
  [/^five_?hours?$/, () => '5-Hour'],
  [/^(\d+)_?(h|hr|hrs|hours?)$/, (m) => `${m[1]}-Hour`],
  [/^(\d+)_?(d|days?)$/, (m) => `${m[1]}-Day`],
  [/^(\d+)_?(m|min|mins|minutes?)$/, (m) => `${m[1]}-Minute`],
];

// 'weekly' → 'Weekly', '5h' → '5-Hour', 'weekly_2' → 'Weekly'; null if unknown.
export const describePeriod = (raw) => {
  if (raw === undefined || raw === null) return null;
  const key = String(raw).trim().toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_?(usage|limit|window|quota)$/, '')
    .replace(/_\d+$/, '');
  for (const [pattern, label] of PERIOD_PATTERNS) {
    const match = key.match(pattern);
    if (match) return label(match);
  }
  return null;
};

const humanize = (key) =>
  String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const USED_KEYS = ['usedPercent', 'used_percent', 'usage_percent', 'usagePercent', 'percent_used', 'usage', 'used'];
const REMAINING_KEYS = ['remainingPercent', 'remaining_percent', 'percent_remaining', 'remaining'];
const RESET_KEYS = ['resetAt', 'reset_at', 'resetsAt', 'resets_at', 'reset_time', 'resetTime', 'next_reset', 'reset'];
const LIMIT_KEYS = ['limit', 'total', 'max', 'quota'];

const META_KEYS = new Set([
  'last_updated', 'lastupdated', 'updated_at', 'updatedat', 'fetched_at', 'fetchedat',
  'created_at', 'createdat', 'timestamp', 'page_url', 'pageurl', 'source', 'plan', 'plan_type',
  'account', 'account_name', 'email',
]);

// Field suffixes that tie a flat key to its meter: weekly_usage → weekly.
const FLAT_FIELD_RE = /^(.+?)_(usage_percent|used_percent|usage|used|remaining_percent|remaining|reset_time|reset_at|resets_at|reset|limit)$/i;

const fieldKind = (suffix) => {
  const lower = suffix.toLowerCase();
  if (lower.startsWith('reset')) return 'reset';
  if (lower.startsWith('remaining')) return 'remaining';
  if (lower === 'limit') return 'limit';
  return 'used';
};

const buildMeter = ({ key, label, period, used, remaining, reset, limit }) => {
  let usedPercent = clampPercent(used);
  let remainingPercent = clampPercent(remaining);
  const limitNumber = toNumber(limit);

  // With a limit, used/remaining are absolute counts ("30 of 120").
  if (limitNumber && limitNumber > 0) {
    const usedNumber = toNumber(used);
    const remainingNumber = toNumber(remaining);
    usedPercent = usedNumber === null ? null : clampPercent((usedNumber / limitNumber) * 100);
    remainingPercent = remainingNumber === null ? null : clampPercent((remainingNumber / limitNumber) * 100);
  }

  if (usedPercent === null && remainingPercent !== null) usedPercent = clampPercent(100 - remainingPercent);
  if (remainingPercent === null && usedPercent !== null) remainingPercent = clampPercent(100 - usedPercent);

  const periodLabel = describePeriod(period ?? key);
  return {
    id: String(key),
    label: label ? String(label) : periodLabel ? `${periodLabel} usage` : humanize(key),
    period: periodLabel,
    usedPercent,
    remainingPercent,
    resetAt: parseTimestamp(reset),
  };
};

const PERCENT_KEYS = [...USED_KEYS.slice(0, 5), ...REMAINING_KEYS.slice(0, 3)];
const USAGE_FIGURE_KEYS = [...USED_KEYS, ...REMAINING_KEYS];
const hasUsageFigures = (value) => isPlainObject(value) && pick(value, USAGE_FIGURE_KEYS) !== undefined;

const STRUCTURAL_KEYS = new Set(
  [...RESET_KEYS, ...LIMIT_KEYS, ...USAGE_FIGURE_KEYS, 'label', 'name', 'title', 'period', 'window', 'type'].map((key) =>
    key.toLowerCase(),
  ),
);

const meterFromSection = (key, section) =>
  buildMeter({
    key,
    label: pick(section, ['label', 'name', 'title']),
    period: pick(section, ['period', 'window', 'type']) ?? key,
    used: pick(section, USED_KEYS),
    remaining: pick(section, REMAINING_KEYS),
    reset: pick(section, RESET_KEYS),
    limit: pick(section, PERCENT_KEYS) === undefined ? pick(section, LIMIT_KEYS) : undefined,
  });

// monthly: { Cursor_Models: { used_percent }, reset_time } → one meter per model,
// inheriting the parent period and reset time.
const meterFromNested = (parentKey, parentValue, childKey, childValue) => {
  const section = { ...childValue };
  if (pick(section, ['label', 'name', 'title']) === undefined) section.label = humanize(childKey);
  if (pick(section, ['period', 'window', 'type']) === undefined) section.period = parentKey;
  if (pick(section, RESET_KEYS) === undefined) {
    const inheritedReset = pick(parentValue, RESET_KEYS);
    if (inheritedReset !== undefined) section.reset_time = inheritedReset;
  }
  return meterFromSection(`${parentKey}.${childKey}`, section);
};

const parseJsonObject = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const extractMeters = (rawData) => {
  const data = parseJsonObject(rawData);

  if (Array.isArray(data)) {
    return data.filter(isPlainObject).map((section, index) => meterFromSection(section.period ?? `limit_${index + 1}`, section));
  }
  if (!isPlainObject(data)) return [];

  let order = 0;
  const groups = new Map();
  const group = (key) => {
    if (!groups.has(key)) groups.set(key, { key, order: order++ });
    return groups.get(key);
  };
  const meters = [];
  const addMeter = (meter) => meters.push({ order: order++, meter });

  for (const [key, value] of Object.entries(data)) {
    if (META_KEYS.has(key.toLowerCase())) continue;

    if (key === 'limits' && Array.isArray(value)) {
      value.filter(isPlainObject).forEach((section, index) => {
        addMeter(meterFromSection(section.period ?? `limit_${index + 1}`, section));
      });
      continue;
    }

    if (isPlainObject(value)) {
      if (hasUsageFigures(value)) {
        addMeter(meterFromSection(key, value));
      } else {
        for (const [childKey, childValue] of Object.entries(value)) {
          const lower = childKey.toLowerCase();
          if (META_KEYS.has(lower) || STRUCTURAL_KEYS.has(lower)) continue;
          if (hasUsageFigures(childValue)) addMeter(meterFromNested(key, value, childKey, childValue));
        }
      }
      continue;
    }

    const flat = key.match(FLAT_FIELD_RE);
    if (flat) {
      group(flat[1])[fieldKind(flat[2])] = value;
      continue;
    }

    // A bare number under a descriptive key, e.g. { 'Cursor Models': 50 }.
    if (toNumber(value) !== null) addMeter(buildMeter({ key, used: value }));
  }

  for (const entry of groups.values()) {
    const hasFigures = entry.used !== undefined || entry.remaining !== undefined;
    if (!hasFigures && entry.reset === undefined) continue;
    meters.push({ order: entry.order, meter: buildMeter(entry) });
  }

  return meters.sort((a, b) => a.order - b.order).map(({ meter }) => meter);
};

const formatPlan = (raw) => {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  return String(raw)
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeRecord = (record, index) => {
  const data = parseJsonObject(pick(record, ['data', 'usage', 'usage_data', 'limits']));
  const provider = resolveProvider(pick(record, ['provider', 'provider_name', 'providerName', 'service']));
  const email = pick(record, ['email_id', 'emailId', 'email', 'account_name', 'accountName', 'account', 'username']);

  return {
    id: String(pick(record, ['id', '_id']) ?? `${provider.id}-${email ?? 'account'}-${index}`),
    providerId: provider.id,
    provider,
    email: email ? String(email) : null,
    plan: formatPlan(pick(record, ['plan_type', 'planType', 'plan', 'subscription'])),
    meters: extractMeters(data),
    lastUpdated:
      parseTimestamp(pick(record, ['last_updated', 'lastUpdated'])) ??
      parseTimestamp(isPlainObject(data) ? pick(data, ['last_updated', 'updated_at', 'fetched_at', 'fetchedAt']) : undefined) ??
      parseTimestamp(pick(record, ['updatedAt', 'updated_at', 'createdAt', 'created_at'])),
  };
};

// Accepts { data: [...] }, a bare array, or { ProviderName: [...] }.
const extractRecords = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!isPlainObject(payload)) throw new Error('The API returned an unexpected response.');

  if (payload.success === false) {
    throw new Error(payload.error?.message || payload.message || 'The API reported an error.');
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (isPlainObject(payload.data)) return extractRecords(payload.data);

  const groupedEntries = Object.entries(payload).filter(([, value]) => Array.isArray(value));
  if (groupedEntries.length > 0) {
    return groupedEntries.flatMap(([provider, records]) =>
      records.filter(isPlainObject).map((record) => ({ provider, ...record })),
    );
  }

  throw new Error('The API response did not contain any account records.');
};

const byEmail = (a, b) => (a.email ?? '').localeCompare(b.email ?? '');

// Returns every supported provider (even with no accounts) followed by any
// other provider found in the data.
export const normalizeUsageResponse = (payload) => {
  const accounts = extractRecords(payload).filter(isPlainObject).map(normalizeRecord);

  const groups = new Map(PROVIDERS.map((provider) => [provider.id, { ...provider, accounts: [] }]));
  for (const account of accounts) {
    if (!groups.has(account.providerId)) groups.set(account.providerId, { ...account.provider, accounts: [] });
    groups.get(account.providerId).accounts.push(account);
  }

  return [...groups.values()].map((group) => ({ ...group, accounts: group.accounts.sort(byEmail) }));
};
