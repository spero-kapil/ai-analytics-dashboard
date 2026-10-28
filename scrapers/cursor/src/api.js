/**
 * Minimal client for Cursor dashboard monthly usage (Node stdlib only).
 *
 * Endpoints used (all on https://cursor.com):
 *   GET  /api/auth/me
 *   POST /api/dashboard/get-current-period-usage
 *   GET  /api/usage-summary
 *
 * Auth is the WorkosCursorSessionToken cookie, value <sub>::<jwt>
 * (the :: is sent URL-encoded as %3A%3A). State-changing POSTs need
 * Origin: https://cursor.com (CSRF guard).
 */

export const BASE = "https://cursor.com";
export const USER_AGENT = "cursor-tracker/1.0.0";

export class CursorAPIError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${String(body).slice(0, 300)}`);
    this.name = "CursorAPIError";
    this.status = status;
    this.body = body;
  }
}

export class CursorClient {
  constructor(cookieValue, timeout = 30) {
    this._cookie =
      "WorkosCursorSessionToken=" + String(cookieValue).replaceAll("::", "%3A%3A");
    this._timeout = timeout;
  }

  async _request(path, method = "GET", body = null) {
    const headers = {
      Cookie: this._cookie,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };
    const init = {
      method,
      headers,
      signal: AbortSignal.timeout(this._timeout * 1000),
    };
    if (body != null) {
      init.body = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
      headers.Origin = BASE;
    }
    let res;
    try {
      res = await fetch(BASE + path, init);
    } catch (err) {
      const wrapped = new Error(err?.message || String(err));
      wrapped.cause = err;
      wrapped.code = err?.code || err?.cause?.code;
      wrapped.kind = "network";
      throw wrapped;
    }
    const raw = await res.text();
    if (!res.ok) throw new CursorAPIError(res.status, raw);
    if (!raw) return {};
    return JSON.parse(raw);
  }

  me() {
    return this._request("/api/auth/me");
  }

  currentPeriodUsage() {
    return this._request("/api/dashboard/get-current-period-usage", "POST", {});
  }

  usageSummary() {
    return this._request("/api/usage-summary");
  }
}
