# GPT Tracker

Node.js CLI that reads **ChatGPT subscription usage limits** from the local Codex login session and writes them under `logs/`.

This is not OpenAI API token usage (`platform.openai.com/usage`). It is the ChatGPT-plan allowance that Codex reports for the signed-in account.

## What is actually available

Checked against `codex-cli` 0.164.0 (`codex --help`, `codex login --help`, `codex exec --help`, `codex app-server --help`) and the generated app-server schema (`codex app-server generate-json-schema --experimental`).

| Surface | Result |
| --- | --- |
| `codex usage` / `codex status` subcommands | **Do not exist** |
| Interactive TUI `/status` | Shows remaining limits, but only inside an active session |
| Interactive TUI `/usage` | Token activity / reset redemption, not a scriptable quota command |
| `codex login status` | Reports the saved ChatGPT login. Used to reuse the existing session |
| `codex app-server` JSON-RPC `account/read` | Account type, ChatGPT `planType`, and email |
| `codex app-server` JSON-RPC `account/rateLimits/read` | **Verified live path** for used %, window length, and reset time |

Official docs: [Codex pricing](https://developers.openai.com/codex/pricing/) (`/status` in an active CLI session), [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan-usage-limits-and-troubleshooting), [Codex app-server](https://learn.chatgpt.com/docs/app-server) (`account/rateLimits/read`).

The script never reads `~/.codex/auth.json`, never prints tokens, and never calls undocumented ChatGPT HTTP APIs.

Missing fields are stored as `"Unavailable"`. Values are not estimated.

This logger records daily (`windowDurationMins` ≈ 1440), weekly (≈ 10080), and monthly (about 28–32 days) windows. Five-hour windows are ignored.

## Requirements

- Node.js 18+
- Codex CLI on `PATH` (`codex --version`)
- An existing ChatGPT login (`codex login status` should say you are logged in using ChatGPT)

No npm dependencies.

## Setup

```bash
cd /var/www/Projects/Extensions/GPT-Tracker
node -v          # v18 or newer
codex --version
codex login status
```

If login is expired, run `codex login` yourself in a terminal. This project will not ask for a password or token.

## Commands

```bash
# One-shot fetch into logs/
node src/track-usage.js once

# Same, as JSON on stdout
node src/track-usage.js once --json

# Refresh every 15 minutes (default)
node src/track-usage.js watch

# Custom interval
node src/track-usage.js watch --interval-minutes 15

# Check CLI, login, and a live fetch
node src/track-usage.js verify

# POST to a specific endpoint
node src/track-usage.js once --api-url http://localhost:3000/api/chat-gpt

# Write logs without POSTing
node src/track-usage.js once --skip-api
```

Equivalent npm scripts: `npm run once`, `npm start` (watch), `npm run verify`.

Configurable variables are listed in `example.env`. Copy it to `.env` in the project root:

```bash
cp example.env .env
```

The script loads `.env` automatically. Existing shell environment values and CLI flags take precedence.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GPT_TRACKER_INTERVAL_MINUTES` | `15` | Watch refresh interval |
| `GPT_TRACKER_LOG_DIR` | `./logs` | Log output directory |
| `GPT_TRACKER_LOG_MAX_RECORDS` | `5` | Max snapshots kept in `usage.jsonl` and `usage.log` |
| `GPT_TRACKER_CODEX_BIN` | `codex` | Codex CLI binary |
| `GPT_TRACKER_API_URL` | `http://localhost:3000/api/chat-gpt` | One or more POST endpoints, comma-separated |
| `GPT_TRACKER_API_TIMEOUT_MS` | `10000` | API request timeout |

## Log files

All writes go to `logs/`:

| File | Contents |
| --- | --- |
| `logs/latest.json` | Newest snapshot (pretty-printed) |
| `logs/usage.jsonl` | Last 5 snapshots, one JSON object per line |
| `logs/usage.log` | Last 5 one-line human summaries |

Older history is dropped on each write so those two files never grow past `GPT_TRACKER_LOG_MAX_RECORDS`.

## API integration

After each successful fetch with an `email_id`, the script POSTs JSON to `GPT_TRACKER_API_URL` (or `--api-url`). Local logging still happens if the request fails.

`data` includes only the periods Codex actually reported. Each period has `reset_time` and `used_percent`. Times are UTC `YYYY-MM-DD HH:mm:ss`. The payload is validated before POST so a missing or extra period is not sent.

```json
{
  "provider": "chatgpt",
  "email_id": "test@example.com",
  "plan_type": "team",
  "data": {
    "last_updated": "2025-12-31 12:30:00",
    "daily": {
      "reset_time": "2026-10-27 08:00:00",
      "used_percent": 30
    },
    "weekly": {
      "reset_time": "2026-11-01 08:00:00",
      "used_percent": 15
    },
    "monthly": {
      "reset_time": "2026-11-01 08:00:00",
      "used_percent": 10
    }
  }
}
```

Use `--skip-api` to write logs without posting.

Each snapshot includes last-updated time (`loggedAt`), username, `email_id`, plan type, weekly used %, remaining %, reset Unix timestamp, reset ISO time, and `"Unavailable"` for any field the backend omitted.

## Verify against ChatGPT

1. Run `node src/track-usage.js once --json`
2. In Codex CLI, start a session and type `/status`
3. In ChatGPT, open **Settings → Usage** (or the Codex usage dashboard)

The weekly used %, reset time, and account email should match ChatGPT Settings → Usage.

## Fixture testing (no network)

Sample payloads live in `samples/` and match the documented `account/rateLimits/read` shape:

```bash
node src/track-usage.js once --fixture samples/rate-limits-ok.json --json --skip-api
node src/track-usage.js once --fixture samples/rate-limits-weekly-only.json --json --skip-api
node src/track-usage.js once --fixture samples/rate-limits-free-monthly.json --json --skip-api
node src/track-usage.js once --fixture samples/rate-limits-all-periods.json --json --skip-api
node src/track-usage.js once --fixture samples/rate-limits-missing.json --json --skip-api
```

Expected:

- `rate-limits-ok.json` → weekly 40% used / 60% remaining, `email_id=user@example.com`
- `rate-limits-weekly-only.json` → weekly 12% used, `email_id=user@example.com`
- `rate-limits-free-monthly.json` → monthly 55% used, `plan_type=free`
- `rate-limits-all-periods.json` → daily 30%, weekly 15%, monthly 10%
- `rate-limits-missing.json` → weekly `Unavailable`

## Error handling

| Condition | Log status | Notes |
| --- | --- | --- |
| Expired / missing ChatGPT login | `error` / `session_expired` | Fields are `Unavailable` |
| API-key login instead of ChatGPT | `unavailable` | Not subscription usage |
| Network / timeout | `error` / `network` or `timeout` | Watch mode retries with backoff |
| JSON-RPC method missing | `unavailable` / `unsupported_method` | Older Codex builds |
| Rate limit / 429 | `error` / `rate_limited` | Watch mode waits longer before retry |

Watch mode keeps running after failures. Successful fetches reset the backoff. Default interval is 15 minutes.

## Rate-limit JSON shape (from Codex docs)

```json
{
  "method": "account/rateLimits/read",
  "id": 6
}
```

Documented result fields used here:

- `rateLimits.primary` / `rateLimits.secondary`: `usedPercent`, `windowDurationMins`, `resetsAt`
- `rateLimitsByLimitId`: per-bucket copy of the same windows
- `windowDurationMins` ≈ 1440 → daily window
- `windowDurationMins` ≈ 10080 → weekly window
- `windowDurationMins` ≈ 28–32 days → monthly window
- `resetsAt` is Unix seconds
