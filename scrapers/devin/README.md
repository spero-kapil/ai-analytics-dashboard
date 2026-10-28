# Devin Tracker

Node.js 18+ logger for **Devin Pro** subscription usage. It reuses the local `devin auth login` session, fetches the same account quota the CLI shows, keeps the last five snapshots under `logs/`, and POSTs usage to a local API. There is no public Devin API token flow.

## What was verified on this machine

| Check | Result |
| --- | --- |
| CLI | `devin 3000.11.205`, logged in, **Plan: Pro** |
| `devin usage` subcommand | **Does not exist**. `devin --help` has no usage/quota command. |
| `devin -p "/usage"` | **Unsupported.** Print/ACP mode returns `Unknown command: /usage`. |
| Interactive `/usage` | Documented REPL slash command. Shows daily/weekly quota bars, reset times, extra-usage balance, and session ACU. Not available to `devin -p`. |
| CLI footer | Live capture: `Pro · 49% remaining (resets in 1d 18h)` |
| Account quota source | Official CLI calls Connect RPC `SeatManagementService/GetUserStatus` (same call used by `devin auth status` / doctor). Quota fields from that response matched the footer. |
| Daily session window | Devin Pro daily quota. Logged as `dailySession` (same remaining/used/reset as `daily`). |

Do not treat this as Claude Code usage. Claude Code’s five-hour window is a different product; Devin Pro uses a **daily session** plus weekly quota. Compare tracker output with **Devin CLI** (`/usage` or the footer), not Claude Code.

## Setup

Requires Node.js 18+ and a logged-in Devin CLI.

```bash
devin auth login          # if `devin auth status` is not already logged in
devin auth status         # confirm Plan: Pro
cp .env.example .env      # optional; defaults work without it
node src/index.js --once
```

No npm packages are required (`fetch` is built into Node 18+).

## Commands

```bash
node src/index.js --once      # one snapshot
node src/index.js --daemon    # refresh every 15 minutes
node src/index.js --verify    # CLI probes + live snapshot
npm run once
npm start                     # daemon
npm run verify
```

## Environment

Copy `.env.example` to `.env`. The process does not override variables already in the environment.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEVIN_USAGE_INTERVAL_MINUTES` | `15` | Daemon refresh interval |
| `DEVIN_USAGE_LOG_DIR` | `./logs` | Snapshot directory |
| `DEVIN_BIN` | `devin` | CLI executable |
| `DEVIN_CREDENTIALS_PATH` | `~/.local/share/devin/credentials.toml` | Existing CLI session file |
| `DEVIN_USAGE_TIMEOUT_MS` | `20000` | HTTP timeout |
| `DEVIN_USAGE_MAX_RETRIES` | `5` | 429 / 5xx / network retries |
| `DEVIN_USAGE_BACKOFF_MS` | `2000` | Initial backoff (doubles, cap 1h) |
| `DEVIN_CLI_TIMEOUT_MS` | `20000` | `devin` subprocess timeout |
| `DEVIN_USAGE_API_URL` | `http://localhost:3000/api/claude-code` | POST each snapshot here. Empty disables. |
| `DEVIN_ACCOUNT_NAME` | Email from `devin auth status` | Optional override for API `email_id` |
| `DEVIN_USAGE_API_TIMEOUT_MS` | `10000` | Timeout for the usage POST |

Credentials are read from the CLI’s local file and never written to logs. `email_id` comes from the `Email` line in `devin auth status` unless `DEVIN_ACCOUNT_NAME` is set.

## Log files

| File | Format |
| --- | --- |
| `logs/usage-latest.json` | Latest snapshot (pretty JSON) |
| `logs/usage.jsonl` | Last **5** snapshots + errors (JSON lines) |
| `logs/usage.log` | Last **5** human-readable records |

Each snapshot stores plan name, daily/weekly **remaining %**, **used %** (`100 - remaining`), reset timestamps, extra-usage balance, last-updated time, and `Unavailable` for fields Devin did not return.

## Reporting to the API

After each successful snapshot, the tracker POSTs JSON to `DEVIN_USAGE_API_URL`. Times are UTC in `YYYY-MM-DD HH:MM:SS`. A failed POST is logged and the local files are still written.

```json
{
  "provider": "devin",
  "email_id": "access@webspero.com",
  "plan_type": "pro",
  "data": {
    "daily": {
      "used_percent": 10,
      "reset_time": "2026-01-01 00:00:00"
    },
    "weekly": {
      "used_percent": 50,
      "reset_time": "2026-01-01 00:00:00"
    },
    "last_updated": "2026-01-01 00:00:00"
  }
}
```

Incomplete snapshots (missing CLI email, plan, or daily/weekly windows) are not posted. Set `DEVIN_USAGE_API_URL` to empty to disable.

## Confirm the numbers

1. Run `node src/index.js --verify`.
2. Open an interactive session with `devin` in any trusted directory.
3. Read the footer (`Pro · N% remaining (resets in …)`). That N is the **weekly** remaining percent on Pro.
4. Type `/usage` in the REPL. Daily and weekly bars and reset times should match `logs/usage-latest.json`.
5. Optional: Settings → Usage & limits at https://app.devin.ai/settings/usage.

Sample captures used during implementation (sanitized, no tokens) live in `samples/`.

## Error handling

- Missing CLI, expired session, or `devin auth login` required: logged, fields not invented.
- `429` / `502` / `503` / `504` / timeouts: retry with exponential backoff and `Retry-After` when present.
- Daemon: after a login/session error, retry in 5 minutes; other failures back off up to 1 hour; a successful fetch resets the interval to `DEVIN_USAGE_INTERVAL_MINUTES`.
- Unsupported print-mode `/usage`: recorded as unavailable in `--verify`; the daemon does not depend on it.
- Failed usage POST: logged; local snapshots are still written. Incomplete payloads (no CLI email / `DEVIN_ACCOUNT_NAME`, or missing daily/weekly windows) are not posted.

## Assumptions vs verified behavior

**Verified**

- No first-class `devin usage` CLI subcommand.
- `/usage` works in the interactive REPL, not in `devin -p`.
- Pro quota is daily + weekly remaining percent + unix reset times + optional overage micros.
- `GetUserStatus` is the RPC the installed CLI already uses against `api_server_url` from `credentials.toml`.

**Not assumed / not fabricated**

- No `api.devin.ai` public “get my quota” REST route.
- No five-hour session quota. The session window is daily (`dailySession` / `daily`).
- Absolute ACU totals (`acuConsumed` / `acuLimit`) are stored only when the response includes them. This Pro payload did not, so they are `Unavailable`.
- Interactive `/usage` TUI layout can change; the tracker stores the RPC fields, not a scraped progress bar.
