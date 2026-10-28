#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CliError, getAuthStatus, getUsageText, getVersion } from './claude-cli.js';
import { loadEnvFile } from './load-env.js';
import { parseUsageText } from './parse-usage.js';
import { describeSendResult, sendUsage } from './report.js';

const UNAVAILABLE = 'Unavailable';
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBSCRIPTION_PLANS = new Set(['pro', 'max', 'team', 'enterprise']);
const TRANSIENT = new Set(['network', 'timeout', 'rate_limited', 'cli_error']);
const HISTORY_LIMIT = 5;
const DEFAULT_API_URL = 'http://localhost:3000/api/claude-code';

loadEnvFile(path.join(PROJECT_ROOT, '.env'));

function loadConfig() {
  const { values } = parseArgs({
    options: {
      once: { type: 'boolean', default: false },
      interval: { type: 'string' },
      'logs-dir': { type: 'string' },
      warn: { type: 'string' },
      critical: { type: 'string' },
      'claude-bin': { type: 'string' },
      timeout: { type: 'string' },
      'parse-file': { type: 'string' },
      'api-url': { type: 'string' },
      'no-api': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`Usage: node src/tracker.js [options]

  --once               Fetch once and exit (exit code 0 = usage captured)
  --interval <min>     Refresh interval in minutes      (env CLAUDE_USAGE_INTERVAL_MIN, default 15, min 1)
  --logs-dir <dir>     Output directory                 (env CLAUDE_USAGE_LOGS_DIR, default ./logs)
  --warn <pct>         Warning threshold, % used        (env CLAUDE_USAGE_WARN_PCT, default 80)
  --critical <pct>     Critical threshold, % used       (env CLAUDE_USAGE_CRITICAL_PCT, default 95)
  --claude-bin <path>  Claude Code executable           (env CLAUDE_BIN, default "claude")
  --timeout <sec>      Per-command timeout in seconds   (env CLAUDE_USAGE_TIMEOUT_SEC, default 60)
  --api-url <url>      POST usage JSON here             (env CLAUDE_USAGE_API_URL, default ${DEFAULT_API_URL})
  --no-api             Skip the usage POST
  --parse-file <file>  Parse saved /usage text instead of calling the CLI (offline testing)`);
    process.exit(0);
  }

  const num = (v, env, def) => {
    const n = Number(v ?? process.env[env] ?? def);
    return Number.isFinite(n) ? n : def;
  };

  const str = (flag, env, def) => {
    if (flag !== undefined) return flag;
    if (process.env[env] !== undefined) return process.env[env];
    return def;
  };

  return {
    once: values.once || Boolean(values['parse-file']),
    intervalMs: Math.max(1, num(values.interval, 'CLAUDE_USAGE_INTERVAL_MIN', 15)) * 60_000,
    logsDir: path.resolve(values['logs-dir'] ?? process.env.CLAUDE_USAGE_LOGS_DIR ?? path.join(PROJECT_ROOT, 'logs')),
    warnPct: num(values.warn, 'CLAUDE_USAGE_WARN_PCT', 80),
    criticalPct: num(values.critical, 'CLAUDE_USAGE_CRITICAL_PCT', 95),
    bin: values['claude-bin'] ?? process.env.CLAUDE_BIN ?? 'claude',
    timeoutMs: num(values.timeout, 'CLAUDE_USAGE_TIMEOUT_SEC', 60) * 1000,
    parseFile: values['parse-file'] ?? null,
    apiUrl: values['no-api'] ? '' : str(values['api-url'], 'CLAUDE_USAGE_API_URL', DEFAULT_API_URL),
  };
}

async function collect(config) {
  const fetchedAt = new Date();
  const snapshot = {
    fetchedAt: fetchedAt.toISOString(),
    status: 'ok',
    source: config.parseFile ? `file:${config.parseFile}` : 'claude -p /usage',
    claudeVersion: null,
    auth: null,
    fiveHour: null,
    weekly: null,
    otherWindows: [],
    billingNote: null,
    warnings: [],
    error: null,
  };

  let text;
  if (config.parseFile) {
    text = await fs.readFile(config.parseFile, 'utf8');
  } else {
    snapshot.claudeVersion = await getVersion(config).catch(() => null);
    snapshot.auth = await getAuthStatus(config);

    if (!snapshot.auth.loggedIn) {
      throw Object.assign(
        new CliError('auth_required', 'Claude Code is not logged in (or the session expired). Run `claude auth login`.'),
        { snapshot },
      );
    }
    if (process.env.ANTHROPIC_API_KEY) {
      snapshot.warnings.push({ level: 'info', message: 'ANTHROPIC_API_KEY is set; Claude Code may bill the API key instead of your subscription.' });
    }
    if (snapshot.auth.subscriptionType && !SUBSCRIPTION_PLANS.has(snapshot.auth.subscriptionType)) {
      snapshot.warnings.push({ level: 'info', message: `Subscription type "${snapshot.auth.subscriptionType}" may not have plan usage limits.` });
    }

    const usage = await getUsageText(config);
    text = usage.text;
    await fs.writeFile(path.join(config.logsDir, 'last-usage-raw.txt'), text + '\n');
  }

  const parsed = parseUsageText(text, fetchedAt);
  Object.assign(snapshot, {
    fiveHour: parsed.fiveHour,
    weekly: parsed.weekly,
    otherWindows: parsed.otherWindows,
    billingNote: parsed.billingNote,
  });

  if (parsed.windowCount === 0) {
    const plan = snapshot.auth?.subscriptionType;
    throw Object.assign(
      new CliError(
        'no_subscription_data',
        plan && !SUBSCRIPTION_PLANS.has(plan)
          ? `/usage returned no plan limits; plan "${plan}" does not appear to be a Pro/Max subscription.`
          : '/usage returned no plan-limit lines (not a Pro/Max login, or the output format changed). See logs/last-usage-raw.txt.',
      ),
      { snapshot },
    );
  }

  for (const w of [parsed.fiveHour, parsed.weekly, ...parsed.otherWindows]) {
    if (!w) continue;
    if (w.usedPercent >= 100) {
      snapshot.warnings.push({ level: 'limit_reached', window: w.label, message: `${w.label}: limit reached (${w.usedPercent}% used), resets ${w.resetsAtRaw ?? UNAVAILABLE}` });
    } else if (w.usedPercent >= config.criticalPct) {
      snapshot.warnings.push({ level: 'critical', window: w.label, message: `${w.label}: ${w.usedPercent}% used (>= ${config.criticalPct}%), resets ${w.resetsAtRaw ?? UNAVAILABLE}` });
    } else if (w.usedPercent >= config.warnPct) {
      snapshot.warnings.push({ level: 'warning', window: w.label, message: `${w.label}: ${w.usedPercent}% used (>= ${config.warnPct}%), resets ${w.resetsAtRaw ?? UNAVAILABLE}` });
    }
  }
  if (!parsed.fiveHour) snapshot.warnings.push({ level: 'info', message: 'Five-hour session window not present in /usage output.' });
  if (!parsed.weekly) snapshot.warnings.push({ level: 'info', message: 'Weekly (all models) window not present in /usage output.' });

  return snapshot;
}

function failureSnapshot(err, config) {
  const base = err.snapshot ?? {
    fetchedAt: new Date().toISOString(),
    source: config.parseFile ? `file:${config.parseFile}` : 'claude -p /usage',
    fiveHour: null,
    weekly: null,
    otherWindows: [],
    warnings: [],
  };
  return { ...base, status: err.kind ?? 'error', error: { kind: err.kind ?? 'error', message: err.message } };
}

function fmtWindow(w) {
  if (!w) return `used ${UNAVAILABLE} | remaining ${UNAVAILABLE} | resets ${UNAVAILABLE}`;
  const resets = w.resetsAt ? `${w.resetsAt} (${w.resetsAtRaw})` : (w.resetsAtRaw ?? UNAVAILABLE);
  return `used ${w.usedPercent}% | remaining ${w.remainingPercent}% | resets ${resets}`;
}

function summaryLines(s) {
  const lines = [
    `[${s.fetchedAt}] status=${s.status}`,
    `  Account        : ${s.auth?.email ?? UNAVAILABLE}`,
    `  Plan           : ${s.auth?.subscriptionType ?? UNAVAILABLE}`,
    `  5-hour session : ${fmtWindow(s.fiveHour)}`,
    `  Weekly (all)   : ${fmtWindow(s.weekly)}`,
    ...s.otherWindows.map((w) => `  ${w.label} : ${fmtWindow(w)}`),
  ];
  if (s.error) lines.push(`  ERROR (${s.error.kind}): ${s.error.message}`);
  for (const w of s.warnings) lines.push(`  ${w.level.toUpperCase()}: ${w.message}`);
  return lines;
}

async function atomicWrite(filePath, contents) {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, contents);
  await fs.rename(tmp, filePath);
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

async function writeJsonlKeepLast(filePath, record, limit = HISTORY_LIMIT) {
  const existing = (await readText(filePath)).split(/\r?\n/).filter((line) => line.trim());
  existing.push(JSON.stringify(record));
  await atomicWrite(filePath, existing.slice(-limit).join('\n') + '\n');
}

async function writeLogKeepLast(filePath, block, limit = HISTORY_LIMIT) {
  const existing = (await readText(filePath))
    .split(/(?=^\[\d{4}-\d{2}-\d{2}T)/m)
    .filter((part) => part.trim());
  existing.push(block.endsWith('\n') ? block : `${block}\n`);
  await atomicWrite(filePath, existing.slice(-limit).join(''));
}

async function persist(snapshot, config) {
  const latestPath = path.join(config.logsDir, 'usage-latest.json');
  await atomicWrite(latestPath, JSON.stringify(snapshot, null, 2) + '\n');
  await writeJsonlKeepLast(path.join(config.logsDir, 'usage-history.jsonl'), snapshot);

  const lines = summaryLines(snapshot);
  const sent = await sendUsage(snapshot, config);
  const apiLine = describeSendResult(sent, config.apiUrl);
  if (apiLine) lines.push(`  ${apiLine}`);

  await writeLogKeepLast(path.join(config.logsDir, 'tracker.log'), lines.join('\n') + '\n');
  const alerts = snapshot.warnings.filter((w) => w.level !== 'info');
  if (alerts.length) {
    await fs.appendFile(
      path.join(config.logsDir, 'warnings.log'),
      alerts.map((w) => `[${snapshot.fetchedAt}] ${w.level.toUpperCase()}: ${w.message}`).join('\n') + '\n',
    );
  }
  console.log(lines.join('\n'));
}

function acquireLock(logsDir) {
  const lockPath = path.join(logsDir, '.tracker.lock');
  try {
    const pid = Number(fsSync.readFileSync(lockPath, 'utf8'));
    if (pid && pid !== process.pid) {
      process.kill(pid, 0);
      console.error(`Another tracker is already running (pid ${pid}). Remove ${lockPath} if that is wrong.`);
      process.exit(1);
    }
  } catch (e) {
    if (e.code === 'EPERM') {
      console.error(`Another tracker is already running (lock ${lockPath}).`);
      process.exit(1);
    }
  }
  fsSync.writeFileSync(lockPath, String(process.pid));
  const release = () => { try { fsSync.unlinkSync(lockPath); } catch {} };
  process.on('exit', release);
}

// Retry delay after a failure: transient errors back off 1, 2, 4, 8 ... min
// (rate limits start at 5), capped at the normal interval. Errors a retry
// cannot fix (logged out, unsupported plan) wait the full interval.
function nextDelay(kind, failures, config) {
  if (!kind) return config.intervalMs;
  if (!TRANSIENT.has(kind)) return config.intervalMs;
  const base = kind === 'rate_limited' ? 5 * 60_000 : 60_000;
  const jitter = Math.random() * 10_000;
  return Math.min(config.intervalMs, base * 2 ** Math.min(failures - 1, 6) + jitter);
}

async function main() {
  const config = loadConfig();
  await fs.mkdir(config.logsDir, { recursive: true });
  if (!config.once) acquireLock(config.logsDir);

  let failures = 0;
  let timer = null;
  let stopping = false;

  const stop = () => {
    stopping = true;
    if (timer) clearTimeout(timer);
    console.log('Stopping tracker.');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const tick = async () => {
    let kind = null;
    try {
      await persist(await collect(config), config);
      failures = 0;
    } catch (err) {
      kind = err instanceof CliError ? err.kind : 'error';
      if (!(err instanceof CliError)) err.kind = 'error';
      failures += 1;
      await persist(failureSnapshot(err, config), config).catch((e) => console.error('Failed to write logs:', e.message));
    }

    if (config.once) process.exit(kind ? 1 : 0);
    if (stopping) return;
    const delay = nextDelay(kind, failures, config);
    console.log(`  next refresh in ${Math.round(delay / 1000)}s`);
    timer = setTimeout(tick, delay);
  };

  console.log(
    `Claude usage tracker: interval ${config.intervalMs / 60_000} min, logs in ${config.logsDir}`
    + (config.apiUrl ? `, API ${config.apiUrl}` : ', API disabled'),
  );
  await tick();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
