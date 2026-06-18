#!/usr/bin/env bash
#
# TawTerminal installer.
#   curl -fsSL https://raw.githubusercontent.com/tawgroup/taw-terminal/main/install.sh | bash
#
# Downloads the latest GitHub release, installs TawTerminal.app into
# /Applications, strips the Gatekeeper quarantine flag, and launches it.
set -euo pipefail

REPO="tawgroup/taw-terminal"
APP="TawTerminal"

say() { printf "\033[1m%s\033[0m\n" "$*"; }

if [ "$(uname -s)" != "Darwin" ]; then
  echo "TawTerminal is macOS-only." >&2
  exit 1
fi

ARCH="$(uname -m)"
if [ "$ARCH" != "arm64" ]; then
  echo "Only the Apple Silicon (arm64) build is published right now (you are on $ARCH)." >&2
  exit 1
fi

say "Finding latest $APP release..."
TAG="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -m1 '"tag_name"' | cut -d'"' -f4)"
if [ -z "${TAG:-}" ]; then
  echo "No published release found yet." >&2
  exit 1
fi
VER="${TAG#v}"
ZIP="${APP}-${VER}-arm64-mac.zip"
URL="https://github.com/$REPO/releases/download/$TAG/$ZIP"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "Downloading $APP $VER ..."
curl -fSL --progress-bar "$URL" -o "$TMP/$ZIP"

say "Unpacking ..."
unzip -q "$TMP/$ZIP" -d "$TMP"

say "Installing to /Applications ..."
rm -rf "/Applications/${APP}.app"
cp -R "$TMP/${APP}.app" "/Applications/"
# Local installs aren't quarantined, but strip it just in case (e.g. via browser)
xattr -dr com.apple.quarantine "/Applications/${APP}.app" 2>/dev/null || true

say "Installed $APP $VER - launching."
open "/Applications/${APP}.app"
