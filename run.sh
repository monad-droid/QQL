#!/bin/bash
# QQL Art Hunter - Full pipeline
# Usage: TARGET=monalisa ./run.sh [count] [top-n]
#   count: number of images to generate (default: 500)
#   top-n: number of top results to keep (default: 20)
#
# TARGET env var selects the hunt target (default: pepe).
# Available targets: pepe, monalisa

set -e

export TARGET="${TARGET:-pepe}"
COUNT=${1:-500}
TOP_N=${2:-20}
RENDERS_DIR="renders"
RESULTS_DIR="results"
CHUNK=5
WORKERS=6

echo "============================================"
echo "  QQL ${TARGET} Hunter (CLIP-powered)"
echo "  Generating: $COUNT images ($WORKERS workers, chunks of $CHUNK)"
echo "  Keeping top: $TOP_N results"
echo "  Scoring: Heuristic + CLIP (all images)"
echo "============================================"
echo ""

# Clean previous run
rm -rf "$RENDERS_DIR"/* "$RESULTS_DIR"/*

# Step 1: Generate in parallel chunks to avoid OOM (renderer leaks memory)
echo ">>> Step 1/2: Generating $COUNT images ($WORKERS parallel workers)..."
START=$(date +%s)
GENERATED=0
while [ $GENERATED -lt $COUNT ]; do
  PIDS=""
  for W in $(seq 1 $WORKERS); do
    if [ $GENERATED -lt $COUNT ]; then
      REMAINING=$((COUNT - GENERATED))
      THIS_CHUNK=$((REMAINING < CHUNK ? REMAINING : CHUNK))
      node --max-old-space-size=3072 generate.js "$RENDERS_DIR" "$THIS_CHUNK" "$GENERATED" "$W" &
      PIDS="$PIDS $!"
      GENERATED=$((GENERATED + THIS_CHUNK))
    fi
  done
  for PID in $PIDS; do
    wait $PID || true
  done
done
GEN_END=$(date +%s)
echo ""
echo "Generation complete in $((GEN_END - START))s"
echo ""

# Step 2: Score (heuristic pre-filter + CLIP semantic scoring)
echo ">>> Step 2/2: Scoring and ranking..."
node --max-old-space-size=4096 score.js "$RENDERS_DIR" "$TOP_N"
SCORE_END=$(date +%s)
echo ""
echo "Scoring complete in $((SCORE_END - GEN_END))s"
echo ""

echo "============================================"
echo "  Pipeline complete!"
echo "  Total time: $((SCORE_END - START))s"
echo "  Results in: $RESULTS_DIR/"
echo "============================================"

# List top results
echo ""
ls -la "$RESULTS_DIR"/*.png 2>/dev/null | head -20
