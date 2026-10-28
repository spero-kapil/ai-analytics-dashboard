# One-time setup — Claude Code

## 1. Create three separate Claude configuration homes

Claude Code uses `CLAUDE_CONFIG_DIR` for its configuration directory. Create each directory before launching Claude Code:

```bash
mkdir -p ~/.claude-acc1 ~/.claude-acc2 ~/.claude-acc3
mkdir -p logs/acc1 logs/acc2 logs/acc3
```

Keep `~/.claude` as your normal daily Claude Code configuration. Do not overwrite it.

## 2. Log in once per configuration directory

Browser sign-in; the tracker never asks for a password:

```bash
CLAUDE_CONFIG_DIR="$HOME/.claude-acc1" claude auth login
CLAUDE_CONFIG_DIR="$HOME/.claude-acc2" claude auth login
CLAUDE_CONFIG_DIR="$HOME/.claude-acc3" claude auth login
```

Use a private window, or a different browser profile, so you can sign into a different Claude account each time. Confirm:

```bash
CLAUDE_CONFIG_DIR="$HOME/.claude-acc1" claude auth status
CLAUDE_CONFIG_DIR="$HOME/.claude-acc2" claude auth status
CLAUDE_CONFIG_DIR="$HOME/.claude-acc3" claude auth status
```

Each should show `"loggedIn": true`, and they should be different accounts. Treat these config directories as secrets; never commit or share them.

## 3. (Optional) Make it easy to reconfigure

Create three small files you source, for example `accounts/acc1.env`:

```bash
export CLAUDE_CONFIG_DIR="$HOME/.claude-acc1"
export CLAUDE_USAGE_LOGS_DIR="./logs/acc1"
export CLAUDE_USAGE_INTERVAL_MIN=15
# export CLAUDE_USAGE_API_URL="http://localhost:3000/api/claude-code"
```

Repeat for acc2 and acc3 with their own paths. Change a file later to change that account’s settings. Do not commit these if they ever contain secrets.

# Run three accounts in three terminals

From the project folder, one account per terminal:

```bash
# Terminal 1
source accounts/acc1.env
node src/tracker.js --once
node src/tracker.js

# Terminal 2
source accounts/acc2.env
node src/tracker.js --once
node src/tracker.js

# Terminal 3
source accounts/acc3.env
node src/tracker.js --once
node src/tracker.js
```

Without those files, the same thing inline:

```bash
CLAUDE_CONFIG_DIR="$HOME/.claude-acc1" CLAUDE_USAGE_LOGS_DIR=./logs/acc1 \
  node src/tracker.js
```

`--once` first is worth it: it checks Claude Code, the login in that `CLAUDE_CONFIG_DIR`, and a live usage fetch.

Each terminal then writes to its own log folder (`logs/acc1/usage-latest.json`, and so on). If they all used `./logs`, they would overwrite each other.

The API payload already includes `email_id`, so three watchers can POST to the same URL and still be distinguished.
