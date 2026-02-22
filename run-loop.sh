#!/bin/bash
# QQL Pepe Hunter - Continuous Loop Mode
#
# Runs the pipeline in an infinite loop, accumulating the best results
# across all runs. Designed for 24/7 cloud operation.
#
# Usage: ./run-loop.sh [batch-size] [top-n] [min-similarity]
#   batch-size:      images per batch (default: 500)
#   top-n:           top results to keep per batch (default: 20)
#   min-similarity:  minimum CLIP similarity to save to hall-of-fame (default: 0.85)
#
# Output:
#   results/         current batch top results (overwritten each batch)
#   hall-of-fame/    all-time best results above min-similarity threshold
#   logs/            per-batch logs with timestamps

set -e

BATCH_SIZE=${1:-500}
TOP_N=${2:-20}
MIN_SIM=${3:-0.85}
HALL_OF_FAME="hall-of-fame"
LOG_DIR="logs"
STATS_FILE="$HALL_OF_FAME/_stats.json"

mkdir -p "$HALL_OF_FAME" "$LOG_DIR" results renders

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
echo "  QQL Pepe Hunter - CONTINUOUS MODE"
echo "  Batch size:      $BATCH_SIZE images"
echo "  Keep per batch:  $TOP_N"
echo "  Hall-of-fame:    similarity >= $MIN_SIM"
echo "  Logs:            $LOG_DIR/"
echo "  Results:         $HALL_OF_FAME/"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop. Results persist across restarts."
echo ""

BATCH=0
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TOTAL_HITS=0

# Trap SIGTERM/SIGINT for clean shutdown
trap 'echo ""; echo ">>> Shutting down after $BATCH batches ($((BATCH * BATCH_SIZE)) images)."; echo ">>> Hall-of-fame: $(ls "$HALL_OF_FAME"/*.png 2>/dev/null | wc -l) images"; exit 0' SIGTERM SIGINT

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

  # Promote high-scoring results to hall-of-fame
  BATCH_HITS=0
  if [ -f "results/_scores.json" ]; then
    # Extract results above threshold using Node (no Python dependency)
    node -e "
      const fs = require('fs');
      const path = require('path');
      const scores = JSON.parse(fs.readFileSync('results/_scores.json', 'utf8'));
      const minSim = ${MIN_SIM};
      const hof = '${HALL_OF_FAME}';
      const ts = '${TIMESTAMP}';
      let hits = 0;

      for (const s of scores) {
        if (s.similarity && s.similarity >= minSim) {
          const src = path.join('results',
            fs.readdirSync('results')
              .filter(f => f.endsWith('.png') && f.includes(s.file.replace('.png','')))
              [0] || ''
          );
          if (src && fs.existsSync(src)) {
            const dest = path.join(hof, 'sim-' + s.similarity.toFixed(4) + '-batch' + ${BATCH} + '-' + ts + '-' + s.file);
            fs.copyFileSync(src, dest);
            hits++;
            console.log('  ★ HALL OF FAME: sim=' + s.similarity.toFixed(4) + ' -> ' + dest);
          }
        }
      }

      // Update stats
      let stats = {};
      try { stats = JSON.parse(fs.readFileSync('${STATS_FILE}', 'utf8')); } catch(e) {}
      stats.totalBatches = ${BATCH};
      stats.totalImages = ${BATCH} * ${BATCH_SIZE};
      stats.totalHits = (stats.totalHits || 0) + hits;
      stats.startedAt = stats.startedAt || '${STARTED_AT}';
      stats.lastBatchAt = new Date().toISOString();
      stats.lastBatchElapsed = ${BATCH_ELAPSED};

      // Track best ever
      const best = scores.reduce((a, b) => (b.similarity || 0) > (a.similarity || 0) ? b : a, {});
      if ((best.similarity || 0) > (stats.bestSimilarity || 0)) {
        stats.bestSimilarity = best.similarity;
        stats.bestFile = best.file;
      }

      fs.writeFileSync('${STATS_FILE}', JSON.stringify(stats, null, 2));
      console.log('  Batch hits: ' + hits);
      process.stdout.write('HITS:' + hits);
    " 2>/dev/null || true
  fi

  # Summary
  HOF_COUNT=$(ls "$HALL_OF_FAME"/*.png 2>/dev/null | wc -l)
  echo ""
  echo "  Batch #$BATCH complete in ${BATCH_ELAPSED}s"
  echo "  Hall-of-fame total: $HOF_COUNT images"
  echo "  Images/sec: $(echo "scale=2; $BATCH_SIZE / $BATCH_ELAPSED" | bc 2>/dev/null || echo "N/A")"
  echo ""

  # Brief pause between batches (let system breathe)
  sleep 2
done
