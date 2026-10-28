// Maps a local usage snapshot to the server payload and POSTs it.
// Times are UTC in "YYYY-MM-DD HH:MM:SS". A failed POST is reported, never thrown.

export const UNAVAILABLE = "Unavailable";
export const API_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
export const MONTHLY_MODEL_KEYS = ["Cursor_Models", "other_models"];

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatDateTime(value) {
  if (value == null || value === "" || value === UNAVAILABLE) return null;
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    date = value > 1e12 ? new Date(value) : new Date(value * 1000);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (API_DATETIME_RE.test(trimmed)) return trimmed;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      date = n > 1e12 ? new Date(n) : new Date(n * 1000);
    } else {
      date = new Date(trimmed);
    }
  } else {
    return null;
  }
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

export function isApiDateTime(value) {
  return typeof value === "string" && API_DATETIME_RE.test(value);
}

function finitePercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function modelUsedPercent(window) {
  return finitePercent(window?.usedPercent ?? window?.used_percent);
}

function modelResetTime(window) {
  return formatDateTime(window?.resetsAtIso ?? window?.reset_time ?? window?.resetsAt);
}

export function buildReportPayload(snapshot) {
  const email = snapshot?.auth?.email_id;
  const plan = snapshot?.auth?.planType;
  if (!email || email === UNAVAILABLE || !plan || plan === UNAVAILABLE) return null;

  const monthly = {};
  for (const key of MONTHLY_MODEL_KEYS) {
    const used_percent = modelUsedPercent(snapshot?.monthly?.[key]);
    if (used_percent != null) monthly[key] = { used_percent };
  }
  if (!MONTHLY_MODEL_KEYS.some((key) => monthly[key])) return null;

  const reset_time =
    formatDateTime(snapshot?.monthly?.reset_time ?? snapshot?.monthly?.resetsAtIso ?? snapshot?.monthly?.resetsAt) ||
    MONTHLY_MODEL_KEYS.map((key) => modelResetTime(snapshot?.monthly?.[key])).find(Boolean);
  if (!reset_time) return null;
  monthly.reset_time = reset_time;

  const last_updated = formatDateTime(snapshot?.loggedAt) || formatDateTime(new Date());
  if (!last_updated) return null;

  return {
    provider: "cursor",
    email_id: email,
    plan_type: String(plan).trim().toLowerCase(),
    data: {
      monthly,
      last_updated,
    },
  };
}

export async function postReport(url, payload, { timeoutMs = 10_000, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendUsage(snapshot, config) {
  const urls = Array.isArray(config.apiUrls)
    ? config.apiUrls.filter(Boolean)
    : config.apiUrl
      ? [config.apiUrl]
      : [];
  if (!urls.length) return { skipped: true, reason: "disabled" };

  const payload = buildReportPayload(snapshot);
  if (!payload) return { skipped: true, reason: "incomplete" };

  const timeoutMs = config.apiTimeoutMs || config.timeoutMs || 10_000;
  const results = [];
  for (const url of urls) {
    try {
      const result = await postReport(url, payload, { timeoutMs });
      results.push({ url, ...result });
    } catch (err) {
      results.push({
        url,
        ok: false,
        status: 0,
        error: err.name === "AbortError" ? "timeout" : err.message,
      });
    }
  }
  return { skipped: false, payload, results };
}

export function describeSendResult(result, apiUrl) {
  if (!result || result.skipped) {
    if (result?.reason === "incomplete") {
      return "API skipped: missing email, plan, or monthly Cursor_Models/other_models";
    }
    return null;
  }
  if (!result.results?.length) {
    if (result.ok) return `API posted to ${apiUrl} (${result.status})`;
    if (result.error) return `API POST failed: ${result.error}`;
    return `API POST failed: HTTP ${result.status}${result.body ? ` ${String(result.body).slice(0, 200)}` : ""}`;
  }
  return result.results
    .map((entry) =>
      entry.ok
        ? `API posted to ${entry.url} (${entry.status})`
        : `API POST failed: ${entry.error || `HTTP ${entry.status}${entry.body ? ` ${String(entry.body).slice(0, 200)}` : ""}`}`,
    )
    .join(" | ");
}
