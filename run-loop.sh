#!/bin/bash
# QQL Art Hunter - Continuous Loop Mode
#
# Runs the pipeline in an infinite loop, accumulating the best results
# across all runs. Designed for 24/7 cloud operation.
#
# Usage: TARGET=monalisa ./run-loop.sh [batch-size] [top-n] [max-hall-of-fame]
#   batch-size:      images per batch (default: 500)
#   top-n:           top results to keep per batch (default: 20)
#   max-hall-of-fame: keep top N all-time results in hall-of-fame (default: 100)
#
# TARGET env var selects the hunt target (default: pepe).
#
# Output:
#   results/         current batch top results (overwritten each batch)
#   hall-of-fame/    rolling top-N all-time best results by DINOv3 similarity
#   logs/            per-batch logs with timestamps

set -e

export TARGET="${TARGET:-pepe}"
BATCH_SIZE=${1:-500}
TOP_N=${2:-20}
MAX_HOF=${3:-100}
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
echo "  QQL ${TARGET} Hunter - CONTINUOUS MODE"
echo "  Batch size:      $BATCH_SIZE images"
echo "  Keep per batch:  $TOP_N"
echo "  Hall-of-fame:    top $MAX_HOF all-time"
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

  # Promote top results to hall-of-fame (rolling top-N)
  BATCH_HITS=0
  if [ -f "results/_scores.json" ]; then
    node -e "
      const fs = require('fs');
      const path = require('path');
      const scores = JSON.parse(fs.readFileSync('results/_scores.json', 'utf8'));
      const maxHof = ${MAX_HOF};
      const hof = '${HALL_OF_FAME}';
      const ts = '${TIMESTAMP}';

      // Get existing hall-of-fame entries with their similarity scores
      // Filter out zombie files (0-byte/truncated from interrupted docker compose down)
      const MIN_PNG_SIZE = 1024;
      const existing = fs.readdirSync(hof)
        .filter(f => f.endsWith('.png') && f.startsWith('sim-'))
        .filter(f => {
          const size = fs.statSync(path.join(hof, f)).size;
          if (size < MIN_PNG_SIZE) {
            fs.unlinkSync(path.join(hof, f));
            console.log('  Removed corrupt entry (' + size + ' bytes): ' + f);
            return false;
          }
          return true;
        })
        .map(f => {
          const sim = parseFloat(f.split('-')[1]);
          return { file: f, sim: isNaN(sim) ? 0 : sim };
        })
        .sort((a, b) => b.sim - a.sim);

      // Find the current cutoff (lowest score in top N)
      const cutoff = existing.length >= maxHof ? existing[maxHof - 1].sim : 0;
      console.log('  HOF: ' + existing.length + ' entries, cutoff=' + cutoff.toFixed(4) + ', best=' + (existing[0] ? existing[0].sim.toFixed(4) : 'N/A'));

      // Copy new results that beat the cutoff (or if hall not full yet)
      let hits = 0;
      for (const s of scores) {
        if (s.similarity && (s.similarity > cutoff || existing.length + hits < maxHof)) {
          const src = s.path || path.join('renders', s.file);
          if (fs.existsSync(src)) {
            const ref = (s.bestRef || 'unknown').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
            const dest = path.join(hof, 'sim-' + s.similarity.toFixed(4) + '-ref-' + ref + '-batch' + ${BATCH} + '-' + ts + '-' + s.file);
            fs.copyFileSync(src, dest);
            hits++;
            console.log('  ★ HALL OF FAME: sim=' + s.similarity.toFixed(4) + ' ref=' + (s.bestRef || '?') + ' -> ' + path.basename(dest));
          }
        }
      }

      // Prune to keep only top N
      if (hits > 0) {
        const all = fs.readdirSync(hof)
          .filter(f => f.endsWith('.png') && f.startsWith('sim-'))
          .filter(f => fs.statSync(path.join(hof, f)).size >= MIN_PNG_SIZE)
          .map(f => {
            const sim = parseFloat(f.split('-')[1]);
            return { file: f, sim: isNaN(sim) ? 0 : sim };
          })
          .sort((a, b) => b.sim - a.sim);

        if (all.length > maxHof) {
          const toRemove = all.slice(maxHof);
          for (const entry of toRemove) {
            fs.unlinkSync(path.join(hof, entry.file));
          }
          console.log('  Pruned ' + toRemove.length + ' entries (kept top ' + maxHof + ')');
        }
      }

      // Update stats
      let stats = {};
      try { stats = JSON.parse(fs.readFileSync('${STATS_FILE}', 'utf8')); } catch(e) {}
      stats.totalBatches = (stats.totalBatches || 0) + 1;
      stats.totalImages = (stats.totalImages || 0) + ${BATCH_SIZE};
      stats.totalHits = (stats.totalHits || 0) + hits;
      stats.hallOfFameSize = Math.min(existing.length + hits, maxHof);
      stats.startedAt = stats.startedAt || '${STARTED_AT}';
      stats.lastBatchAt = new Date().toISOString();
      stats.lastBatchElapsed = ${BATCH_ELAPSED};

      // Track best ever
      const best = scores.reduce((a, b) => (b.similarity || 0) > (a.similarity || 0) ? b : a, {});
      if ((best.similarity || 0) > (stats.bestSimilarity || 0)) {
        stats.bestSimilarity = best.similarity;
        stats.bestFile = best.file;
      }

      // Track cutoff for visibility
      const finalAll = fs.readdirSync(hof)
        .filter(f => f.endsWith('.png') && f.startsWith('sim-'))
        .map(f => parseFloat(f.split('-')[1]))
        .filter(s => !isNaN(s))
        .sort((a, b) => b - a);
      stats.hofCutoff = finalAll.length >= maxHof ? finalAll[maxHof - 1] : 0;
      stats.hofBest = finalAll[0] || 0;

      fs.writeFileSync('${STATS_FILE}', JSON.stringify(stats, null, 2));
      console.log('  Batch hits: ' + hits);

      // Print full HOF scoreboard
      const rows = [];
      for (let i = 0; i < finalAll.length; i += 10) {
        rows.push(finalAll.slice(i, i + 10).map(s => s.toFixed(4)).join(' '));
      }
      console.log('  ── HOF scoreboard (' + finalAll.length + ' entries) ──');
      rows.forEach((r, i) => console.log('  ' + String(i * 10 + 1).padStart(3) + ': ' + r));
      console.log('  ──────────────────────────────');
    " || echo "  WARNING: hall-of-fame promotion script failed"
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
