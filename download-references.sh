#!/bin/bash
# Download reference images for CLIP scoring
# Run this once on any machine with internet access.

set -e

REFS_DIR="${1:-references}"
mkdir -p "$REFS_DIR"

echo ">>> Downloading Mona Lisa reference image..."
if command -v curl &>/dev/null; then
  curl -L -o "$REFS_DIR/mona-lisa.jpg" \
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/800px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg"
elif command -v wget &>/dev/null; then
  wget -O "$REFS_DIR/mona-lisa.jpg" \
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/800px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg"
else
  echo "ERROR: Neither curl nor wget found. Install one and retry."
  exit 1
fi

echo ">>> Reference image saved to $REFS_DIR/mona-lisa.jpg"
ls -la "$REFS_DIR"/*.jpg "$REFS_DIR"/*.png 2>/dev/null
