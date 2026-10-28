# Cursor Tracker

Node.js CLI that reads **Cursor monthly billing-cycle usage** from the local Cursor login session, writes it under `logs/`, and POSTs it to the backend.

This is not Agent API usage (`api.cursor.com`). A personal Cursor API key (`crsr_…`) cannot read spend. Monthly limits come from `cursor.com` using the same web session the Cursor app already has.

## What is actually available

| Surface | Result |
| --- | --- |
| Cursor usage CLI / `crsr_` API key | **Cannot** read usage or spend |
| Interactive dashboard at cursor.com | Shows monthly cycle % used, split into Composer / Auto vs other models |
| `GET /api/auth/me` | Account email and id for the saved session |
| `POST /api/dashboard/get-current-period-usage` | **Verified live path** for monthly used % (`autoPercentUsed`, `apiPercentUsed`) and billing-cycle reset |
| `GET /api/usage-summary` | Fallback cycle-limits payload (includes `membershipType`) |

The script never prints the session token. Missing fields are stored as `"Unavailable"`. Values are not estimated.

This logger records the **monthly** billing window only: **Cursor Models** (`autoPercentUsed`) and **other models** (`apiPercentUsed`). Per-event logs, CSV export, and per-model spend totals are out of scope.

## Requirements

- Node.js 18+
- A Cursor web session on this machine (`CURSOR_SESSION_TOKEN`, or a signed-in Cursor app)

No npm dependencies. Reading the Cursor app's `state.vscdb` uses Node's built-in SQLite (Node 22.5+) or a `sqlite3` CLI on `PATH`.

## Setup

```bash
cd scrapers/cursor
node -v          # v18 or newer
cp example.env .env
```

If you are already signed in to the Cursor app, that session is enough. Otherwise set `CURSOR_SESSION_TOKEN` to the `WorkosCursorSessionToken` cookie from cursor.com (DevTools → Application → Cookies).

The tracker will not ask for a password or API key.

## Commands

```bash
# One-shot fetch into logs/ and POST to the backend
node src/track-usage.js once

# Same, as JSON on stdout
node src/track-usage.js once --json

# Refresh every 15 minutes (default)
node src/track-usage.js watch

# Check session and a live monthly fetch
node src/track-usage.js verify

# Scheduler (same approach as GPT): run once immediately, then on an interval
node scheduler.js

# Write logs without POSTing
node src/track-usage.js once --skip-api
```

Equivalent npm scripts: `npm run once`, `npm start` (watch), `npm run verify`, `npm run scheduler`.

The script loads `.env` automatically. Existing shell environment values and CLI flags take precedence.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CURSOR_SESSION_TOKEN` | (local Cursor session) | WorkosCursorSessionToken override |
| `CURSOR_TRACKER_INTERVAL_MINUTES` | `15` | Watch / scheduler refresh interval |
| `CURSOR_TRACKER_LOG_DIR` | `./logs` | Log output directory |
| `CURSOR_TRACKER_LOG_MAX_RECORDS` | `5` | Max snapshots kept in `usage.jsonl` and `cursor.logs` |
| `CURSOR_TRACKER_API_URL` | `http://localhost:3000/api/cursor` | One or more POST endpoints, comma-separated |
| `CURSOR_TRACKER_API_TIMEOUT_MS` | `10000` | API request timeout |

## Log files

All writes go to `logs/`:

| File | Contents |
| --- | --- |
| `logs/latest.json` | Newest snapshot (pretty-printed) |
| `logs/usage.jsonl` | Last 5 snapshots, one JSON object per line |
| `logs/cursor.logs` | Last 5 one-line human summaries |

Older history is dropped on each write so those two files never grow past `CURSOR_TRACKER_LOG_MAX_RECORDS`.

## API integration

After each successful fetch with an `email_id`, plan, and monthly model windows, the script POSTs JSON to `CURSOR_TRACKER_API_URL` (or `--api-url`). Local logging still happens if the request fails.

Times are UTC `YYYY-MM-DD HH:mm:ss`.

```json
{
  "provider": "cursor",
  "email_id": "access@webspero.com",
  "plan_type": "pro",
  "data": {
    "monthly": {
      "Cursor_Models": {
        "used_percent": 10,
        "reset_time": "2026-01-01 00:00:00"
      },
      "other_models": {
        "used_percent": 0,
        "reset_time": "2026-01-01 00:00:00"
      }
    },
    "last_updated": "2026-01-01 00:00:00"
  }
}
```

`Cursor_Models` is Composer / Auto (`autoPercentUsed`). `other_models` is the rest of the models (`apiPercentUsed`). Use `--skip-api` to write logs without posting.

## Error handling

| Condition | Log status | Notes |
| --- | --- | --- |
| Missing / expired session | `error` / `session_expired` | Fields are `Unavailable` |
| Network / timeout | `error` / `network` or `timeout` | Watch mode retries with backoff |
| Rate limit / 429 | `error` / `rate_limited` | Watch mode waits longer before retry |

Watch mode and `scheduler.js` keep running after failures. Successful fetches reset the backoff. Default interval is 15 minutes.
