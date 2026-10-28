"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const UNAVAILABLE = "Unavailable";
const GET_USER_STATUS_PATH =
  "/exa.seat_management_pb.SeatManagementService/GetUserStatus";
const LOG_HISTORY_LIMIT = 5;
const DEFAULT_API_URL = "http://localhost:3000/api/claude-code";

function parsePositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

function envString(name, fallback) {
  if (process.env[name] === undefined) {
    return fallback;
  }
  return process.env[name].trim();
}

function resolveCredentialsPath() {
  if (process.env.DEVIN_CREDENTIALS_PATH) {
    return path.resolve(process.env.DEVIN_CREDENTIALS_PATH);
  }
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, "devin", "credentials.toml");
}

function loadConfig(rootDir) {
  const logDir = path.resolve(
    process.env.DEVIN_USAGE_LOG_DIR || path.join(rootDir, "logs")
  );
  return {
    rootDir,
    logDir,
    latestPath: path.join(logDir, "usage-latest.json"),
    jsonlPath: path.join(logDir, "usage.jsonl"),
    humanPath: path.join(logDir, "usage.log"),
    intervalMinutes: parsePositiveInt("DEVIN_USAGE_INTERVAL_MINUTES", 15),
    timeoutMs: parsePositiveInt("DEVIN_USAGE_TIMEOUT_MS", 20000),
    cliTimeoutMs: parsePositiveInt("DEVIN_CLI_TIMEOUT_MS", 20000),
    maxRetries: parsePositiveInt("DEVIN_USAGE_MAX_RETRIES", 5),
    backoffMs: parsePositiveInt("DEVIN_USAGE_BACKOFF_MS", 2000),
    maxBackoffMs: 60 * 60 * 1000,
    apiTimeoutMs: parsePositiveInt("DEVIN_USAGE_API_TIMEOUT_MS", 10000),
    apiUrl: envString("DEVIN_USAGE_API_URL", DEFAULT_API_URL),
    accountName: envString("DEVIN_ACCOUNT_NAME", ""),
    logHistoryLimit: LOG_HISTORY_LIMIT,
    devinBin: process.env.DEVIN_BIN || "devin",
    credentialsPath: resolveCredentialsPath(),
  };
}

function ensureLogDir(config) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

module.exports = {
  UNAVAILABLE,
  GET_USER_STATUS_PATH,
  LOG_HISTORY_LIMIT,
  DEFAULT_API_URL,
  loadConfig,
  ensureLogDir,
};
