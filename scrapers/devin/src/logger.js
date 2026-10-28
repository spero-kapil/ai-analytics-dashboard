"use strict";

const fs = require("fs");
const { ensureLogDir, LOG_HISTORY_LIMIT } = require("./config");
const { formatHuman } = require("./normalize");

function atomicWrite(filePath, contents) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function writeJsonlKeepLast(filePath, record, limit = LOG_HISTORY_LIMIT) {
  const existing = readText(filePath)
    .split(/\r?\n/)
    .filter((line) => line.trim());
  existing.push(JSON.stringify(record));
  atomicWrite(filePath, `${existing.slice(-limit).join("\n")}\n`);
}

function writeLogKeepLast(filePath, block, limit = LOG_HISTORY_LIMIT) {
  const existing = readText(filePath)
    .split(/(?=^\[\d{4}-\d{2}-\d{2}T)/m)
    .filter((part) => part.trim());
  existing.push(block.endsWith("\n") ? block : `${block}\n`);
  atomicWrite(filePath, existing.slice(-limit).join(""));
}

function humanBlock(snapshot, extraLines = []) {
  const lines = [formatHuman(snapshot)];
  for (const line of extraLines) {
    if (!line) {
      continue;
    }
    lines.push(line.startsWith("  ") ? line : `  ${line}`);
  }
  return `${lines.join("\n")}\n\n`;
}

function writeJsonSnapshot(config, snapshot) {
  ensureLogDir(config);
  atomicWrite(config.latestPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  writeJsonlKeepLast(config.jsonlPath, snapshot, config.logHistoryLimit);
}

function writeHumanSnapshot(config, snapshot, extraLines = []) {
  ensureLogDir(config);
  writeLogKeepLast(
    config.humanPath,
    humanBlock(snapshot, extraLines),
    config.logHistoryLimit
  );
}

function writeSnapshot(config, snapshot, extraLines = []) {
  writeJsonSnapshot(config, snapshot);
  writeHumanSnapshot(config, snapshot, extraLines);
}

function writeFailure(config, error, fetchedAt) {
  ensureLogDir(config);
  const record = {
    lastUpdated: fetchedAt,
    status: "error",
    error: error.message || String(error),
    retryable: Boolean(error.retryable),
    httpStatus: error.status || null,
  };
  writeJsonlKeepLast(config.jsonlPath, record, config.logHistoryLimit);
  writeLogKeepLast(
    config.humanPath,
    `[${fetchedAt}] ERROR ${record.error}\n\n`,
    config.logHistoryLimit
  );
  return record;
}

module.exports = {
  writeSnapshot,
  writeJsonSnapshot,
  writeHumanSnapshot,
  writeFailure,
  writeJsonlKeepLast,
  writeLogKeepLast,
};
