// Maps a local usage snapshot to the server payload and POSTs it.
// Times are UTC in "YYYY-MM-DD HH:MM:SS". A failed POST is reported, never thrown.

export function formatDateTime(iso) {
  if (iso == null || iso === '') return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// 0% used with no reset (shown as Unavailable) means the 5-hour window has
// not started. Still POST, but send an empty reset_time instead of skipping.
function fiveHourResetTime(window) {
  const formatted = formatDateTime(window.resetsAt);
  if (formatted) return formatted;
  return Number(window.usedPercent) === 0 ? '' : null;
}

export function buildReportPayload(snapshot) {
  const email = snapshot?.auth?.email;
  const plan = snapshot?.auth?.subscriptionType;
  if (!email || !plan) return null;
  if (snapshot.fiveHour?.usedPercent == null || snapshot.weekly?.usedPercent == null) return null;

  const fiveReset = fiveHourResetTime(snapshot.fiveHour);
  const weekReset = formatDateTime(snapshot.weekly.resetsAt);
  const lastUpdated = formatDateTime(snapshot.fetchedAt);
  if (fiveReset == null || !weekReset || !lastUpdated) return null;

  return {
    provider: 'claude',
    email_id: email,
    plan_type: plan,
    data: {
      fiveHour: {
        used_percent: snapshot.fiveHour.usedPercent,
        reset_time: fiveReset,
      },
      weekly: {
        used_percent: snapshot.weekly.usedPercent,
        reset_time: weekReset,
      },
      last_updated: lastUpdated,
    },
  };
}

export async function postReport(url, payload, { timeoutMs = 10_000, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendUsage(snapshot, config) {
  if (!config.apiUrl) return { skipped: true, reason: 'disabled' };
  const payload = buildReportPayload(snapshot);
  if (!payload) return { skipped: true, reason: 'incomplete' };

  try {
    const result = await postReport(config.apiUrl, payload, { timeoutMs: config.timeoutMs });
    return { skipped: false, payload, ...result };
  } catch (err) {
    return { skipped: false, ok: false, status: 0, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

export function describeSendResult(result, apiUrl) {
  if (result.skipped) return null;
  if (result.ok) return `API posted to ${apiUrl} (${result.status})`;
  if (result.error) return `API POST failed: ${result.error}`;
  return `API POST failed: HTTP ${result.status}${result.body ? ` ${String(result.body).slice(0, 200)}` : ''}`;
}
