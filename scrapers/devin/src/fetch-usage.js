"use strict";

const { GET_USER_STATUS_PATH } = require("./config");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function retryAfterMs(response, fallback) {
  const header = response.headers.get("retry-after");
  if (!header) {
    return fallback;
  }
  const asInt = Number.parseInt(header, 10);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return asInt * 1000;
  }
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return fallback;
}

async function getUserStatusOnce({ serverOrigin, apiKey, version, timeoutMs }) {
  const url = `${serverOrigin}${GET_USER_STATUS_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Connect-Protocol-Version": "1",
        "User-Agent": `devin-tracker/${version || "unknown"}`,
      },
      body: JSON.stringify({
        metadata: {
          apiKey,
          ideName: "devin",
          ideVersion: version || "unknown",
          extensionName: "devin",
          extensionVersion: version || "unknown",
          locale: "en",
        },
      }),
    });

    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      const error = new Error(
        "Devin session expired or was rejected. Run: devin auth login"
      );
      error.status = response.status;
      error.retryable = false;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(
        `GetUserStatus HTTP ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`
      );
      error.status = response.status;
      error.retryable = isRetryableStatus(response.status);
      error.retryAfterMs = retryAfterMs(response, null);
      throw error;
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("GetUserStatus returned non-JSON");
    }
    return payload;
  } catch (error) {
    if (error && error.name === "AbortError") {
      const timeout = new Error(`GetUserStatus timed out after ${timeoutMs}ms`);
      timeout.retryable = true;
      throw timeout;
    }
    if (error && error.retryable !== undefined) {
      throw error;
    }
    const wrapped = new Error(error.message || "GetUserStatus network error");
    wrapped.retryable = true;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

async function getUserStatusWithRetry(options, { maxRetries, backoffMs, maxBackoffMs, onRetry }) {
  let delay = backoffMs;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await getUserStatusOnce(options);
    } catch (error) {
      lastError = error;
      const retryable = Boolean(error && error.retryable) && attempt < maxRetries;
      if (!retryable) {
        throw error;
      }
      const wait = error.retryAfterMs != null ? error.retryAfterMs : delay;
      if (onRetry) {
        onRetry({ attempt: attempt + 1, waitMs: wait, error });
      }
      await sleep(wait);
      delay = Math.min(delay * 2, maxBackoffMs);
    }
  }
  throw lastError;
}

module.exports = { getUserStatusOnce, getUserStatusWithRetry };
