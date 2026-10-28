# One-time setup — Devin

## 1. Create three separate Devin data homes

Devin stores its CLI session under `XDG_DATA_HOME` (credentials) and `XDG_CONFIG_HOME` (config). Create each directory before launching Devin:

```bash
mkdir -p ~/.devin-acc1/share ~/.devin-acc1/config
mkdir -p ~/.devin-acc2/share ~/.devin-acc2/config
mkdir -p ~/.devin-acc3/share ~/.devin-acc3/config
mkdir -p logs/acc1 logs/acc2 logs/acc3
```

Keep `~/.local/share/devin` as your normal daily Devin login. Do not overwrite it.

## 2. Log in once per data home

Browser sign-in; the tracker never asks for a password:

```bash
XDG_DATA_HOME="$HOME/.devin-acc1/share" XDG_CONFIG_HOME="$HOME/.devin-acc1/config" devin auth login
XDG_DATA_HOME="$HOME/.devin-acc2/share" XDG_CONFIG_HOME="$HOME/.devin-acc2/config" devin auth login
XDG_DATA_HOME="$HOME/.devin-acc3/share" XDG_CONFIG_HOME="$HOME/.devin-acc3/config" devin auth login
```

Use a private window, or a different browser profile, so you can sign into a different Devin account each time. Confirm:

```bash
XDG_DATA_HOME="$HOME/.devin-acc1/share" XDG_CONFIG_HOME="$HOME/.devin-acc1/config" devin auth status
XDG_DATA_HOME="$HOME/.devin-acc2/share" XDG_CONFIG_HOME="$HOME/.devin-acc2/config" devin auth status
XDG_DATA_HOME="$HOME/.devin-acc3/share" XDG_CONFIG_HOME="$HOME/.devin-acc3/config" devin auth status
```

Each should say you are logged in, and they should be different accounts. Treat these data directories as secrets; never commit or share them.

## 3. (Optional) Make it easy to reconfigure

Create three small files you source, for example `accounts/acc1.env`:

```bash
export XDG_DATA_HOME="$HOME/.devin-acc1/share"
export XDG_CONFIG_HOME="$HOME/.devin-acc1/config"
export DEVIN_USAGE_LOG_DIR="./logs/acc1"
export DEVIN_USAGE_INTERVAL_MINUTES=15
# export DEVIN_USAGE_API_URL="http://localhost:3000/api/devin"
```

Repeat for acc2 and acc3 with their own paths. Change a file later to change that account’s settings. Do not commit these if they ever contain secrets.

# Run three accounts in three terminals

From the project folder, one account per terminal:

```bash
# Terminal 1
source accounts/acc1.env
node src/index.js --once
node src/index.js --daemon

# Terminal 2
source accounts/acc2.env
node src/index.js --once
node src/index.js --daemon

# Terminal 3
source accounts/acc3.env
node src/index.js --once
node src/index.js --daemon
```

Without those files, the same thing inline:

```bash
XDG_DATA_HOME="$HOME/.devin-acc1/share" XDG_CONFIG_HOME="$HOME/.devin-acc1/config" \
  DEVIN_USAGE_LOG_DIR=./logs/acc1 \
  node src/index.js --daemon
```

`--once` first is worth it: it checks Devin CLI, the login in that `XDG_DATA_HOME`, and a live usage fetch.

Each terminal then writes to its own log folder (`logs/acc1/usage-latest.json`, and so on). If they all used `./logs`, they would overwrite each other.

The API payload already includes `email_id`, so three watchers can POST to the same URL and still be distinguished.
