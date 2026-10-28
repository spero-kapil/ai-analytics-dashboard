"use strict";

const { UNAVAILABLE } = require("./config");

function formatDateTime(iso) {
  if (iso == null || iso === "" || iso === UNAVAILABLE) {
    return null;
  }
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function finitePercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function resolveAccountName(snapshot, override) {
  const fromEnv = String(override || "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  const fromCli = snapshot && snapshot.cli && snapshot.cli.email;
  if (typeof fromCli === "string") {
    const email = fromCli.trim();
    if (email && email !== UNAVAILABLE) {
      return email;
    }
  }
  return "";
}

function buildReportPayload(snapshot, accountName) {
  const account = resolveAccountName(snapshot, accountName);
  const plan = snapshot && snapshot.plan && snapshot.plan.name;
  if (!account || !plan || plan === UNAVAILABLE) {
    return null;
  }

  const daily = snapshot.daily || {};
  const weekly = snapshot.weekly || {};
  const dailyUsed = finitePercent(daily.usedPercent);
  const weeklyUsed = finitePercent(weekly.usedPercent);
  const dailyReset = formatDateTime(daily.resetsAt);
  const weeklyReset = formatDateTime(weekly.resetsAt);
  const lastUpdated = formatDateTime(snapshot.lastUpdated);
  if (
    dailyUsed == null ||
    weeklyUsed == null ||
    !dailyReset ||
    !weeklyReset ||
    !lastUpdated
  ) {
    return null;
  }

  return {
    provider: "devin",
    email_id: account,
    plan_type: String(plan).trim().toLowerCase(),
    data: {
      daily: {
        used_percent: dailyUsed,
        reset_time: dailyReset,
      },
      weekly: {
        used_percent: weeklyUsed,
        reset_time: weeklyReset,
      },
      last_updated: lastUpdated,
    },
  };
}

async function postReport(url, payload, { timeoutMs = 10_000, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.text().catch(() => "");
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function sendUsage(snapshot, config) {
  if (!config.apiUrl) {
    return { skipped: true, reason: "disabled" };
  }
  const payload = buildReportPayload(snapshot, config.accountName);
  if (!payload) {
    return { skipped: true, reason: "incomplete" };
  }

  try {
    const result = await postReport(config.apiUrl, payload, {
      timeoutMs: config.apiTimeoutMs || config.timeoutMs,
    });
    return { skipped: false, payload, ...result };
  } catch (error) {
    return {
      skipped: false,
      ok: false,
      status: 0,
      error: error.name === "AbortError" ? "timeout" : error.message,
    };
  }
}

function describeSendResult(result, apiUrl) {
  if (result.skipped) {
    if (result.reason === "disabled") {
      return null;
    }
    if (result.reason === "incomplete") {
      return "API skipped: missing account email from `devin auth status` (or DEVIN_ACCOUNT_NAME) or daily/weekly usage";
    }
    return `API skipped: ${result.reason}`;
  }
  if (result.ok) {
    return `API posted to ${apiUrl} (${result.status})`;
  }
  if (result.error) {
    return `API POST failed: ${result.error}`;
  }
  return `API POST failed: HTTP ${result.status}${result.body ? ` ${String(result.body).slice(0, 200)}` : ""}`;
}

module.exports = {
  formatDateTime,
  resolveAccountName,
  buildReportPayload,
  postReport,
  sendUsage,
  describeSendResult,
};
