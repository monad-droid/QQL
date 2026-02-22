#!/bin/bash
# QQL Mona Lisa Hunter - Full pipeline
# Usage: ./run.sh [count] [top-n]
#   count: number of images to generate (default: 500)
#   top-n: number of top results to keep (default: 20)

set -e

COUNT=${1:-500}
TOP_N=${2:-20}
RENDERS_DIR="renders"
RESULTS_DIR="results"
CHUNK=10

echo "============================================"
echo "  QQL Mona Lisa Hunter (CLIP-powered)"
echo "  Generating: $COUNT images (chunks of $CHUNK)"
echo "  Keeping top: $TOP_N results"
echo "  Scoring: Heuristic pre-filter → CLIP"
echo "============================================"
echo ""

# Clean previous run
rm -rf "$RENDERS_DIR"/* "$RESULTS_DIR"/*

# Step 1: Generate in chunks to avoid OOM (renderer leaks memory)
# Each chunk spawns a fresh Node process that exits when done (frees leaked memory).
# Single worker — server has 1 vCPU so parallelism gives no benefit.
echo ">>> Step 1/2: Generating $COUNT images..."
START=$(date +%s)
GENERATED=0
while [ $GENERATED -lt $COUNT ]; do
  REMAINING=$((COUNT - GENERATED))
  THIS_CHUNK=$((REMAINING < CHUNK ? REMAINING : CHUNK))
  node --max-old-space-size=3072 generate.js "$RENDERS_DIR" "$THIS_CHUNK" "$GENERATED"
  GENERATED=$((GENERATED + THIS_CHUNK))
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
