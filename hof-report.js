#!/usr/bin/env node
// =============================================================================
// HOF Report — Show all references ranked by top similarity score
//
// Usage: node hof-report.js [--top N] [--min-score X]
//
// Scans hall-of-fame/ directories and ranks references by best match.
// =============================================================================

const fs = require("fs");
const path = require("path");

const HOF_DIR = "hall-of-fame";
const ART_REF_FILE = "data/art-references.json";

function parseArgs() {
  const args = process.argv.slice(2);
  let top = 0; // 0 = show all
  let minScore = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--top" && args[i + 1]) top = parseInt(args[++i]);
    if (args[i] === "--min-score" && args[i + 1]) minScore = parseFloat(args[++i]);
  }
  return { top, minScore };
}

function refToDirName(refName) {
  return refName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getRefEntries(refDir) {
  if (!fs.existsSync(refDir)) return [];
  return fs
    .readdirSync(refDir)
    .filter((f) => f.endsWith(".png") && f.startsWith("sim-"))
    .map((f) => {
      const sim = parseFloat(f.split("-")[1]);
      return { file: f, sim: isNaN(sim) ? 0 : sim };
    })
    .sort((a, b) => b.sim - a.sim);
}

function main() {
  const { top, minScore } = parseArgs();

  if (!fs.existsSync(HOF_DIR)) {
    console.log("No hall-of-fame/ directory found. Run some batches first!");
    process.exit(0);
  }

  // Load art references for title/artist lookup
  let artRefs = {};
  try {
    const refs = JSON.parse(fs.readFileSync(ART_REF_FILE, "utf8"));
    for (const ref of refs) {
      const dirName = refToDirName(ref.name);
      artRefs[dirName] = ref;
    }
  } catch (e) {
    console.log("Warning: Could not load art-references.json for title lookup");
  }

  // Scan all reference directories
  const refDirs = fs
    .readdirSync(HOF_DIR)
    .filter((d) => {
      const p = path.join(HOF_DIR, d);
      return fs.statSync(p).isDirectory();
    });

  const rows = [];
  for (const dir of refDirs) {
    const entries = getRefEntries(path.join(HOF_DIR, dir));
    if (entries.length === 0) continue;

    const best = entries[0].sim;
    const floor = entries[entries.length - 1].sim;
    const ref = artRefs[dir];

    if (best < minScore) continue;

    rows.push({
      dir,
      count: entries.length,
      best,
      floor,
      title: ref ? ref.title : dir,
      artist: ref ? ref.artist : "?",
      year: ref ? ref.year : "",
    });
  }

  // Sort by best similarity descending
  rows.sort((a, b) => b.best - a.best);

  const display = top > 0 ? rows.slice(0, top) : rows;

  if (display.length === 0) {
    console.log("No HOF entries found" + (minScore ? " above " + minScore : "") + ".");
    return;
  }

  // Stats file for global info
  let stats = {};
  try {
    stats = JSON.parse(fs.readFileSync(path.join(HOF_DIR, "_stats.json"), "utf8"));
  } catch (e) {}

  console.log("");
  if (stats.totalBatches) {
    console.log(
      "  Batches: " + stats.totalBatches +
      "  |  Images scored: " + (stats.totalImages || "?") +
      "  |  Total HOF entries: " + (stats.totalEntries || "?")
    );
    console.log("");
  }

  // Header
  const rankW = 5;
  const scoreW = 8;
  const floorW = 8;
  const countW = 6;
  const artistW = 25;
  const titleW = 45;

  console.log(
    "  " +
    "#".padStart(rankW) + "  " +
    "Best".padStart(scoreW) + "  " +
    "Floor".padStart(floorW) + "  " +
    "N".padStart(countW) + "  " +
    "Artist".padEnd(artistW) + "  " +
    "Title"
  );
  console.log("  " + "─".repeat(rankW + scoreW + floorW + countW + artistW + titleW + 12));

  for (let i = 0; i < display.length; i++) {
    const r = display[i];
    console.log(
      "  " +
      (i + 1).toString().padStart(rankW) + "  " +
      r.best.toFixed(4).padStart(scoreW) + "  " +
      r.floor.toFixed(4).padStart(floorW) + "  " +
      (r.count + "/50").padStart(countW) + "  " +
      r.artist.substring(0, artistW).padEnd(artistW) + "  " +
      r.title.substring(0, titleW)
    );
  }

  console.log("  " + "─".repeat(rankW + scoreW + floorW + countW + artistW + titleW + 12));
  console.log(
    "  Showing " + display.length + " of " + rows.length + " references with HOF entries"
  );
  console.log("");
}

main();
