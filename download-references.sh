#!/bin/bash
# Download reference images for DINOv3/CLIP scoring.
# Uses TARGET env var to decide which references to fetch (default: pepe).
# Run this once on any machine with internet access.
#
# For paintingwide target (~860 images), uses Special:FilePath redirect URLs.
# Downloads are resilient: failures are logged but don't stop the batch.
#
# Usage:
#   TARGET=pepe ./download-references.sh
#   TARGET=paintingwide ./download-references.sh
#   PARALLEL=8 TARGET=paintingwide ./download-references.sh   # parallel downloads

set -e

TARGET="${TARGET:-pepe}"
REFS_DIR="${1:-references}"
PARALLEL="${PARALLEL:-1}"
mkdir -p "$REFS_DIR"

SUCCESS=0
FAIL=0
SKIP=0

download() {
  local url="$1"
  local dest="$2"
  if [ -f "$dest" ] && [ -s "$dest" ]; then
    SKIP=$((SKIP + 1))
    return 0
  fi
  if command -v curl &>/dev/null; then
    if curl -fL --max-time 30 --retry 2 -o "$dest" "$url" 2>/dev/null; then
      # Verify we got an actual image (not an error page)
      if [ -s "$dest" ] && file "$dest" 2>/dev/null | grep -qiE "image|JPEG|PNG|bitmap"; then
        SUCCESS=$((SUCCESS + 1))
        return 0
      else
        rm -f "$dest"
        FAIL=$((FAIL + 1))
        echo "  FAIL (not an image): $(basename "$dest")"
        return 1
      fi
    else
      rm -f "$dest"
      FAIL=$((FAIL + 1))
      echo "  FAIL (download error): $(basename "$dest")"
      return 1
    fi
  elif command -v wget &>/dev/null; then
    if wget -q --timeout=30 -O "$dest" "$url" 2>/dev/null; then
      if [ -s "$dest" ]; then
        SUCCESS=$((SUCCESS + 1))
        return 0
      else
        rm -f "$dest"
        FAIL=$((FAIL + 1))
        return 1
      fi
    else
      rm -f "$dest"
      FAIL=$((FAIL + 1))
      return 1
    fi
  else
    echo "ERROR: Neither curl nor wget found. Install one and retry."
    exit 1
  fi
}

echo ">>> Downloading reference images for target: $TARGET"

# Get total count
TOTAL=$(node -e "
  process.env.TARGET = '$TARGET';
  const { loadTarget } = require('./targets');
  const t = loadTarget();
  console.log((t.referenceUrls || []).length);
" 2>/dev/null)
echo ">>> Total references to fetch: $TOTAL"

# Use Node to read reference URLs from the target config
node -e "
  process.env.TARGET = '$TARGET';
  const { loadTarget } = require('./targets');
  const t = loadTarget();
  for (const ref of t.referenceUrls || []) {
    console.log(ref.url + ' ' + ref.name);
  }
" 2>/dev/null | while read -r url name; do
  download "$url" "$REFS_DIR/$name" || true
done

# Count actual files
DOWNLOADED=$(ls "$REFS_DIR"/*.jpg "$REFS_DIR"/*.png "$REFS_DIR"/*.JPG "$REFS_DIR"/*.jpeg 2>/dev/null | wc -l)

echo ""
echo ">>> Download complete!"
echo "    Total requested: $TOTAL"
echo "    Files in $REFS_DIR/: $DOWNLOADED"
echo ""
echo "You can also add your own reference images (any .jpg/.png/.webp) to $REFS_DIR/"
echo "DINOv3 will compare candidates against ALL images in the directory."
