"use strict";

const { spawn } = require("child_process");

function runDevin(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: `Timed out after ${timeoutMs}ms: ${bin} ${args.join(" ")}`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: error.code === "ENOENT"
          ? `Devin CLI not found (${bin}). Install it and ensure it is on PATH.`
          : error.message,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        code,
        stdout,
        stderr,
        error: code === 0 ? null : `Command failed with exit ${code}`,
      });
    });
  });
}

function parseAuthStatus(text) {
  const field = (label) => {
    const match = text.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "m"));
    return match ? match[1].trim() : null;
  };
  const loggedIn = /^Logged in\b/m.test(text);
  return {
    loggedIn,
    loginMethod: (text.match(/^Logged in \((.+)\)\./m) || [])[1] || null,
    apiServer: field("API server"),
    name: field("Name"),
    email: field("Email"),
    plan: field("Plan"),
    tier: field("Tier"),
    enterprise: field("Enterprise"),
    fetchedAt: field("Fetched at"),
    raw: text.trim(),
  };
}

async function getCliVersion(config) {
  const result = await runDevin(config.devinBin, ["--version"], config.cliTimeoutMs);
  const combined = `${result.stdout}\n${result.stderr}`;
  const match = combined.match(/(\d+(?:\.\d+)+)/);
  return {
    ok: result.ok,
    version: match ? match[1] : null,
    error: result.error,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

async function getAuthStatus(config) {
  const result = await runDevin(config.devinBin, ["auth", "status"], config.cliTimeoutMs);
  const text = `${result.stdout}\n${result.stderr}`;
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || text.trim() || "devin auth status failed",
      parsed: parseAuthStatus(text),
    };
  }
  const parsed = parseAuthStatus(result.stdout);
  if (!parsed.loggedIn) {
    return {
      ok: false,
      error: "Devin CLI session is not logged in. Run: devin auth login",
      parsed,
    };
  }
  return { ok: true, error: null, parsed };
}

async function probePrintSlashCommand(config, command) {
  const result = await runDevin(
    config.devinBin,
    ["-p", command, "--respect-workspace-trust", "false", "--verbosity", "0"],
    config.cliTimeoutMs
  );
  const text = `${result.stdout}\n${result.stderr}`.trim();
  return {
    command,
    exitCode: result.code,
    output: text,
    unknownCommand: /Unknown command:/i.test(text),
  };
}

module.exports = {
  runDevin,
  parseAuthStatus,
  getCliVersion,
  getAuthStatus,
  probePrintSlashCommand,
};
