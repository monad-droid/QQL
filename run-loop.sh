#!/bin/bash
# QQL Art Hunter - Continuous Loop Mode
#
# Runs the pipeline in an infinite loop, accumulating the best results
# across all runs. Designed for 24/7 cloud operation.
#
# Usage: TARGET=monalisa ./run-loop.sh [batch-size] [top-n]
#   batch-size:      images per batch (default: 500)
#   top-n:           top results to keep per batch (default: 20)
#
# TARGET env var selects the hunt target (default: pepe).
#
# Output:
#   results/         current batch top results (overwritten each batch)
#   hall-of-fame/    per-reference top-50 best results by DINOv3 similarity
#                    each reference painting gets its own subdirectory
#   logs/            per-batch logs with timestamps

set -e

export TARGET="${TARGET:-pepe}"
BATCH_SIZE=${1:-500}
TOP_N=${2:-20}
HALL_OF_FAME="hall-of-fame"
LOG_DIR="logs"
STATS_FILE="$HALL_OF_FAME/_stats.json"

mkdir -p "$HALL_OF_FAME" "$LOG_DIR" results renders

# Read render resolution from generate.js
RENDER_SIZE=$(grep 'const IMAGE_WIDTH' generate.js | head -1 | grep -oE '[0-9]+' || echo "256")

# Initialize stats
if [ ! -f "$STATS_FILE" ]; then
  cat > "$STATS_FILE" <<'INIT'
{
  "totalBatches": 0,
  "totalImages": 0,
  "totalHits": 0,
  "bestSimilarity": 0,
  "bestFile": null,
  "startedAt": null
}
INIT
fi

echo "============================================"
echo "  QQL ${TARGET} Hunter - CONTINUOUS MODE"
echo "  Batch size:      $BATCH_SIZE images"
echo "  Keep per batch:  $TOP_N"
echo "  Render size:     ${RENDER_SIZE}x${RENDER_SIZE}px"
echo "  Hall-of-fame:    top 50 per reference painting"
echo "  Logs:            $LOG_DIR/"
echo "  Results:         $HALL_OF_FAME/<ref-name>/"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop. Results persist across restarts."
echo ""

BATCH=0
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TOTAL_HITS=0

# Trap SIGTERM/SIGINT for clean shutdown
trap 'echo ""; echo ">>> Shutting down after $BATCH batches ($((BATCH * BATCH_SIZE)) images)."; echo ">>> Hall-of-fame: $(find "$HALL_OF_FAME" -name "*.png" 2>/dev/null | wc -l) images across $(find "$HALL_OF_FAME" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l) references"; exit 0' SIGTERM SIGINT

while true; do
  BATCH=$((BATCH + 1))
  BATCH_START=$(date +%s)
  TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
  LOG_FILE="$LOG_DIR/batch-${BATCH}-${TIMESTAMP}.log"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Batch #$BATCH  |  $(date)  |  Total: $((BATCH * BATCH_SIZE)) images"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Clean renders from previous batch (results dir is cleaned by run.sh)
  rm -rf renders/*

  # Run the pipeline, tee to log
  ./run.sh "$BATCH_SIZE" "$TOP_N" 2>&1 | tee "$LOG_FILE"

  BATCH_END=$(date +%s)
  BATCH_ELAPSED=$((BATCH_END - BATCH_START))

  # Promote top results to hall-of-fame (per-reference top-50)
  if [ -f "results/_scores.json" ]; then
    node promote-to-hof.js "$BATCH" "$TIMESTAMP" "$BATCH_SIZE" "$BATCH_ELAPSED" \
      || echo "  WARNING: hall-of-fame promotion script failed"
  fi

  # Summary
  HOF_COUNT=$(find "$HALL_OF_FAME" -name "*.png" 2>/dev/null | wc -l)
  REF_COUNT=$(find "$HALL_OF_FAME" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  echo ""
  echo "  Batch #$BATCH complete in ${BATCH_ELAPSED}s"
  echo "  Hall-of-fame: $HOF_COUNT images across $REF_COUNT references"
  echo "  Images/sec: $(echo "scale=2; $BATCH_SIZE / $BATCH_ELAPSED" | bc 2>/dev/null || echo "N/A")"
  echo ""

  # Rotate logs: keep only the 20 most recent batch logs
  ls -1t "$LOG_DIR"/batch-*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null || true

  # Brief pause between batches (let system breathe)
  sleep 2
done
