"use strict";

const fs = require("fs");
const path = require("path");

function expandEnvVars(value, env) {
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced, bare) => {
      const name = braced || bare;
      if (env[name] !== undefined) return env[name];
      if (process.env[name] !== undefined) return process.env[name];
      return match;
    }
  );
}

function loadEnvFile(filePath, env = process.env) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = body.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = body.slice(0, eq).trim();
    if (env[key] !== undefined) {
      continue;
    }
    let value = body.slice(eq + 1).trim();
    const singleQuoted = value.startsWith("'") && value.endsWith("'") && value.length >= 2;
    const doubleQuoted = value.startsWith('"') && value.endsWith('"') && value.length >= 2;
    if (singleQuoted || doubleQuoted) {
      value = value.slice(1, -1);
    }
    if (!singleQuoted) {
      value = expandEnvVars(value, env);
    }
    env[key] = value;
  }
}

function loadProjectEnv(rootDir) {
  loadEnvFile(path.join(rootDir, ".env"));
}

module.exports = { loadProjectEnv, loadEnvFile };
