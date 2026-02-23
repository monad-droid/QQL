#!/bin/bash
# Download reference images for CLIP scoring.
# Uses TARGET env var to decide which references to fetch (default: pepe).
# Run this once on any machine with internet access.
#
# Usage:
#   TARGET=pepe ./download-references.sh
#   TARGET=monalisa ./download-references.sh

set -e

TARGET="${TARGET:-pepe}"
REFS_DIR="${1:-references}"
mkdir -p "$REFS_DIR"

download() {
  local url="$1"
  local dest="$2"
  if [ -f "$dest" ]; then
    echo "  Already exists: $dest"
    return
  fi
  echo "  Downloading: $dest"
  if command -v curl &>/dev/null; then
    curl -L -o "$dest" "$url"
  elif command -v wget &>/dev/null; then
    wget -O "$dest" "$url"
  else
    echo "ERROR: Neither curl nor wget found. Install one and retry."
    exit 1
  fi
}

echo ">>> Downloading reference images for target: $TARGET"

# Use Node to read reference URLs from the target config
node -e "
  process.env.TARGET = '$TARGET';
  const { loadTarget } = require('./targets');
  const t = loadTarget();
  for (const ref of t.referenceUrls || []) {
    console.log(ref.url + ' ' + ref.name);
  }
" 2>/dev/null | while read -r url name; do
  download "$url" "$REFS_DIR/$name"
done

echo ""
echo ">>> Reference images saved to $REFS_DIR/"
ls -la "$REFS_DIR"/*.jpg "$REFS_DIR"/*.png 2>/dev/null || true
echo ""
echo "You can also add your own reference images (any .jpg/.png/.webp) to $REFS_DIR/"
echo "CLIP will compare candidates against ALL images in the directory."
