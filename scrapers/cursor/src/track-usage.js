#!/usr/bin/env node
/**
 * Cursor Tracker — monthly billing-cycle usage logger
 *
 * Cursor has no usage CLI. A personal API key (crsr_...) cannot read spend.
 * Monthly cycle limits come from cursor.com, authenticated by the local
 * WorkosCursorSessionToken (the same session the Cursor app already has).
 *
 * Endpoints used:
 *   GET  /api/auth/me
 *   POST /api/dashboard/get-current-period-usage
 *   GET  /api/usage-summary          (fallback)
 *
 * Stored tokens are never printed. Missing fields are stored as "Unavailable".
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SessionNotFound, resolveCookieValue } from "./auth.js";
import { CursorAPIError, CursorClient } from "./api.js";
import {
  MONTHLY_MODEL_KEYS,
  UNAVAILABLE,
  buildReportPayload,
  describeSendResult,
  sendUsage,
} from "./report.js";

const DEFAULT_INTERVAL_MINUTES = 15;
const DEFAULT_API_TIMEOUT_MS = 10_000;
const MAX_LOG_RECORDS = 5;
const DEFAULT_API_URL = "http://localhost:3000/api/cursor";
const MODEL_SOURCES = [
  { source: "autoPercentUsed", key: "Cursor_Models" },
  { source: "apiPercentUsed", key: "other_models" },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_LOG_DIR = path.join(PROJECT_ROOT, "logs");

export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(PROJECT_ROOT, ".env"));

function resolveLogDir(value) {
  if (!value) return DEFAULT_LOG_DIR;
  return path.isAbsolute(value) ? value : path.resolve(PROJECT_ROOT, value);
}

export function parseApiUrls(value) {
  if (value == null) return [];
  return String(value)
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseCli(argv = process.argv.slice(2)) {
  const args = {
    command: "once",
    intervalMinutes: Number(process.env.CURSOR_TRACKER_INTERVAL_MINUTES) || DEFAULT_INTERVAL_MINUTES,
    fixture: null,
    json: false,
    logDir: resolveLogDir(process.env.CURSOR_TRACKER_LOG_DIR),
    logMaxRecords: Number(process.env.CURSOR_TRACKER_LOG_MAX_RECORDS) || MAX_LOG_RECORDS,
    apiUrls: parseApiUrls(process.env.CURSOR_TRACKER_API_URL ?? DEFAULT_API_URL),
    apiTimeoutMs: Number(process.env.CURSOR_TRACKER_API_TIMEOUT_MS) || DEFAULT_API_TIMEOUT_MS,
    skipApi: false,
    help: false,
  };

  const positional = [];
  const cliApiUrls = [];
  let sawApiUrl = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--json") {
      args.json = true;
    } else if (token === "--fixture") {
      args.fixture = argv[++i];
    } else if (token === "--interval-minutes") {
      args.intervalMinutes = Number(argv[++i]);
    } else if (token === "--log-dir") {
      args.logDir = resolveLogDir(argv[++i]);
    } else if (token === "--api-url") {
      sawApiUrl = true;
      cliApiUrls.push(argv[++i]);
    } else if (token === "--skip-api") {
      args.skipApi = true;
    } else if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    } else {
      positional.push(token);
    }
  }

  if (positional[0]) args.command = positional[0];
  if (!Number.isFinite(args.intervalMinutes) || args.intervalMinutes <= 0) {
    throw new Error("interval minutes must be a positive number");
  }
  if (!Number.isFinite(args.logMaxRecords) || args.logMaxRecords <= 0) {
    throw new Error("log max records must be a positive number");
  }
  args.logMaxRecords = Math.floor(args.logMaxRecords);
  if (!Number.isFinite(args.apiTimeoutMs) || args.apiTimeoutMs <= 0) {
    throw new Error("API timeout must be a positive number");
  }
  if (args.skipApi) args.apiUrls = [];
  else if (sawApiUrl) args.apiUrls = parseApiUrls(cliApiUrls.join(","));
  return args;
}

export function usageText() {
  return `Usage: node src/track-usage.js <once|watch|verify> [options]

Commands:
  once     Fetch monthly usage once and write logs/
  watch    Fetch on a repeating interval (default 15 minutes)
  verify   Check the local session and a live monthly fetch

Options:
  --interval-minutes <n>   Watch interval (default: 15)
  --fixture <file>         Normalize a saved JSON fixture instead of calling cursor.com
  --log-dir <dir>          Log directory (default: ./logs)
  --api-url <url>          POST endpoint (repeatable; overrides env)
  --skip-api               Do not POST this run
  --json                   Print the snapshot as JSON
  -h, --help               Show this help

Environment (see example.env; copy to .env):
  CURSOR_SESSION_TOKEN
  CURSOR_TRACKER_INTERVAL_MINUTES
  CURSOR_TRACKER_LOG_DIR
  CURSOR_TRACKER_LOG_MAX_RECORDS
  CURSOR_TRACKER_API_URL
  CURSOR_TRACKER_API_TIMEOUT_MS
`;
}

function remainingPercent(usedPercent) {
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) {
    return UNAVAILABLE;
  }
  return Math.max(0, 100 - usedPercent);
}

function sanitizeEmailId(email) {
  if (typeof email !== "string") return UNAVAILABLE;
  const trimmed = email.trim();
  return trimmed ? trimmed : UNAVAILABLE;
}

function usernameFromEmail(emailId) {
  if (emailId === UNAVAILABLE) return UNAVAILABLE;
  const at = emailId.indexOf("@");
  if (at <= 0) return emailId;
  return emailId.slice(0, at);
}

function sanitizeAuth(auth, fallbackPlanType = UNAVAILABLE) {
  const emailId = sanitizeEmailId(auth?.email_id ?? auth?.email);
  const username =
    sanitizeEmailId(auth?.username) === UNAVAILABLE
      ? usernameFromEmail(emailId)
      : auth.username.trim();
  return {
    method: auth?.method || UNAVAILABLE,
    planType: auth?.planType || fallbackPlanType || UNAVAILABLE,
    username,
    email_id: emailId,
  };
}

function optionalNumber(source, key) {
  if (!source || !Object.prototype.hasOwnProperty.call(source, key)) return null;
  const value = source[key];
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateFromReset(value) {
  if (value == null || value === UNAVAILABLE) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = value > 1e12 ? new Date(value) : new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    const date = n > 1e12 ? new Date(n) : new Date(n * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pickPlanBlock(payload) {
  if (payload?.planUsage && typeof payload.planUsage === "object") return payload.planUsage;
  if (payload?.individualUsage?.plan && typeof payload.individualUsage.plan === "object") {
    return payload.individualUsage.plan;
  }
  return null;
}

function unavailableModel() {
  return {
    usedPercent: UNAVAILABLE,
    remainingPercent: UNAVAILABLE,
    resetsAt: UNAVAILABLE,
    resetsAtIso: UNAVAILABLE,
  };
}

function roundPercent(value) {
  return Math.round(value * 100) / 100;
}

function modelWindow(usedPercent, resetDate) {
  const window = unavailableModel();
  if (usedPercent != null) window.usedPercent = roundPercent(usedPercent);
  window.remainingPercent = remainingPercent(window.usedPercent);
  if (resetDate) {
    window.resetsAt = Math.floor(resetDate.getTime() / 1000);
    window.resetsAtIso = resetDate.toISOString();
  }
  return window;
}

export function extractMonthly(payload) {
  const monthly = {
    Cursor_Models: unavailableModel(),
    other_models: unavailableModel(),
  };
  if (!payload || typeof payload !== "object") return monthly;

  const plan = pickPlanBlock(payload);
  const enabled =
    payload.enabled != null ? payload.enabled : plan?.enabled != null ? plan.enabled : true;
  if (enabled === false) return monthly;

  const resetDate = dateFromReset(payload.billingCycleEnd);
  for (const { source, key } of MODEL_SOURCES) {
    monthly[key] = modelWindow(optionalNumber(plan, source), resetDate);
  }
  return monthly;
}

function extractPlanType(payload, auth) {
  const candidates = [
    payload?.membershipType,
    payload?.planUsage?.membershipType,
    payload?.individualUsage?.membershipType,
    payload?.individualUsage?.plan?.membershipType,
    auth?.planType,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim() && value.trim() !== UNAVAILABLE) {
      return value.trim().toLowerCase();
    }
  }
  return UNAVAILABLE;
}

export function normalizeSnapshot({
  loggedAt = new Date().toISOString(),
  source,
  status,
  error = null,
  auth = null,
  periodUsage = null,
} = {}) {
  const planType = extractPlanType(periodUsage, auth);
  return {
    loggedAt,
    source: source || UNAVAILABLE,
    status: status || "unavailable",
    error,
    auth: sanitizeAuth(auth, planType),
    monthly: extractMonthly(periodUsage),
  };
}

export function errorSnapshot(kind, message, extra = {}) {
  return normalizeSnapshot({
    source: extra.source || "cursor.com",
    status: extra.status || "error",
    error: { kind, message },
    auth: extra.auth || null,
    periodUsage: extra.periodUsage || null,
  });
}

function classifyFetchError(err) {
  if (err?.kind) return err.kind;
  if (err instanceof SessionNotFound) return "session_expired";
  if (err instanceof CursorAPIError) {
    if (err.status === 401 || err.status === 403) return "session_expired";
    if (err.status === 429) return "rate_limited";
    return "rpc_error";
  }
  const message = String(err?.message || err || "").toLowerCase();
  if (err?.name === "TimeoutError" || err?.name === "AbortError" || message.includes("timeout")) {
    return "timeout";
  }
  if (
    message.includes("enotfound") ||
    message.includes("econn") ||
    message.includes("network") ||
    message.includes("fetch")
  ) {
    return "network";
  }
  return "rpc_error";
}

async function fetchPeriodUsage(client) {
  const results = await Promise.allSettled([client.currentPeriodUsage(), client.usageSummary()]);
  const period = results[0].status === "fulfilled" ? results[0].value : null;
  const summary = results[1].status === "fulfilled" ? results[1].value : null;
  const payload = period || summary;
  if (!payload || typeof payload !== "object") {
    const err = results.find((entry) => entry.status === "rejected")?.reason;
    throw err || Object.assign(new Error("Cycle-limits endpoints returned no usable data"), {
      kind: "rpc_error",
    });
  }
  if (!payload.membershipType && summary?.membershipType) {
    payload.membershipType = summary.membershipType;
  }
  return {
    payload,
    source: period
      ? "cursor.com:get-current-period-usage"
      : "cursor.com:usage-summary",
  };
}

export async function fetchLiveUsage() {
  let cookie;
  try {
    cookie = await resolveCookieValue();
  } catch (err) {
    return errorSnapshot(err.kind || "session_expired", err.message, {
      source: "session",
      status: "error",
    });
  }

  const client = new CursorClient(cookie);
  try {
    const me = await client.me();
    const emailId = sanitizeEmailId(me?.email);
    const auth = {
      method: "session",
      planType: extractPlanType(me, null),
      username: usernameFromEmail(emailId),
      email_id: emailId,
    };
    if (!me?.id) {
      return errorSnapshot(
        "session_expired",
        "Session token is invalid or expired (auth/me returned no identity). Sign in via the Cursor app, or refresh CURSOR_SESSION_TOKEN.",
        { source: "cursor.com:auth/me", status: "error", auth },
      );
    }

    const { payload, source } = await fetchPeriodUsage(client);
    auth.planType = extractPlanType(payload, auth);
    return normalizeSnapshot({
      source,
      status: "ok",
      auth,
      periodUsage: payload,
    });
  } catch (err) {
    const kind = classifyFetchError(err);
    return errorSnapshot(kind, err.message || String(err), {
      source: "cursor.com",
      status: "error",
    });
  }
}

export async function fetchFromFixture(filePath) {
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  const me = raw.me || raw.auth || {};
  const payload = raw.periodUsage || raw.payload || raw;
  return normalizeSnapshot({
    source: `fixture:${path.basename(filePath)}`,
    status: "ok",
    auth: {
      method: me.method || "session",
      planType: me.planType || payload?.membershipType,
      email: me.email || raw.email,
      email_id: me.email_id || raw.email_id,
      username: me.username,
    },
    periodUsage: payload,
  });
}

function formatModel(window) {
  if (!window || window.usedPercent === UNAVAILABLE) return UNAVAILABLE;
  const reset = window.resetsAtIso === UNAVAILABLE ? UNAVAILABLE : window.resetsAtIso;
  return `${window.usedPercent}% used / ${window.remainingPercent}% remaining, reset ${reset}`;
}

export function formatSummary(snapshot) {
  const auth = `${snapshot.auth?.method || UNAVAILABLE}/${snapshot.auth?.planType || UNAVAILABLE}`;
  const emailId = snapshot.auth?.email_id || UNAVAILABLE;
  return [
    snapshot.loggedAt,
    snapshot.status,
    `auth=${auth}`,
    `email_id=${emailId}`,
    ...MONTHLY_MODEL_KEYS.map((key) => `${key}=${formatModel(snapshot.monthly?.[key])}`),
    snapshot.error ? `error=${snapshot.error.kind}: ${snapshot.error.message}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function readLogLines(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return text.split(/\r?\n/).filter((line) => line.length > 0);
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeCappedLog(filePath, line, maxRecords = MAX_LOG_RECORDS) {
  const lines = await readLogLines(filePath);
  lines.push(line);
  const kept = lines.slice(-Math.max(1, maxRecords));
  await writeFile(filePath, `${kept.join("\n")}\n`);
}

export async function writeLogs(snapshot, logDir, maxRecords = MAX_LOG_RECORDS) {
  await mkdir(logDir, { recursive: true });
  const latestPath = path.join(logDir, "latest.json");
  const jsonlPath = path.join(logDir, "usage.jsonl");
  const textPath = path.join(logDir, "cursor.logs");
  const pretty = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(latestPath, pretty);
  await writeCappedLog(jsonlPath, JSON.stringify(snapshot), maxRecords);
  await writeCappedLog(textPath, formatSummary(snapshot), maxRecords);
  return { latestPath, jsonlPath, textPath };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(failures, capMs) {
  const steps = Math.min(Math.max(failures, 1) - 1, 5);
  return Math.min(capMs, 30_000 * 2 ** steps);
}

export async function collectSnapshot(options) {
  if (options.fixture) {
    return fetchFromFixture(path.resolve(options.fixture));
  }
  return fetchLiveUsage();
}

async function commandOnce(options) {
  const snapshot = await collectSnapshot(options);
  const files = await writeLogs(snapshot, options.logDir, options.logMaxRecords);
  const api = await sendUsage(snapshot, options);
  const apiLine = describeSendResult(api, options.apiUrls?.[0]);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    if (apiLine) process.stderr.write(`${apiLine}\n`);
  } else {
    process.stdout.write(`${formatSummary(snapshot)}\n`);
    process.stdout.write(`Wrote ${files.latestPath}\n`);
    if (apiLine) process.stdout.write(`${apiLine}\n`);
  }
  return snapshot.status === "ok" ? 0 : 1;
}

async function commandWatch(options) {
  const intervalMs = options.intervalMinutes * 60 * 1000;
  let failures = 0;
  let running = true;

  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  process.stdout.write(
    `Watching Cursor monthly usage every ${options.intervalMinutes} minute(s). Ctrl+C to stop.\n`,
  );

  while (running) {
    const started = Date.now();
    const snapshot = await collectSnapshot(options);
    await writeLogs(snapshot, options.logDir, options.logMaxRecords);
    const api = await sendUsage(snapshot, options);
    process.stdout.write(`${formatSummary(snapshot)}\n`);
    const apiLine = describeSendResult(api, options.apiUrls?.[0]);
    if (apiLine) process.stdout.write(`${apiLine}\n`);

    if (snapshot.status === "ok") failures = 0;
    else failures += 1;

    const waitMs =
      snapshot.error?.kind === "rate_limited"
        ? Math.max(intervalMs, backoffMs(failures, intervalMs * 2))
        : snapshot.status === "ok"
          ? intervalMs
          : backoffMs(failures, intervalMs);

    while (running && Date.now() - started < waitMs) {
      await sleep(Math.min(1000, waitMs - (Date.now() - started)));
    }
  }
  return 0;
}

async function commandVerify(options) {
  const lines = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  lines.push(`node: ${process.version} ${nodeMajor >= 18 ? "OK" : "NEED >=18"}`);

  try {
    await resolveCookieValue();
    lines.push("session: found");
  } catch (err) {
    lines.push(`session: ${err.message}`);
  }

  const snapshot = await collectSnapshot(options);
  await writeLogs(snapshot, options.logDir, options.logMaxRecords);
  const api = await sendUsage(snapshot, options);
  lines.push(`fetch: ${snapshot.status}`);
  lines.push(`source: ${snapshot.source}`);
  lines.push(`plan: ${snapshot.auth.planType}`);
  lines.push(`email_id: ${snapshot.auth.email_id}`);
  lines.push(`username: ${snapshot.auth.username}`);
  for (const key of MONTHLY_MODEL_KEYS) {
    const window = snapshot.monthly?.[key];
    lines.push(
      `${key}: ${
        window?.usedPercent === UNAVAILABLE || window?.usedPercent == null
          ? UNAVAILABLE
          : `${window.usedPercent}% used, reset ${window.resetsAtIso}`
      }`,
    );
  }
  const apiLine = describeSendResult(api, options.apiUrls?.[0]);
  lines.push(`api: ${apiLine || "skipped"}`);
  if (snapshot.error) lines.push(`error: ${snapshot.error.kind}: ${snapshot.error.message}`);
  const payload = buildReportPayload(snapshot);
  if (payload) lines.push(`payload last_updated: ${payload.data.last_updated}`);
  lines.push("Compare Cursor_Models / other_models used % and reset time with cursor.com/dashboard usage.");

  process.stdout.write(`${lines.join("\n")}\n`);
  if (options.json) process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot.status === "ok" ? 0 : 1;
}

async function main() {
  let options;
  try {
    options = parseCli();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.stderr.write(usageText());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    process.stdout.write(usageText());
    return;
  }

  let exitCode = 0;
  if (options.command === "once") exitCode = await commandOnce(options);
  else if (options.command === "watch") exitCode = await commandWatch(options);
  else if (options.command === "verify") exitCode = await commandVerify(options);
  else {
    process.stderr.write(`Unknown command: ${options.command}\n`);
    process.stderr.write(usageText());
    exitCode = 2;
  }
  process.exitCode = exitCode;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exitCode = 1;
  });
}
