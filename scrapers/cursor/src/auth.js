/**
 * Cross-platform resolution of the Cursor web session token.
 *
 * A personal Cursor API key (crsr_...) only reaches the Agent API
 * (api.cursor.com/v1/*). It CANNOT read usage/spend -- those endpoints reject
 * it with "Invalid Team API Key". The data the web dashboard shows comes from
 * cursor.com/api/* and is gated by a WorkOS session cookie
 * (WorkosCursorSessionToken), not the API key.
 *
 * The Cursor app/CLI stores that session JWT locally. We read it from whichever
 * of these is available, in priority order (all are local-only; nothing is sent
 * anywhere except cursor.com):
 *
 * 1. $CURSOR_SESSION_TOKEN -- explicit override (raw JWT, or full sub::jwt).
 * 2. macOS Keychain service cursor-access-token (used by cursor-agent).
 * 3. OS keyring via secret-tool (Linux Secret Service).
 * 4. The Cursor IDE SQLite state DB (state.vscdb -> cursorAuth/accessToken),
 *    whose layout is identical on macOS, Linux and Windows.
 *
 * The dashboard cookie value is <workos_sub>::<jwt>; sub is the sub claim of
 * the JWT, so we can derive the whole cookie from just the token.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const KEYCHAIN_SERVICE = "cursor-access-token";
export const KEYCHAIN_ACCOUNT = "cursor-user";

export class SessionNotFound extends Error {
  constructor(message) {
    super(message);
    this.name = "SessionNotFound";
  }
}

export function jwtClaims(token) {
  try {
    const payload = String(token).split(".")[1];
    if (!payload) return {};
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/**
 * Return the cookie id from a token's `sub` claim, or null.
 *
 * WorkOS subjects look like `<connection>|<user_id>` (e.g.
 * `github|user_01ABC...`). The dashboard cookie wants the bare `user_...`
 * part (what `/api/auth/me` reports as `sub`), so strip any connection
 * prefix before the last `|`.
 */
export function cookieId(claims) {
  const sub = claims?.sub;
  return sub ? String(sub).split("|").pop() : null;
}

function fromEnv() {
  return process.env.CURSOR_SESSION_TOKEN || null;
}

function fromMacosKeychain() {
  if (process.platform !== "darwin") return null;
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

function fromKeyring() {
  if (process.platform !== "linux") return null;
  try {
    const out = execFileSync(
      "secret-tool",
      ["lookup", "service", KEYCHAIN_SERVICE, "username", KEYCHAIN_ACCOUNT],
      { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

export function stateDbCandidates() {
  const home = homedir();
  let base;
  if (process.platform === "darwin") {
    base = join(home, "Library", "Application Support");
  } else if (process.platform === "win32") {
    base = process.env.APPDATA || join(home, "AppData", "Roaming");
  } else {
    base = process.env.XDG_CONFIG_HOME || join(home, ".config");
  }
  return ["Cursor", "Cursor Nightly"].map((app) =>
    join(base, app, "User", "globalStorage", "state.vscdb"),
  );
}

function normalizeToken(value) {
  if (value == null || value === "") return null;
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  const s = String(value).trim().replace(/^"+|"+$/g, "");
  return s || null;
}

function readTokenWithNodeSqlite(dbPath) {
  return import("node:sqlite")
    .then(({ DatabaseSync }) => {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const row = db
          .prepare("SELECT value FROM ItemTable WHERE key = ?")
          .get("cursorAuth/accessToken");
        return normalizeToken(row?.value);
      } finally {
        db.close();
      }
    })
    .catch(() => null);
}

function readTokenWithSqliteCli(dbPath) {
  try {
    const out = execFileSync(
      "sqlite3",
      [
        "-readonly",
        dbPath,
        "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken';",
      ],
      { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    return normalizeToken(out);
  } catch {
    return null;
  }
}

function fromStateDb() {
  for (const dbPath of stateDbCandidates()) {
    if (!existsSync(dbPath)) continue;
    try {
      const cli = readTokenWithSqliteCli(dbPath);
      if (cli) return cli;
    } catch {
      // try the builtin driver next
    }
  }
  return null;
}

async function fromStateDbAsync() {
  for (const dbPath of stateDbCandidates()) {
    if (!existsSync(dbPath)) continue;
    const fromNode = await readTokenWithNodeSqlite(dbPath);
    if (fromNode) return fromNode;
    const fromCli = readTokenWithSqliteCli(dbPath);
    if (fromCli) return fromCli;
  }
  return null;
}

const LOCAL_SOURCES = [
  ["macOS keychain", fromMacosKeychain],
  ["OS keyring", fromKeyring],
  ["Cursor state DB", fromStateDb],
];

function log(verbose, name) {
  if (verbose) {
    process.stderr.write(`[auth] using session from ${name}\n`);
  }
}

function cookieFromToken(token) {
  const cleaned = String(token).trim().replaceAll("%3A%3A", "::");
  if (cleaned.includes("::")) return { cookie: cleaned, claims: null };
  const claims = jwtClaims(cleaned);
  const cid = cookieId(claims);
  if (!cid) return { cookie: null, claims };
  return { cookie: `${cid}::${cleaned}`, claims };
}

/**
 * Return `<id>::<jwt>` suitable for the dashboard cookie.
 *
 * Only a WorkOS session token authenticates the dashboard; an
 * api_key_token (which cursor-agent may store in the keychain) returns
 * HTTP 204 and is skipped. Throws SessionNotFound if none is found.
 */
export async function resolveCookieValue(verbose = false) {
  const env = fromEnv();
  if (env) {
    const { cookie } = cookieFromToken(env);
    if (cookie) {
      log(verbose, "$CURSOR_SESSION_TOKEN");
      return cookie;
    }
  }

  const tried = ["$CURSOR_SESSION_TOKEN"];
  let sawApiKey = false;

  for (const [name, source] of LOCAL_SOURCES) {
    tried.push(name);
    let token = source();
    if (name === "Cursor state DB" && !token) {
      token = await fromStateDbAsync();
    }
    if (!token) continue;
    const { cookie, claims } = cookieFromToken(token);
    if (!cookie) continue;
    if (claims && claims.type === "api_key_token") {
      sawApiKey = true;
      continue;
    }
    log(verbose, name);
    return cookie;
  }

  let hint = "";
  if (sawApiKey) {
    hint =
      "\nNote: found an api_key_token (Agent API), but that does not " +
      "authenticate the\nusage dashboard. A *web session* is needed.";
  }
  throw new SessionNotFound(
    "Could not find a usable Cursor session token.\n" +
      `Tried: ${tried.join(", ")}.${hint}\n\n` +
      "Fix one of:\n" +
      "  - Sign in via the Cursor app (this stores a web session), or\n" +
      "  - Set CURSOR_SESSION_TOKEN to your WorkosCursorSessionToken cookie\n" +
      "    (cursor.com -> DevTools -> Application -> Cookies).",
  );
}
