#!/usr/bin/env node
// =============================================================================
// Hall-of-Fame Promotion — Per-Reference Top-50
//
// Maintains separate top-50 lists for each reference painting.
// Each reference gets its own subdirectory under hall-of-fame/.
// When a generation scores better than the worst in a reference's top-50,
// it replaces it.
//
// Usage: node promote-to-hof.js <batch-num> <timestamp> <batch-size> <batch-elapsed>
//
// Reads: results/_scores.json (must contain allSims per-reference scores)
// Writes: hall-of-fame/<ref-name>/*.png, hall-of-fame/_stats.json
// =============================================================================

const fs = require("fs");
const path = require("path");

const MAX_PER_REF = 50;
const MIN_PNG_SIZE = 1024;
const HOF_DIR = "hall-of-fame";
const SCORES_FILE = "results/_scores.json";
const STATS_FILE = path.join(HOF_DIR, "_stats.json");

function parseArgs() {
  const [batchNum, timestamp, batchSize, batchElapsed] = process.argv.slice(2);
  if (!batchNum || !timestamp) {
    console.error("Usage: node promote-to-hof.js <batch-num> <timestamp> <batch-size> <batch-elapsed>");
    process.exit(1);
  }
  return {
    batchNum: parseInt(batchNum),
    timestamp,
    batchSize: parseInt(batchSize) || 500,
    batchElapsed: parseInt(batchElapsed) || 0,
  };
}

// Sanitize reference filename into a directory name
function refToDirName(refName) {
  return refName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

// Read existing entries from a reference's HOF directory, pruning corrupt files
function getRefEntries(refDir) {
  if (!fs.existsSync(refDir)) return [];

  return fs
    .readdirSync(refDir)
    .filter((f) => f.endsWith(".png") && f.startsWith("sim-"))
    .filter((f) => {
      const size = fs.statSync(path.join(refDir, f)).size;
      if (size < MIN_PNG_SIZE) {
        fs.unlinkSync(path.join(refDir, f));
        console.log("  Removed corrupt entry (" + size + " bytes): " + f);
        return false;
      }
      return true;
    })
    .map((f) => {
      const sim = parseFloat(f.split("-")[1]);
      return { file: f, sim: isNaN(sim) ? 0 : sim };
    })
    .sort((a, b) => b.sim - a.sim);
}

function main() {
  const { batchNum, timestamp, batchSize, batchElapsed } = parseArgs();

  if (!fs.existsSync(SCORES_FILE)) {
    console.log("  No scores file found, skipping promotion.");
    return;
  }

  const scores = JSON.parse(fs.readFileSync(SCORES_FILE, "utf8"));
  fs.mkdirSync(HOF_DIR, { recursive: true });

  let totalHits = 0;
  const refStats = {}; // track per-ref activity for the scoreboard

  for (let si = 0; si < scores.length; si++) {
    const s = scores[si];
    // Need allSims for per-reference scoring
    const sims = s.allSims;
    if (!sims || sims.length === 0) continue;

    const src = s.path || path.join("renders", s.file);
    if (!fs.existsSync(src)) continue;

    let imageHits = 0;
    let imageBestSim = 0;
    let imageBestRef = "";

    // Try to promote this image into each reference's top-50
    for (const { name: refName, sim } of sims) {
      if (!sim || sim <= 0) continue;

      const dirName = refToDirName(refName);
      const refDir = path.join(HOF_DIR, dirName);
      fs.mkdirSync(refDir, { recursive: true });

      const entries = getRefEntries(refDir);
      const cutoff = entries.length >= MAX_PER_REF ? entries[entries.length - 1].sim : 0;

      // Only promote if beats the cutoff or room available
      if (sim > cutoff || entries.length < MAX_PER_REF) {
        const dest = path.join(
          refDir,
          "sim-" + sim.toFixed(4) + "-batch" + batchNum + "-" + timestamp + "-" + s.file
        );
        fs.copyFileSync(src, dest);
        totalHits++;
        imageHits++;

        if (sim > imageBestSim) {
          imageBestSim = sim;
          imageBestRef = dirName;
        }

        if (!refStats[dirName]) {
          refStats[dirName] = { hits: 0, best: 0, pruned: 0 };
        }
        refStats[dirName].hits++;
        refStats[dirName].best = Math.max(refStats[dirName].best, sim);

        // Prune: remove the worst if over MAX_PER_REF
        const updated = getRefEntries(refDir);
        if (updated.length > MAX_PER_REF) {
          const toRemove = updated.slice(MAX_PER_REF);
          for (const entry of toRemove) {
            fs.unlinkSync(path.join(refDir, entry.file));
            refStats[dirName].pruned++;
          }
        }
      }
    }

    // Log one summary line per image instead of per-reference
    if (imageHits > 0) {
      process.stdout.write(
        "\r  Promoting: " + (si + 1) + "/" + scores.length +
        " | " + s.file.substring(0, 30) +
        " -> " + imageHits + " refs (best: " + imageBestRef.substring(0, 25) +
        " " + imageBestSim.toFixed(4) + ")"
      );
    }
  }
  if (totalHits > 0) console.log("");

  // Print per-reference scoreboard
  const refDirs = fs
    .readdirSync(HOF_DIR)
    .filter((d) => {
      const p = path.join(HOF_DIR, d);
      return fs.statSync(p).isDirectory() && d !== "." && d !== "..";
    })
    .sort();

  console.log("");
  console.log("  \u2500\u2500 Per-Reference Hall of Fame (top " + MAX_PER_REF + " each) \u2500\u2500");
  let globalBest = 0;
  let totalEntries = 0;

  for (const dir of refDirs) {
    const entries = getRefEntries(path.join(HOF_DIR, dir));
    if (entries.length === 0) continue;
    totalEntries += entries.length;
    const best = entries[0]?.sim || 0;
    const worst = entries[entries.length - 1]?.sim || 0;
    globalBest = Math.max(globalBest, best);
    const activity = refStats[dir];
    const hitStr = activity ? " (+" + activity.hits + " new" + (activity.pruned ? ", -" + activity.pruned + " pruned" : "") + ")" : "";
    console.log(
      "  " +
        dir.substring(0, 40).padEnd(42) +
        entries.length.toString().padStart(3) +
        "/50  best=" +
        best.toFixed(4) +
        "  floor=" +
        worst.toFixed(4) +
        hitStr
    );
  }
  console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  console.log("  Total: " + totalEntries + " entries across " + refDirs.length + " references");
  console.log("  Batch hits: " + totalHits);

  // Update stats
  let stats = {};
  try {
    stats = JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
  } catch (e) {}
  stats.totalBatches = (stats.totalBatches || 0) + 1;
  stats.totalImages = (stats.totalImages || 0) + batchSize;
  stats.totalHits = (stats.totalHits || 0) + totalHits;
  stats.totalEntries = totalEntries;
  stats.referenceCount = refDirs.length;
  stats.maxPerRef = MAX_PER_REF;
  stats.bestSimilarity = Math.max(stats.bestSimilarity || 0, globalBest);
  stats.startedAt = stats.startedAt || new Date().toISOString();
  stats.lastBatchAt = new Date().toISOString();
  stats.lastBatchElapsed = batchElapsed;

  // Per-reference summary in stats
  stats.references = {};
  for (const dir of refDirs) {
    const entries = getRefEntries(path.join(HOF_DIR, dir));
    if (entries.length === 0) continue;
    stats.references[dir] = {
      count: entries.length,
      best: entries[0]?.sim || 0,
      floor: entries[entries.length - 1]?.sim || 0,
    };
  }

  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

main();
