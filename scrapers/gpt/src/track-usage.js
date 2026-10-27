#!/usr/bin/env node
/**
 * GPT Tracker — ChatGPT subscription usage logger
 *
 * Verified on this machine (codex-cli 0.164.0, ChatGPT login):
 *   - `codex --help` has no `usage` / `status` subcommand.
 *   - Interactive TUI `/status` is not invokable non-interactively.
 *   - `codex login status` reports the saved ChatGPT login.
 *   - `codex app-server --listen stdio://` implements JSON-RPC
 *     `account/read` and `account/rateLimits/read` (documented at
 *     https://learn.chatgpt.com/docs/app-server and generated from
 *     `codex app-server generate-json-schema --experimental`).
 *
 * This script does not invent HTTP endpoints, cookies, or quota values.
 * Missing fields are stored as "Unavailable".
 * Stored credentials in ~/.codex/auth.json are never read or printed.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync } from "node:fs";
import {
  mkdir,
  writeFile,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UNAVAILABLE = "Unavailable";
const DEFAULT_INTERVAL_MINUTES = 15;
const RPC_TIMEOUT_MS = 25_000;
const LOGIN_TIMEOUT_MS = 15_000;
const CLIENT_INFO = {
  name: "gpt_tracker_local",
  title: "GPT Tracker",
  version: "1.0.0",
};

const DAILY_MINS = 1_440;
const WEEKLY_MINS = 10_080;
const FIVE_HOUR_MINS = 300;
const MONTHLY_MINS_MIN = 28 * 1_440;
const MONTHLY_MINS_MAX = 32 * 1_440;
const API_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const USAGE_PERIODS = ["daily", "weekly", "monthly"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_LOG_DIR = path.join(PROJECT_ROOT, "logs");
const MAX_LOG_RECORDS = 5;
const DEFAULT_API_TIMEOUT_MS = 10_000;

export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
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
    intervalMinutes: Number(process.env.GPT_TRACKER_INTERVAL_MINUTES) || DEFAULT_INTERVAL_MINUTES,
    fixture: null,
    json: false,
    logDir: resolveLogDir(process.env.GPT_TRACKER_LOG_DIR),
    logMaxRecords: Number(process.env.GPT_TRACKER_LOG_MAX_RECORDS) || MAX_LOG_RECORDS,
    apiUrls: parseApiUrls(process.env.GPT_TRACKER_API_URL),
    apiTimeoutMs: Number(process.env.GPT_TRACKER_API_TIMEOUT_MS) || DEFAULT_API_TIMEOUT_MS,
    skipApi: false,
    codexBin: process.env.GPT_TRACKER_CODEX_BIN || "codex",
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
    } else if (token === "--codex-bin") {
      args.codexBin = argv[++i];
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
  once     Fetch usage once and write logs/
  watch    Fetch on a repeating interval (default 15 minutes)
  verify   Check Codex CLI, login session, and a live fetch

Options:
  --interval-minutes <n>   Watch interval (default: 15)
  --fixture <file>         Normalize a saved JSON fixture instead of calling Codex
  --log-dir <dir>          Log directory (default: ./logs)
  --codex-bin <path>       Codex binary (default: codex)
  --api-url <url>          POST endpoint (repeatable; overrides env)
  --skip-api               Do not POST this run
  --json                   Print the snapshot as JSON
  -h, --help               Show this help

Environment (see example.env; copy to .env):
  GPT_TRACKER_INTERVAL_MINUTES
  GPT_TRACKER_LOG_DIR
  GPT_TRACKER_LOG_MAX_RECORDS
  GPT_TRACKER_CODEX_BIN
  GPT_TRACKER_API_URL
  GPT_TRACKER_API_TIMEOUT_MS
`;
}

function unavailableWindow(label = UNAVAILABLE) {
  return {
    label,
    usedPercent: UNAVAILABLE,
    remainingPercent: UNAVAILABLE,
    windowDurationMins: UNAVAILABLE,
    resetsAt: UNAVAILABLE,
    resetsAtIso: UNAVAILABLE,
  };
}

function remainingPercent(usedPercent) {
  if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent)) {
    return UNAVAILABLE;
  }
  return Math.max(0, 100 - usedPercent);
}

function isoFromUnixSeconds(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return UNAVAILABLE;
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return UNAVAILABLE;
  return date.toISOString();
}

export function classifyWindow(windowDurationMins) {
  if (typeof windowDurationMins !== "number" || !Number.isFinite(windowDurationMins)) {
    return "other";
  }
  if (Math.abs(windowDurationMins - DAILY_MINS) <= 120) return "daily";
  if (Math.abs(windowDurationMins - WEEKLY_MINS) <= 120) return "weekly";
  if (windowDurationMins >= MONTHLY_MINS_MIN && windowDurationMins <= MONTHLY_MINS_MAX) return "monthly";
  return "other";
}

function normalizeWindow(raw, fallbackLabel) {
  if (!raw || typeof raw !== "object") return unavailableWindow(fallbackLabel);
  const usedPercent =
    typeof raw.usedPercent === "number" ? raw.usedPercent : UNAVAILABLE;
  const windowDurationMins =
    typeof raw.windowDurationMins === "number" ? raw.windowDurationMins : UNAVAILABLE;
  const resetsAt = typeof raw.resetsAt === "number" ? raw.resetsAt : UNAVAILABLE;
  const classified = classifyWindow(windowDurationMins);
  const label = USAGE_PERIODS.includes(classified) ? classified : fallbackLabel || "other";

  return {
    label,
    usedPercent,
    remainingPercent: remainingPercent(usedPercent),
    windowDurationMins,
    resetsAt,
    resetsAtIso: isoFromUnixSeconds(resetsAt),
  };
}

function collectWindows(snapshot) {
  const daily = unavailableWindow("daily");
  const weekly = unavailableWindow("weekly");
  const monthly = unavailableWindow("monthly");
  const other = [];

  const assign = (raw, fallbackLabel) => {
    const window = normalizeWindow(raw, fallbackLabel);
    if (window.usedPercent === UNAVAILABLE && window.windowDurationMins === UNAVAILABLE) {
      return;
    }
    if (
      typeof window.windowDurationMins === "number" &&
      Math.abs(window.windowDurationMins - FIVE_HOUR_MINS) <= 5
    ) {
      return;
    }
    if (window.label === "daily" && daily.usedPercent === UNAVAILABLE) {
      Object.assign(daily, window, { label: "daily" });
    } else if (window.label === "weekly" && weekly.usedPercent === UNAVAILABLE) {
      Object.assign(weekly, window, { label: "weekly" });
    } else if (window.label === "monthly" && monthly.usedPercent === UNAVAILABLE) {
      Object.assign(monthly, window, { label: "monthly" });
    } else if (!USAGE_PERIODS.includes(window.label)) {
      other.push(window);
    }
  };

  assign(snapshot?.primary, "primary");
  assign(snapshot?.secondary, "secondary");
  assign(snapshot?.daily, "daily");
  assign(snapshot?.weekly, "weekly");
  assign(snapshot?.monthly, "monthly");
  return { daily, weekly, monthly, other };
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
  return {
    method: auth?.method || UNAVAILABLE,
    planType: auth?.planType || fallbackPlanType || UNAVAILABLE,
    username: sanitizeEmailId(auth?.username) === UNAVAILABLE ? usernameFromEmail(emailId) : auth.username.trim(),
    email_id: emailId,
  };
}

function sanitizeCredits(credits) {
  if (!credits || typeof credits !== "object") return UNAVAILABLE;
  return {
    hasCredits: typeof credits.hasCredits === "boolean" ? credits.hasCredits : UNAVAILABLE,
    unlimited: typeof credits.unlimited === "boolean" ? credits.unlimited : UNAVAILABLE,
    balance: typeof credits.balance === "string" ? credits.balance : UNAVAILABLE,
  };
}

function sanitizeIndividualLimit(limit) {
  if (!limit || typeof limit !== "object") return UNAVAILABLE;
  return {
    used: typeof limit.used === "string" ? limit.used : UNAVAILABLE,
    limit: typeof limit.limit === "string" ? limit.limit : UNAVAILABLE,
    remainingPercent:
      typeof limit.remainingPercent === "number" ? limit.remainingPercent : UNAVAILABLE,
    resetsAt: typeof limit.resetsAt === "number" ? limit.resetsAt : UNAVAILABLE,
    resetsAtIso: isoFromUnixSeconds(limit.resetsAt),
  };
}

function normalizeBucket(limitId, snapshot) {
  const windows = collectWindows(snapshot || {});
  return {
    limitId: typeof limitId === "string" && limitId ? limitId : UNAVAILABLE,
    limitName: typeof snapshot?.limitName === "string" ? snapshot.limitName : UNAVAILABLE,
    planType: typeof snapshot?.planType === "string" ? snapshot.planType : UNAVAILABLE,
    daily: windows.daily,
    weekly: windows.weekly,
    monthly: windows.monthly,
    other: windows.other,
    credits: sanitizeCredits(snapshot?.credits),
    individualLimit: sanitizeIndividualLimit(snapshot?.individualLimit),
    rateLimitReachedType:
      typeof snapshot?.rateLimitReachedType === "string"
        ? snapshot.rateLimitReachedType
        : UNAVAILABLE,
  };
}

export function normalizeSnapshot({
  loggedAt = new Date().toISOString(),
  source,
  status,
  error = null,
  auth = null,
  rateLimitsResult = null,
} = {}) {
  const main = rateLimitsResult?.rateLimits || null;
  const byId = rateLimitsResult?.rateLimitsByLimitId;
  const buckets = {};

  if (byId && typeof byId === "object") {
    for (const [limitId, snapshot] of Object.entries(byId)) {
      buckets[limitId] = normalizeBucket(limitId, snapshot);
    }
  } else if (main) {
    const limitId = typeof main.limitId === "string" ? main.limitId : "codex";
    buckets[limitId] = normalizeBucket(limitId, main);
  }

  const primaryBucket =
    buckets.codex || Object.values(buckets)[0] || normalizeBucket("unknown", main);

  return {
    loggedAt,
    source: source || UNAVAILABLE,
    status: status || "unavailable",
    error,
    auth: sanitizeAuth(auth, primaryBucket.planType),
    ordinaryUsageAllowed:
      typeof rateLimitsResult?.ordinaryUsageAllowed === "boolean"
        ? rateLimitsResult.ordinaryUsageAllowed
        : UNAVAILABLE,
    resetCreditsAvailable:
      typeof rateLimitsResult?.rateLimitResetCredits?.availableCount === "number"
        ? rateLimitsResult.rateLimitResetCredits.availableCount
        : UNAVAILABLE,
    daily: primaryBucket.daily,
    weekly: primaryBucket.weekly,
    monthly: primaryBucket.monthly,
    otherWindows: primaryBucket.other,
    buckets,
  };
}

export function errorSnapshot(kind, message, extra = {}) {
  return normalizeSnapshot({
    source: extra.source || "codex-app-server",
    status: extra.status || "error",
    error: { kind, message },
    auth: extra.auth || null,
  });
}

function classifyRpcError(error) {
  const message = String(error?.message || error || "Unknown error");
  const lower = message.toLowerCase();
  const code = error?.code;
  if (code === -32601 || lower.includes("method not found")) return "unsupported_method";
  if (code === 429 || /\b429\b/.test(lower) || lower.includes("rate limit") || lower.includes("too many")) {
    return "rate_limited";
  }
  if (
    lower.includes("not logged") ||
    (lower.includes("auth") && (lower.includes("expir") || lower.includes("unauthor") || lower.includes("401")))
  ) {
    return "session_expired";
  }
  if (lower.includes("enotfound") || lower.includes("econn") || lower.includes("network") || lower.includes("timed out") || lower.includes("timeout")) {
    return "network";
  }
  return "rpc_error";
}

function runCommand(command, args, { timeoutMs = LOGIN_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(Object.assign(new Error(`${command} timed out`), { kind: "timeout" }));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(Object.assign(err, { kind: "spawn_failed" }));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export async function readLoginStatus(codexBin) {
  try {
    const result = await runCommand(codexBin, ["login", "status"]);
    const text = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const lower = text.toLowerCase();
    if (result.code !== 0) {
      return {
        ok: false,
        method: UNAVAILABLE,
        raw: text || `codex login status exited ${result.code}`,
      };
    }
    if (lower.includes("chatgpt")) {
      return { ok: true, method: "chatgpt", raw: result.stdout || text };
    }
    if (lower.includes("api key") || lower.includes("apikey")) {
      return { ok: true, method: "apiKey", raw: result.stdout || text };
    }
    if (lower.includes("logged in")) {
      return { ok: true, method: "unknown", raw: result.stdout || text };
    }
    return { ok: false, method: UNAVAILABLE, raw: result.stdout || text };
  } catch (err) {
    return {
      ok: false,
      method: UNAVAILABLE,
      raw: err.message,
      kind: err.kind || "spawn_failed",
    };
  }
}

class CodexAppServer {
  constructor(codexBin) {
    this.codexBin = codexBin;
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.closed = false;
  }

  start() {
    this.child = spawn(this.codexBin, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.on("error", (err) => this.failAll(err));
    this.child.on("close", (code, signal) => {
      this.closed = true;
      if (this.pending.size) {
        this.failAll(new Error(`codex app-server exited (${code ?? signal})`));
      }
    });
    this.child.stderr.on("data", () => {
      // Intentionally discarded: may contain operational noise, never tokens.
    });

    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) return;
      let message;
      try {
        message = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (message.id == null) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(message.error);
      else waiter.resolve(message.result);
    });
  }

  send(message) {
    if (!this.child?.stdin.writable) {
      throw new Error("codex app-server stdin is not writable");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error(`Timed out waiting for ${method}`), { kind: "timeout" }));
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      const payload = params === undefined ? { method, id } : { method, id, params };
      this.send(payload);
    });
  }

  failAll(err) {
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(err);
      this.pending.delete(id);
    }
  }

  async stop() {
    if (!this.child || this.closed) return;
    this.failAll(new Error("codex app-server closed"));
    this.child.stdin.end();
    this.child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill("SIGKILL");
        resolve();
      }, 1500);
      this.child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

export async function fetchLiveUsage(codexBin) {
  const login = await readLoginStatus(codexBin);
  if (!login.ok) {
    return errorSnapshot("session_expired", login.raw || "Codex is not logged in", {
      source: "codex login status",
      status: "error",
    });
  }
  if (login.method === "apiKey") {
    return errorSnapshot(
      "subscription_restricted",
      "Codex is logged in with an API key, not a ChatGPT subscription. Usage limits are unavailable.",
      { source: "codex login status", status: "unavailable", auth: { method: "apiKey" } },
    );
  }

  const server = new CodexAppServer(codexBin);
  try {
    server.start();
    await server.request("initialize", {
      clientInfo: CLIENT_INFO,
      capabilities: {
        optOutNotificationMethods: [
          "thread/started",
          "item/agentMessage/delta",
          "configWarning",
        ],
      },
    });
    server.send({ method: "initialized", params: {} });

    const account = await server.request("account/read", { refreshToken: false });
    const accountType = account?.account?.type || UNAVAILABLE;
    const planType = account?.account?.planType || UNAVAILABLE;
    const emailId = sanitizeEmailId(account?.account?.email);
    const auth = {
      method: accountType,
      planType,
      username: usernameFromEmail(emailId),
      email_id: emailId,
    };

    if (accountType !== "chatgpt") {
      return errorSnapshot(
        "subscription_restricted",
        `Codex account type is ${accountType}. ChatGPT subscription rate limits require a ChatGPT login.`,
        { source: "account/read", status: "unavailable", auth },
      );
    }

    const rateLimitsResult = await server.request("account/rateLimits/read", {
      excludeResetCreditDetails: true,
    });

    return normalizeSnapshot({
      source: "codex-app-server:account/rateLimits/read",
      status: "ok",
      auth,
      rateLimitsResult,
    });
  } catch (err) {
    const kind = err.kind || classifyRpcError(err);
    const message = err.message || String(err);
    return errorSnapshot(kind, message, {
      source: "codex-app-server",
      status: kind === "unsupported_method" ? "unavailable" : "error",
      auth: { method: login.method, planType: UNAVAILABLE, email_id: UNAVAILABLE },
    });
  } finally {
    await server.stop();
  }
}

export async function fetchFromFixture(filePath) {
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  return normalizeSnapshot({
    source: `fixture:${path.basename(filePath)}`,
    status: "ok",
    auth: {
      method: raw.account?.type || "chatgpt",
      planType: raw.account?.planType || raw.rateLimits?.planType || UNAVAILABLE,
      email: raw.account?.email,
      email_id: raw.account?.email_id,
      username: raw.account?.username,
    },
    rateLimitsResult: raw,
  });
}

export function formatSummary(snapshot) {
  const field = (window) => {
    if (!window || window.usedPercent === UNAVAILABLE) return UNAVAILABLE;
    const reset = window.resetsAtIso === UNAVAILABLE ? UNAVAILABLE : window.resetsAtIso;
    return `${window.usedPercent}% used / ${window.remainingPercent}% remaining, reset ${reset}`;
  };
  const auth = `${snapshot.auth?.method || UNAVAILABLE}/${snapshot.auth?.planType || UNAVAILABLE}`;
  const emailId = snapshot.auth?.email_id || UNAVAILABLE;
  return [
    snapshot.loggedAt,
    snapshot.status,
    `auth=${auth}`,
    `email_id=${emailId}`,
    snapshot.daily && snapshot.daily.usedPercent !== UNAVAILABLE
      ? `daily=${field(snapshot.daily)}`
      : null,
    `weekly=${field(snapshot.weekly)}`,
    snapshot.monthly && snapshot.monthly.usedPercent !== UNAVAILABLE
      ? `monthly=${field(snapshot.monthly)}`
      : null,
    snapshot.error ? `error=${snapshot.error.kind}: ${snapshot.error.message}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatApiDateTime(value) {
  if (value == null || value === UNAVAILABLE) return null;
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    date = value > 1e12 ? new Date(value) : new Date(value * 1000);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    date = new Date(trimmed);
  } else {
    return null;
  }
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

export function isApiDateTime(value) {
  return typeof value === "string" && API_DATETIME_RE.test(value);
}

export function normalizePlanType(planType) {
  if (typeof planType !== "string") return null;
  const trimmed = planType.trim();
  return trimmed && trimmed !== UNAVAILABLE ? trimmed : null;
}

function windowHasReset(window) {
  if (!window || typeof window !== "object") return false;
  return formatApiDateTime(window.resetsAtIso ?? window.resetsAt) != null;
}

function isUsableUsageWindow(window) {
  return windowHasReset(window) && typeof window.usedPercent === "number" && Number.isFinite(window.usedPercent);
}

function windowKind(window) {
  if (!window || typeof window !== "object") return "other";
  if (USAGE_PERIODS.includes(window.label)) return window.label;
  return classifyWindow(window.windowDurationMins);
}

function extraWindows(snapshot) {
  if (Array.isArray(snapshot?.otherWindows)) return snapshot.otherWindows;
  if (Array.isArray(snapshot?.other)) return snapshot.other;
  return [];
}

function findPeriodWindow(snapshot, period) {
  if (windowKind(snapshot?.[period]) === period && isUsableUsageWindow(snapshot[period])) {
    return snapshot[period];
  }
  return extraWindows(snapshot).find((window) => windowKind(window) === period && isUsableUsageWindow(window)) || null;
}

export function inspectUsageStructure(snapshot) {
  const planType = normalizePlanType(snapshot?.auth?.planType);
  const periods = {};
  for (const period of USAGE_PERIODS) {
    periods[period] = findPeriodWindow(snapshot, period);
  }
  const available = USAGE_PERIODS.filter((period) => periods[period]);
  return {
    kind: available.length ? "periods" : "unknown",
    planType,
    periods,
    available,
  };
}

export function buildPeriodPayload(window) {
  if (!isUsableUsageWindow(window)) return null;
  const reset_time = formatApiDateTime(window.resetsAtIso ?? window.resetsAt);
  if (!reset_time) return null;
  return {
    reset_time,
    used_percent: window.usedPercent,
  };
}

export function buildApiPayload(snapshot) {
  const structure = inspectUsageStructure(snapshot);
  const emailId =
    snapshot?.auth?.email_id && snapshot.auth.email_id !== UNAVAILABLE
      ? snapshot.auth.email_id
      : null;
  const data = {
    last_updated: formatApiDateTime(snapshot?.loggedAt) || formatApiDateTime(new Date()),
  };
  for (const period of structure.available) {
    const periodPayload = buildPeriodPayload(structure.periods[period]);
    if (periodPayload) data[period] = periodPayload;
  }

  return {
    provider: "chatgpt",
    email_id: emailId,
    plan_type: structure.planType,
    data,
  };
}

function validatePeriodPayload(name, value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return [`${name} must be an object with reset_time and used_percent`];
  }
  if (!isApiDateTime(value.reset_time)) {
    errors.push(`${name}.reset_time must be YYYY-MM-DD HH:mm:ss`);
  }
  if (typeof value.used_percent !== "number" || !Number.isFinite(value.used_percent)) {
    errors.push(`${name}.used_percent must be a number`);
  } else if (value.used_percent < 0 || value.used_percent > 100) {
    errors.push(`${name}.used_percent must be between 0 and 100`);
  }
  return errors;
}

export function validateApiPayload(payload, snapshotOrStructure = null) {
  const errors = [];
  const structure =
    snapshotOrStructure && typeof snapshotOrStructure === "object" && snapshotOrStructure.kind
      ? snapshotOrStructure
      : inspectUsageStructure(snapshotOrStructure);

  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["payload must be an object"], structure };
  }
  if (payload.provider !== "chatgpt") errors.push("provider must be chatgpt");
  if (typeof payload.email_id !== "string" || !payload.email_id.trim()) {
    errors.push("email_id is required");
  }
  if (typeof payload.plan_type !== "string" || !payload.plan_type.trim()) {
    errors.push("plan_type is required");
  }
  if (!payload.data || typeof payload.data !== "object") {
    errors.push("data must be an object");
    return { ok: false, errors, structure };
  }

  const data = payload.data;
  if (!isApiDateTime(data.last_updated)) {
    errors.push("last_updated must be YYYY-MM-DD HH:mm:ss");
  }
  for (const leftover of ["weekly_usage", "weekly_reset_time", "monthly_reset_time", "weekly_usage_time"]) {
    if (Object.hasOwn(data, leftover) && data[leftover] != null) {
      errors.push(`${leftover} is not a valid payload field`);
    }
  }

  const presentPeriods = USAGE_PERIODS.filter((period) => Object.hasOwn(data, period) && data[period] != null);
  if (!presentPeriods.length) {
    errors.push("data must include at least one of daily, weekly, monthly");
  }

  const expected = new Set(structure.available || []);
  for (const period of USAGE_PERIODS) {
    const present = presentPeriods.includes(period);
    if (expected.has(period) && !present) {
      errors.push(`${period} is required from the usage structure`);
    }
    if (!expected.has(period) && present) {
      errors.push(`${period} is not present in the usage structure`);
    }
    if (present) errors.push(...validatePeriodPayload(period, data[period]));
  }

  return { ok: errors.length === 0, errors, structure };
}

export function shouldSendApi(snapshot) {
  return Boolean(
    snapshot?.status === "ok" &&
      snapshot?.auth?.email_id &&
      snapshot.auth.email_id !== UNAVAILABLE,
  );
}

async function postJson(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = text;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    } else {
      parsed = null;
    }
    if (!response.ok) {
      return {
        ok: false,
        url,
        status: response.status,
        error: `HTTP ${response.status}`,
        body: parsed,
      };
    }
    return { ok: true, url, status: response.status, body: parsed };
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      url,
      error: aborted ? `Timed out after ${timeoutMs}ms` : err.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendUsageToApi(snapshot, options = {}) {
  const urls = Array.isArray(options.apiUrls)
    ? options.apiUrls.filter(Boolean)
    : parseApiUrls(options.apiUrls);
  const timeoutMs = Number(options.apiTimeoutMs) || DEFAULT_API_TIMEOUT_MS;
  if (!urls.length || !shouldSendApi(snapshot)) {
    return { skipped: true, results: [] };
  }

  const structure = inspectUsageStructure(snapshot);
  const payload = buildApiPayload(snapshot);
  const validation = validateApiPayload(payload, structure);
  if (!validation.ok) {
    return {
      skipped: true,
      reason: "invalid_payload",
      errors: validation.errors,
      payload,
      results: [],
    };
  }

  const results = [];
  for (const url of urls) {
    results.push(await postJson(url, payload, timeoutMs));
  }
  return { skipped: false, payload, results };
}

export function formatApiResult(result) {
  if (!result || result.skipped) {
    if (result?.reason === "invalid_payload") {
      const detail = Array.isArray(result.errors) && result.errors.length
        ? result.errors.join("; ")
        : "invalid payload";
      return `api=skipped invalid payload: ${detail}`;
    }
    return "api=skipped";
  }
  if (!result.results.length) return "api=skipped";
  return result.results
    .map((entry) =>
      entry.ok
        ? `api=${entry.url} HTTP ${entry.status}`
        : `api=${entry.url} failed: ${entry.error}`,
    )
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
  const textPath = path.join(logDir, "usage.log");
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
  return fetchLiveUsage(options.codexBin);
}

async function commandOnce(options) {
  const snapshot = await collectSnapshot(options);
  const files = await writeLogs(snapshot, options.logDir, options.logMaxRecords);
  const api = await sendUsageToApi(snapshot, options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    process.stderr.write(`${formatApiResult(api)}\n`);
  } else {
    process.stdout.write(`${formatSummary(snapshot)}\n`);
    process.stdout.write(`Wrote ${files.latestPath}\n`);
    process.stdout.write(`${formatApiResult(api)}\n`);
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
    `Watching ChatGPT usage every ${options.intervalMinutes} minute(s). Ctrl+C to stop.\n`,
  );

  while (running) {
    const started = Date.now();
    const snapshot = await collectSnapshot(options);
    await writeLogs(snapshot, options.logDir, options.logMaxRecords);
    const api = await sendUsageToApi(snapshot, options);
    process.stdout.write(`${formatSummary(snapshot)}\n`);
    process.stdout.write(`${formatApiResult(api)}\n`);

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

  let versionText = UNAVAILABLE;
  try {
    const version = await runCommand(options.codexBin, ["--version"]);
    versionText = version.stdout || version.stderr || `exit ${version.code}`;
    lines.push(`codex: ${versionText} ${version.code === 0 ? "OK" : "FAIL"}`);
  } catch (err) {
    lines.push(`codex: ${UNAVAILABLE} (${err.message})`);
  }

  const login = await readLoginStatus(options.codexBin);
  lines.push(`login: ${login.ok ? login.method : "not logged in"}`);
  if (login.raw) lines.push(`login detail: ${login.raw.split("\n")[0]}`);

  const snapshot = await collectSnapshot(options);
  await writeLogs(snapshot, options.logDir, options.logMaxRecords);
  const api = await sendUsageToApi(snapshot, options);
  lines.push(`fetch: ${snapshot.status}`);
  lines.push(`source: ${snapshot.source}`);
  lines.push(`plan: ${snapshot.auth.planType}`);
  lines.push(`email_id: ${snapshot.auth.email_id}`);
  lines.push(`username: ${snapshot.auth.username}`);
  lines.push(`daily: ${snapshot.daily?.usedPercent === UNAVAILABLE || snapshot.daily?.usedPercent == null ? UNAVAILABLE : `${snapshot.daily.usedPercent}% used, reset ${snapshot.daily.resetsAtIso}`}`);
  lines.push(`weekly: ${snapshot.weekly.usedPercent === UNAVAILABLE ? UNAVAILABLE : `${snapshot.weekly.usedPercent}% used, reset ${snapshot.weekly.resetsAtIso}`}`);
  lines.push(`monthly: ${snapshot.monthly?.usedPercent === UNAVAILABLE || snapshot.monthly?.usedPercent == null ? UNAVAILABLE : `${snapshot.monthly.usedPercent}% used, reset ${snapshot.monthly.resetsAtIso}`}`);
  lines.push(`api: ${formatApiResult(api)}`);
  if (snapshot.error) lines.push(`error: ${snapshot.error.kind}: ${snapshot.error.message}`);
  lines.push("Compare these percentages and reset times with Codex TUI `/status` and ChatGPT Settings > Usage.");

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
