"use strict";

const fs = require("fs");
const { URL } = require("url");

function parseSimpleToml(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readCredentials(credentialsPath) {
  let text;
  try {
    text = fs.readFileSync(credentialsPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(
        `Devin credentials not found at ${credentialsPath}. Run: devin auth login`
      );
    }
    throw new Error(`Could not read Devin credentials: ${error.message}`);
  }

  const data = parseSimpleToml(text);
  const apiKey = data.windsurf_api_key;
  const apiServerUrl = data.api_server_url;
  if (!apiKey) {
    throw new Error("Devin credentials file has no windsurf_api_key. Run: devin auth login");
  }
  if (!apiServerUrl) {
    throw new Error("Devin credentials file has no api_server_url. Run: devin auth login");
  }

  let parsed;
  try {
    parsed = new URL(apiServerUrl);
  } catch {
    throw new Error("Devin credentials api_server_url is not a valid URL");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("Devin credentials api_server_url must be a plain https origin");
  }

  return {
    apiKey,
    serverOrigin: `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "")}`,
  };
}

module.exports = { readCredentials };
