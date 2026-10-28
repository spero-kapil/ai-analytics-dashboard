# Claude usage tracker

Polls your **Claude Pro/Max plan limits** (5-hour session and weekly) through the Claude Code CLI and logs them locally. It does not track API token usage and does not estimate anything. Every value comes from Claude Code's own `/usage` output, and any field the CLI doesn't print is recorded as `null` and shown as `Unavailable`.

## How it works (verified interfaces only)

| Step | Command | Status |
| --- | --- | --- |
| Login check | `claude auth status` | Listed in `claude --help`. Prints JSON with `loggedIn`, `authMethod`, `subscriptionType`, and exits with code 1 when logged out. |
| Plan limits | `claude -p "/usage" --output-format json --no-session-persistence --strict-mcp-config` | The built-in `/usage` slash command run non-interactively. It is handled locally (`"num_turns":0`, `"total_cost_usd":0`, `"local_command":"usage"`), so it uses none of your quota. |

Both were verified against Claude Code **2.1.308** on a Pro account.

There is **no** `claude usage` subcommand. `/status` returns "isn't available in this environment" in print mode.

The tracker reuses your existing Claude Code login by calling the CLI. It never reads `~/.claude/.credentials.json` and never sees tokens. From `auth status` it logs only the account email, the plan type (`subscriptionType`), the auth method and the API provider. The org ID is not logged.

### What is verified and what is assumed

- **Verified:** the `/usage` text contains lines such as `Current session: 71% used · resets Oct 22, 9:10pm (Asia/Kolkata)` and `Current week (all models): 24% used · resets Oct 29, 10:30am (Asia/Kolkata)`.
- **Verified:** when logged out, `/usage` exits 0 and prints only a cost summary with no limit lines. The tracker flags this as `auth_required` (via `auth status`) or `no_subscription_data`.
- **Not a documented schema:** the `/usage` text is meant for humans, so the parser is tolerant. Any line it can't match is skipped, never guessed. If Anthropic changes the wording, values become `Unavailable` and `logs/last-usage-raw.txt` shows the raw text.
- **Assumed:** Max-plan extra lines such as `Current week (Sonnet only): …`. These are captured generically under `otherWindows` but were not observed on this Pro account.
- **Assumed:** error message wording for network, 429 and expired-token failures. The CLI doesn't document these, so classification is best-effort. The raw message is always stored.
- **Derived:** `remainingPercent` is computed as `100 - usedPercent`. `resetsAt` (ISO UTC) is converted from the printed local time and time zone. The printed text omits the year, so the next future occurrence is used. The original string is kept as `resetsAtRaw`.

The documented [status line JSON](https://code.claude.com/docs/en/statusline) also exposes `rate_limits.five_hour` and `rate_limits.seven_day`. However, it is only populated inside an active interactive session, after an API response. That makes it unsuitable for a standalone 15-minute poller, so it isn't used here.

## Setup

Requirements: Node.js 18 or newer, plus Claude Code installed and logged in with a Pro or Max account. There are no npm dependencies.

```bash
claude --version        # Claude Code is on PATH
claude auth status      # expect "loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "pro" or "max"
cd /var/www/Projects/Extensions/Claude-Tracker
npm test                # offline tests, no CLI calls
npm run once            # one live fetch
npm start               # refresh every 15 minutes until Ctrl+C
```

If you're logged out, run `claude auth login` yourself. The tracker never handles credentials.

## Options

| Flag | Env var | Default |
| --- | --- | --- |
| `--interval <min>` | `CLAUDE_USAGE_INTERVAL_MIN` | `15` (minimum 1) |
| `--logs-dir <dir>` | `CLAUDE_USAGE_LOGS_DIR` | `./logs` |
| `--warn <pct>` | `CLAUDE_USAGE_WARN_PCT` | `80` |
| `--critical <pct>` | `CLAUDE_USAGE_CRITICAL_PCT` | `95` |
| `--claude-bin <path>` | `CLAUDE_BIN` | `claude` |
| `--timeout <sec>` | `CLAUDE_USAGE_TIMEOUT_SEC` | `60` |
| `--api-url <url>` | `CLAUDE_USAGE_API_URL` | `http://localhost:3000/api/claude-code` |
| `--no-api` | | Skip the usage POST |
| `--once` | | Fetch once, then exit with 0 if usage was captured and 1 otherwise |
| `--parse-file <file>` | | Parse saved `/usage` text offline |

Copy `.env.example` to `.env` to set the env vars locally. The tracker loads `.env` on startup. CLI flags override the environment; a variable already set in the shell is not overwritten by `.env`.

## Output files (`logs/`)

| File | Contents |
| --- | --- |
| `usage-latest.json` | Most recent snapshot, written atomically |
| `usage-history.jsonl` | Last 5 snapshots (older records are dropped) |
| `tracker.log` | Last 5 human-readable summaries |
| `warnings.log` | Only threshold crossings (`warning`, `critical`, `limit_reached`) |
| `last-usage-raw.txt` | Raw `/usage` text from the last successful CLI call, for comparing values |

Sample `usage-latest.json` from a real run:

```json
{
  "fetchedAt": "2026-10-22T12:05:06.556Z",
  "status": "ok",
  "source": "claude -p /usage",
  "claudeVersion": "2.1.308 (Claude Code)",
  "auth": { "loggedIn": true, "email": "access@webspero.com", "authMethod": "claude.ai", "apiProvider": "firstParty", "subscriptionType": "pro" },
  "fiveHour": {
    "key": "five_hour", "label": "Current session",
    "usedPercent": 71, "remainingPercent": 29,
    "resetsAtRaw": "Oct 22, 9:10pm (Asia/Kolkata)", "resetsAt": "2026-10-22T15:40:00.000Z"
  },
  "weekly": {
    "key": "weekly_all", "label": "Current week (all models)",
    "usedPercent": 24, "remainingPercent": 76,
    "resetsAtRaw": "Oct 29, 10:30am (Asia/Kolkata)", "resetsAt": "2026-10-29T05:00:00.000Z"
  },
  "otherWindows": [],
  "billingNote": "You are currently using your subscription to power your Claude Code usage",
  "warnings": [],
  "error": null
}
```

`status` takes one of these values: `ok`, `auth_required`, `no_subscription_data`, `unsupported`, `network`, `rate_limited`, `timeout`, `cli_error`, `cli_not_found`, or `error`. When it isn't `ok`, the usage fields are `null` and `error.message` explains why.

## Reporting to the API

After each successful snapshot, the tracker POSTs JSON to `CLAUDE_USAGE_API_URL` (default `http://localhost:3000/api/claude-code`). Times are UTC in `YYYY-MM-DD HH:MM:SS`. A failed POST is logged and the local files are still written; `--once` still exits 0 if usage was captured.

```json
{
  "provider": "claude",
  "email_id": "user@example.com",
  "plan_type": "pro",
  "data": {
    "fiveHour": {
      "used_percent": 71,
      "reset_time": "2026-10-22 15:40:00"
    },
    "weekly": {
      "used_percent": 24,
      "reset_time": "2026-10-29 05:00:00"
    },
    "last_updated": "2026-10-22 12:05:06"
  }
}
```

Incomplete snapshots (logged out, missing windows, or unparseable reset times) are not posted. Use `--no-api` or set `CLAUDE_USAGE_API_URL` to empty to disable.

## Refresh and error recovery

- On success, the next refresh happens after the configured interval.
- On network, timeout or CLI errors, it retries with exponential backoff (1, 2, 4, 8 … minutes, plus jitter), capped at the interval. Rate-limit errors start the backoff at 5 minutes.
- If you're logged out or your plan has no limits, it waits the full interval, because an immediate retry can't fix that. It recovers on its own once you log in again.
- Each CLI call has a timeout, so a hung CLI can't stall the loop.
- A lock file (`logs/.tracker.lock`) prevents two trackers from running at once. `SIGINT` and `SIGTERM` stop it cleanly.

To keep it running in the background:

```bash
nohup npm start >/dev/null 2>&1 &
```

## Verifying the values

1. Look at the CLI's own output:
   ```bash
   claude -p "/usage"
   ```
   Or, in an interactive `claude` session, type `/usage`. The same numbers also appear at <https://claude.ai/settings/usage>.
2. Fetch with the tracker:
   ```bash
   npm run once
   ```
3. Check that `usedPercent` and `resetsAtRaw` in `logs/usage-latest.json` match step 1 exactly. `logs/last-usage-raw.txt` is the exact text that was parsed.
4. Check the reset conversion:
   ```bash
   node -e "console.log(new Date(require('./logs/usage-latest.json').fiveHour.resetsAt).toString())"
   ```
   It should print the same local time that `/usage` shows.

The numbers can drift slightly between a fetch and a later manual check if you use Claude in between.

## Tests

`npm test` runs two groups of tests, entirely offline:

- **Parser tests** (`test/parse-usage.test.js`) use fixtures. Files named `real-*` were captured from the live CLI. Files named `synthetic-*` are hand-written edge cases: time-only reset, year rollover, 100% used, per-model weekly lines, and a missing reset time.
- **End-to-end tests** (`test/tracker.test.js`) run the tracker against `test/fake-claude.mjs`, a stand-in binary. They cover success, warning thresholds, logged out, no plan data, unsupported command, network error, 429, timeout, and a missing binary.

To parse a saved output by hand:

```bash
node src/tracker.js --parse-file test/fixtures/real-pro-usage.txt --logs-dir /tmp/cut-logs
```
