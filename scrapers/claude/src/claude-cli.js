import { execFile } from 'node:child_process';
import os from 'node:os';

// Errors are classified so the scheduler can decide whether retrying helps.
export class CliError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.kind = kind;
    this.details = details;
  }
}

function run(bin, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        // A neutral cwd keeps project CLAUDE.md, hooks and MCP config out of the call.
        cwd: os.tmpdir(),
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: '1' },
      },
      (err, stdout, stderr) => {
        if (!err) return resolve({ code: 0, stdout, stderr });
        if (err.code === 'ENOENT') {
          return reject(new CliError('cli_not_found', `Claude Code CLI not found ("${bin}"). Is it installed and on PATH?`));
        }
        if (err.killed || err.signal === 'SIGTERM') {
          return reject(new CliError('timeout', `"${bin} ${args.join(' ')}" timed out after ${timeoutMs} ms`));
        }
        // Non-zero exit: callers still get stdout, since `auth status` exits 1 when logged out.
        resolve({ code: typeof err.code === 'number' ? err.code : 1, stdout, stderr });
      },
    );
  });
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function getVersion({ bin, timeoutMs }) {
  const { stdout } = await run(bin, ['--version'], { timeoutMs });
  return stdout.trim() || null;
}

// `claude auth status` prints JSON. Token-like fields are never returned.
export async function getAuthStatus({ bin, timeoutMs }) {
  const { code, stdout, stderr } = await run(bin, ['auth', 'status'], { timeoutMs });
  const json = tryParseJson(stdout);
  if (!json || typeof json.loggedIn !== 'boolean') {
    throw new CliError('unsupported', '`claude auth status` did not return the expected JSON', {
      exitCode: code,
      output: sanitize((stdout || stderr).slice(0, 500)),
    });
  }
  return {
    loggedIn: json.loggedIn,
    email: json.email ?? null,
    authMethod: json.authMethod ?? null,
    apiProvider: json.apiProvider ?? null,
    subscriptionType: json.subscriptionType ?? null,
  };
}

// Runs the built-in `/usage` slash command non-interactively. It is handled
// locally by Claude Code (num_turns 0, no model call, no cost).
export async function getUsageText({ bin, timeoutMs }) {
  const args = [
    '-p', '/usage',
    '--output-format', 'json',
    '--no-session-persistence',
    '--strict-mcp-config',
  ];
  const { code, stdout, stderr } = await run(bin, args, { timeoutMs });
  const json = tryParseJson(stdout.trim().split('\n').pop() ?? '');

  if (!json) {
    const out = sanitize((stderr || stdout).slice(0, 1000));
    throw new CliError(classifyMessage(out) ?? 'cli_error', `Unexpected output from /usage (exit ${code})`, { output: out });
  }

  const result = typeof json.result === 'string' ? json.result : '';
  if (json.is_error || code !== 0) {
    const msg = sanitize(result || stderr || 'unknown error');
    throw new CliError(classifyMessage(msg) ?? 'cli_error', `/usage failed: ${msg.slice(0, 300)}`, { exitCode: code });
  }
  if (/isn't available|not available in this environment|unknown (slash )?command/i.test(result)) {
    throw new CliError('unsupported', `/usage is not supported by this Claude Code build: ${result.slice(0, 200)}`);
  }

  return { text: result, localCommand: json.local_command ?? null, numTurns: json.num_turns ?? null };
}

// Message patterns below are best-effort; the CLI does not document its error strings.
function classifyMessage(msg) {
  if (/\b429\b|rate.?limit|too many requests/i.test(msg)) return 'rate_limited';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|offline|socket hang up/i.test(msg)) return 'network';
  if (/\b401\b|\b403\b|not logged in|please (run )?.*login|log in|oauth.*(expired|invalid)|token.*expired|unauthori[sz]ed/i.test(msg)) return 'auth_required';
  return null;
}

export function sanitize(text) {
  return String(text)
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/("?(?:access|refresh)_?token"?\s*[:=]\s*)"?[^"\s,}]+"?/gi, '$1[redacted]');
}
