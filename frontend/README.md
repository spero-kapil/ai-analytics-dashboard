# Usage & Availability Dashboard

React dashboard for monitoring usage limits of ChatGPT, Claude, Cursor and Devin accounts.
Built with Vite, React, Tailwind CSS, Recharts and Lucide React.

## Getting started

```bash
npm install
cp .env.example .env   # optional, adjust the API URL
npm run dev
```

The dashboard reads `GET VITE_API_URL` (default `http://127.0.0.1:8000/api/data`), which
returns `{ success, count, data: [{ provider, email_id, account_name, plan_type, data, miscellaneous, is_active, last_updated }] }`.

## Usage data formats

`src/lib/normalize.js` converts each record's `data` object into usage meters. It accepts:

| Shape | Example |
| --- | --- |
| Period pairs | `{ "weekly_usage": 10, "weekly_reset_time": "2026-10-27 06:43:58" }` |
| Named meters | `{ "Cursor Models": 50 }` |
| Nested periods | `{ "weekly": { "remaining_percent": 72, "reset_at": "2026-10-27T09:00:00Z" } }` |
| Limit lists | `{ "limits": [{ "period": "5h", "usedPercent": 40, "resetAt": 1793091600000 }] }` |

Numbers are treated as percent used unless the field says `remaining`; the other value is
derived when missing. Timestamps without a time zone are read as UTC.

## Adding a provider

Add an entry to `PROVIDERS` in `src/lib/providers.js` (name, aliases matching the API's
`provider` value, icon and colours). Providers not in the list still appear, with a generic icon.
