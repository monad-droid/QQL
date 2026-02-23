#!/bin/bash
# Download reference images for CLIP scoring (Mona Lisa)
# Run this once on any machine with internet access.
#
# Downloads multiple versions/crops of the Mona Lisa for better CLIP matching:
#   1. Full painting (high quality, from Wikimedia Commons)
#   2. Face detail crop (from Wikimedia Commons)

set -e

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

echo ">>> Downloading Mona Lisa reference images..."

# Full painting — high quality
download \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/800px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg" \
  "$REFS_DIR/mona-lisa-full.jpg"

# Face detail
download \
  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/400px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg" \
  "$REFS_DIR/mona-lisa-small.jpg"

echo ""
echo ">>> Reference images saved to $REFS_DIR/"
ls -la "$REFS_DIR"/*.jpg "$REFS_DIR"/*.png 2>/dev/null || true
echo ""
echo "You can also add your own reference images (any .jpg/.png/.webp) to $REFS_DIR/"
echo "CLIP will compare candidates against ALL images in the directory."
