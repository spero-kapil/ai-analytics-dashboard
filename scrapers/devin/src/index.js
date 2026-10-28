"use strict";

const path = require("path");
const { loadProjectEnv } = require("./load-env");
const { loadConfig, UNAVAILABLE } = require("./config");
const { readCredentials } = require("./credentials");
const {
  getCliVersion,
  getAuthStatus,
  probePrintSlashCommand,
} = require("./cli");
const { getUserStatusWithRetry } = require("./fetch-usage");
const { normalizeSnapshot, formatHuman } = require("./normalize");
const { writeJsonSnapshot, writeHumanSnapshot, writeFailure } = require("./logger");
const { sendUsage, describeSendResult } = require("./report");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const flags = {
    once: false,
    daemon: false,
    verify: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--once") flags.once = true;
    else if (arg === "--daemon") flags.daemon = true;
    else if (arg === "--verify") flags.verify = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!flags.once && !flags.daemon && !flags.verify && !flags.help) {
    flags.once = true;
  }
  return flags;
}

function usage() {
  return `Usage: node src/index.js [--once|--daemon|--verify]

  --once     Fetch usage once, keep last 5 log records, POST to API (default)
  --daemon   Refresh on DEVIN_USAGE_INTERVAL_MINUTES (default 15)
  --verify   Probe CLI commands and fetch a live snapshot
`;
}

async function collectSnapshot(config, { onRetry } = {}) {
  const fetchedAt = new Date().toISOString();
  const versionInfo = await getCliVersion(config);
  const auth = await getAuthStatus(config);
  if (!auth.ok) {
    const error = new Error(auth.error);
    error.retryable = /not logged in|expired|rejected/i.test(auth.error);
    throw error;
  }

  const creds = readCredentials(config.credentialsPath);
  const payload = await getUserStatusWithRetry(
    {
      serverOrigin: creds.serverOrigin,
      apiKey: creds.apiKey,
      version: versionInfo.version,
      timeoutMs: config.timeoutMs,
    },
    {
      maxRetries: config.maxRetries,
      backoffMs: config.backoffMs,
      maxBackoffMs: config.maxBackoffMs,
      onRetry,
    }
  );

  return normalizeSnapshot({
    payload,
    auth: auth.parsed,
    cliVersion: versionInfo.version,
    fetchedAt,
  });
}

async function persistSnapshot(config, snapshot) {
  writeJsonSnapshot(config, snapshot);
  const sent = await sendUsage(snapshot, config);
  const apiLine = describeSendResult(sent, config.apiUrl);
  writeHumanSnapshot(config, snapshot, apiLine ? [apiLine] : []);
  console.log(formatHuman(snapshot));
  if (apiLine) {
    console.log(`  ${apiLine}`);
  }
  console.log(`wrote ${config.latestPath}`);
  console.log(`kept last ${config.logHistoryLimit} in ${config.jsonlPath}`);
  console.log(`kept last ${config.logHistoryLimit} in ${config.humanPath}`);
  return sent;
}

async function runOnce(config) {
  const snapshot = await collectSnapshot(config, {
    onRetry: ({ attempt, waitMs, error }) => {
      console.error(
        `retry ${attempt}: ${error.message}; waiting ${waitMs}ms`
      );
    },
  });
  await persistSnapshot(config, snapshot);
  return snapshot;
}

async function runVerify(config) {
  console.log("== CLI presence ==");
  const versionInfo = await getCliVersion(config);
  console.log(versionInfo.ok ? `devin ${versionInfo.version}` : versionInfo.error);

  console.log("\n== devin auth status ==");
  const auth = await getAuthStatus(config);
  if (auth.ok) {
    console.log(`logged in (${auth.parsed.loginMethod || UNAVAILABLE})`);
    console.log(`account=${auth.parsed.email || UNAVAILABLE} name=${auth.parsed.name || UNAVAILABLE}`);
    console.log(`plan=${auth.parsed.plan} tier=${auth.parsed.tier}`);
  } else {
    console.log(auth.error);
  }

  console.log("\n== print-mode slash commands (documented non-interactive path) ==");
  for (const command of ["/usage", "/help", "/session-stats"]) {
    const probe = await probePrintSlashCommand(config, command);
    const preview = probe.output.replace(/\s+/g, " ").slice(0, 180);
    console.log(
      `${command}: exit=${probe.exitCode} unknown=${probe.unknownCommand} ${preview}`
    );
  }

  console.log("\n== live GetUserStatus snapshot ==");
  const snapshot = await runOnce(config);
  console.log("\nCompare this weekly remaining % and reset time with:");
  console.log("  1. `devin` interactive footer:  Pro · N% remaining (resets in …)");
  console.log("  2. Interactive `/usage` panel daily/weekly bars (REPL only)");
  console.log("  3. Settings > Usage & limits at https://app.devin.ai/settings/usage");
  return snapshot;
}

async function runDaemon(config) {
  const intervalMs = config.intervalMinutes * 60 * 1000;
  console.log(
    `daemon: refresh every ${config.intervalMinutes} minute(s); logs=${config.logDir}` +
      (config.apiUrl ? `; API ${config.apiUrl}` : "; API disabled")
  );
  let delay = 0;
  let failureBackoff = config.backoffMs;
  for (;;) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      await runOnce(config);
      delay = intervalMs;
      failureBackoff = config.backoffMs;
    } catch (error) {
      const fetchedAt = new Date().toISOString();
      writeFailure(config, error, fetchedAt);
      console.error(`[${fetchedAt}] ${error.message}`);
      const expiredSession = /login|expired|rejected/i.test(error.message);
      delay = expiredSession
        ? Math.min(intervalMs, 5 * 60 * 1000)
        : Math.min(failureBackoff, config.maxBackoffMs);
      failureBackoff = Math.min(failureBackoff * 2, config.maxBackoffMs);
      console.error(`next attempt in ${Math.round(delay / 1000)}s`);
    }
  }
}

async function main() {
  loadProjectEnv(ROOT);
  const flags = parseArgs(process.argv);
  if (flags.help) {
    process.stdout.write(usage());
    return;
  }
  const config = loadConfig(ROOT);
  if (flags.verify) {
    await runVerify(config);
    return;
  }
  if (flags.daemon) {
    await runDaemon(config);
    return;
  }
  await runOnce(config);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
