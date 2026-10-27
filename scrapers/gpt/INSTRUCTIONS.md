# One-time setup

## 1. Create three empty Codex homes

The folder must exist before you set `CODEX_HOME`:

```bash
mkdir -p ~/.codex-acc1 ~/.codex-acc2 ~/.codex-acc3
mkdir -p /var/www/Projects/temp/GPT-Tracker-mulacc/logs/acc1 \
         /var/www/Projects/temp/GPT-Tracker-mulacc/logs/acc2 \
         /var/www/Projects/temp/GPT-Tracker-mulacc/logs/acc3
```

Keep `~/.codex` as your normal daily Codex login. Do not overwrite it.

## 2. Log in once per home

Browser sign-in; the tracker never asks for a password:

```bash
CODEX_HOME=~/.codex-acc1 codex login
CODEX_HOME=~/.codex-acc2 codex login
CODEX_HOME=~/.codex-acc3 codex login
```

Use a private window, or a different browser profile, so you can sign into a different ChatGPT account each time. Confirm:

```bash
CODEX_HOME=~/.codex-acc1 codex login status
CODEX_HOME=~/.codex-acc2 codex login status
CODEX_HOME=~/.codex-acc3 codex login status
```

Each should say you are logged in with ChatGPT, and they should be different accounts.

## 3. (Optional) Make it easy to reconfigure

Create three small files you source, for example `accounts/acc1.env`:

```bash
export CODEX_HOME="$HOME/.codex-acc1"
export GPT_TRACKER_LOG_DIR="./logs/acc1"
export GPT_TRACKER_INTERVAL_MINUTES=15
# export GPT_TRACKER_API_URL="https://your-endpoint/api/chat-gpt"
```

Repeat for acc2 and acc3 with their own paths. Change a file later to change that account’s settings. Do not commit these if they ever contain secrets.

# Run three accounts in three terminals

From the project folder, one account per terminal:

```bash
# Terminal 1
source accounts/acc1.env
node src/track-usage.js verify
node src/track-usage.js watch

# Terminal 2
source accounts/acc2.env
node src/track-usage.js verify
node src/track-usage.js watch

# Terminal 3
source accounts/acc3.env
node src/track-usage.js verify
node src/track-usage.js watch
```

Without those files, the same thing inline:

```bash
CODEX_HOME=~/.codex-acc1 GPT_TRACKER_LOG_DIR=./logs/acc1 \
  node src/track-usage.js watch
```

`verify` first is worth it: it checks Codex, the login in that `CODEX_HOME`, and a live usage fetch.

Each terminal then writes to its own log folder (`logs/acc1/latest.json`, and so on). If they all used `./logs`, they would overwrite each other.

The API payload already includes `email_id`, so three watchers can POST to the same URL and still be distinguished.
