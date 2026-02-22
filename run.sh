#!/bin/bash
# QQL Pepe Hunter - Full pipeline
# Usage: ./run.sh [count] [top-n]
#   count: number of images to generate (default: 500)
#   top-n: number of top results to keep (default: 20)

set -e

COUNT=${1:-500}
TOP_N=${2:-20}
RENDERS_DIR="renders"
RESULTS_DIR="results"

echo "============================================"
echo "  QQL Pepe Hunter"
echo "  Generating: $COUNT images"
echo "  Keeping top: $TOP_N results"
echo "============================================"
echo ""

# Clean previous run
rm -rf "$RENDERS_DIR"/* "$RESULTS_DIR"/*

# Step 1: Generate
echo ">>> Step 1/2: Generating $COUNT images..."
START=$(date +%s)
node generate.js "$RENDERS_DIR" "$COUNT"
GEN_END=$(date +%s)
echo ""
echo "Generation complete in $((GEN_END - START))s"
echo ""

# Step 2: Score
echo ">>> Step 2/2: Scoring and ranking..."
node score.js "$RENDERS_DIR" "$TOP_N"
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
