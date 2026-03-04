#!/usr/bin/env sh
set -eu

REPO="Gaubee/2fa"
WWW_DIR=""
STATE_FILE=""
FORCE="0"
QUIET="0"
ASSET_NAME="gaubee-2fa-latest-dist.tar.gz"

log() {
  if [ "$QUIET" = "0" ]; then
    printf '%s\n' "$1"
  fi
}

die() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  install-www.sh --www=./mydir [--repo=owner/name] [--asset=name.tar.gz] [--state=/path/state] [--force] [--quiet]

Options:
  --www=DIR       Target directory to place built static files.
  --repo=REPO     GitHub repo slug. Default: Gaubee/2fa
  --asset=NAME    Release asset name. Default: gaubee-2fa-latest-dist.tar.gz
  --state=FILE    State file for last deployed tag. Default: <www>/.2fa-release-state
  --force         Force download and replace even if tag unchanged.
  --quiet         Less output.
  --help          Show this help.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --www=*) WWW_DIR="${arg#*=}" ;;
    --repo=*) REPO="${arg#*=}" ;;
    --asset=*) ASSET_NAME="${arg#*=}" ;;
    --state=*) STATE_FILE="${arg#*=}" ;;
    --force) FORCE="1" ;;
    --quiet) QUIET="1" ;;
    --help) usage; exit 0 ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

[ -n "$WWW_DIR" ] || die "Missing --www=DIR"

case "$WWW_DIR" in
  /|""|.) die "Unsafe --www value: $WWW_DIR" ;;
esac

if [ -z "$STATE_FILE" ]; then
  STATE_FILE="$WWW_DIR/.2fa-release-state"
fi

LATEST_URL="https://github.com/$REPO/releases/latest"
FINAL_RELEASE_URL="$(curl -fsSIL -o /dev/null -w '%{url_effective}' "$LATEST_URL")" || die "Failed to request $LATEST_URL"
TAG="${FINAL_RELEASE_URL##*/}"
[ -n "$TAG" ] || die "Cannot parse latest tag from redirect URL"

ASSET_URL="https://github.com/$REPO/releases/latest/download/$ASSET_NAME"

if [ "$FORCE" = "0" ] && [ -f "$STATE_FILE" ]; then
  OLD_TAG="$(grep '^TAG=' "$STATE_FILE" 2>/dev/null | head -n1 | cut -d'=' -f2- || true)"
  if [ "$OLD_TAG" = "$TAG" ]; then
    log "Already latest: $TAG"
    exit 0
  fi
fi

TMP_DIR="$(mktemp -d)"
ARCHIVE_PATH="$TMP_DIR/dist.tar.gz"
EXTRACT_DIR="$TMP_DIR/extracted"
TARGET_TMP="$TMP_DIR/target"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

log "Downloading $ASSET_URL"
curl -fL "$ASSET_URL" -o "$ARCHIVE_PATH" >/dev/null 2>&1 || die "Download failed: $ASSET_URL"

mkdir -p "$EXTRACT_DIR" "$TARGET_TMP"
tar -xzf "$ARCHIVE_PATH" -C "$EXTRACT_DIR" || die "Failed to extract archive"
cp -R "$EXTRACT_DIR"/. "$TARGET_TMP" || die "Failed to copy extracted files"

mkdir -p "$(dirname "$WWW_DIR")"
rm -rf "$WWW_DIR"
mv "$TARGET_TMP" "$WWW_DIR"

mkdir -p "$(dirname "$STATE_FILE")"
{
  printf 'TAG=%s\n' "$TAG"
  printf 'REPO=%s\n' "$REPO"
  printf 'ASSET_URL=%s\n' "$ASSET_URL"
  printf 'UPDATED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$STATE_FILE"

log "Deploy done: $WWW_DIR (tag: $TAG)"
