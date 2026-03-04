#!/usr/bin/env sh
set -eu

CONFIG_FILE=""

usage() {
  cat <<'USAGE'
Usage:
  auto-update-daemon.sh --config=/path/updater.conf
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --config=*) CONFIG_FILE="${arg#*=}" ;;
    --help) usage; exit 0 ;;
    *) printf 'ERROR: Unknown argument: %s\n' "$arg" >&2; exit 1 ;;
  esac
done

[ -n "$CONFIG_FILE" ] || { printf 'ERROR: Missing --config\n' >&2; exit 1; }
[ -f "$CONFIG_FILE" ] || { printf 'ERROR: Config not found: %s\n' "$CONFIG_FILE" >&2; exit 1; }

# shellcheck disable=SC1090
. "$CONFIG_FILE"

: "${WWW_DIR:?missing WWW_DIR in config}"
: "${REPO:=Gaubee/2fa}"
: "${POLL_SECONDS:=600}"
: "${STATE_FILE:=$WWW_DIR/.2fa-release-state}"
: "${INSTALL_SCRIPT:=scripts/install-www.sh}"

while :; do
  "$INSTALL_SCRIPT" --www="$WWW_DIR" --repo="$REPO" --state="$STATE_FILE" --quiet || true
  sleep "$POLL_SECONDS"
done
