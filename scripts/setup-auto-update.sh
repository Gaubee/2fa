#!/usr/bin/env sh
set -eu

REPO="Gaubee/2fa"
BRANCH="main"
WWW_DIR=""
POLL_SECONDS="600"

usage() {
  cat <<'USAGE'
Usage:
  setup-auto-update.sh --www=./mydir [--interval=600] [--repo=owner/name] [--branch=main]

It will:
1. deploy latest dist to --www
2. write updater config to ~/.config/gaubee-2fa/updater.conf
3. register startup service (systemd user or launchd)
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --www=*) WWW_DIR="${arg#*=}" ;;
    --interval=*) POLL_SECONDS="${arg#*=}" ;;
    --repo=*) REPO="${arg#*=}" ;;
    --branch=*) BRANCH="${arg#*=}" ;;
    --help) usage; exit 0 ;;
    *) printf 'ERROR: Unknown argument: %s\n' "$arg" >&2; exit 1 ;;
  esac
done

[ -n "$WWW_DIR" ] || { printf 'ERROR: Missing --www\n' >&2; exit 1; }

XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONF_DIR="$XDG_CONFIG_HOME/gaubee-2fa"
DATA_DIR="$XDG_DATA_HOME/gaubee-2fa"
CONF_FILE="$CONF_DIR/updater.conf"
INSTALL_SCRIPT="$DATA_DIR/install-www.sh"
DAEMON_SCRIPT="$DATA_DIR/auto-update-daemon.sh"
STATE_FILE="$WWW_DIR/.2fa-release-state"

mkdir -p "$CONF_DIR" "$DATA_DIR"

RAW_BASE="https://raw.githubusercontent.com/$REPO/$BRANCH/scripts"
curl -fsSL "$RAW_BASE/install-www.sh" -o "$INSTALL_SCRIPT"
curl -fsSL "$RAW_BASE/auto-update-daemon.sh" -o "$DAEMON_SCRIPT"
chmod +x "$INSTALL_SCRIPT" "$DAEMON_SCRIPT"

cat > "$CONF_FILE" <<EOF_CONF
WWW_DIR=$WWW_DIR
REPO=$REPO
POLL_SECONDS=$POLL_SECONDS
STATE_FILE=$STATE_FILE
INSTALL_SCRIPT=$INSTALL_SCRIPT
EOF_CONF

"$INSTALL_SCRIPT" --www="$WWW_DIR" --repo="$REPO" --state="$STATE_FILE"

install_systemd_user() {
  UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  UNIT_FILE="$UNIT_DIR/gaubee-2fa-updater.service"
  mkdir -p "$UNIT_DIR"

  cat > "$UNIT_FILE" <<EOF_UNIT
[Unit]
Description=Gaubee 2FA Auto Updater
After=network-online.target

[Service]
Type=simple
ExecStart=/bin/sh $DAEMON_SCRIPT --config=$CONF_FILE
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF_UNIT

  systemctl --user daemon-reload
  systemctl --user enable --now gaubee-2fa-updater.service
  printf 'Auto updater enabled via systemd user service.\n'
}

install_launchd() {
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST_FILE="$PLIST_DIR/com.gaubee.2fa.updater.plist"
  mkdir -p "$PLIST_DIR"

  cat > "$PLIST_FILE" <<EOF_PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.gaubee.2fa.updater</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/sh</string>
      <string>$DAEMON_SCRIPT</string>
      <string>--config=$CONF_FILE</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$CONF_DIR/updater.log</string>
    <key>StandardErrorPath</key>
    <string>$CONF_DIR/updater.err.log</string>
  </dict>
</plist>
EOF_PLIST

  launchctl unload "$PLIST_FILE" >/dev/null 2>&1 || true
  launchctl load "$PLIST_FILE"
  printf 'Auto updater enabled via launchd.\n'
}

if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  install_systemd_user
elif [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
  install_launchd
else
  nohup /bin/sh "$DAEMON_SCRIPT" --config="$CONF_FILE" >/dev/null 2>&1 &
  printf 'Auto updater started in background (no startup service manager detected).\n'
fi

printf 'Config saved to %s\n' "$CONF_FILE"
