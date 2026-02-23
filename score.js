const fs = require("fs");
const path = require("path");
const { initCLIP, scoreCLIP } = require("./clip-score");

// =============================================================================
// QQL Art Hunter — Scorer
//
// Target-agnostic pipeline. The TARGET env var (default: "pepe") selects which
// heuristic scorer and table formatting to use from ./targets/<name>.js.
//
// Two-pass scoring system:
//   Pass 1 (Heuristic - all images):
//     Target-specific pixel analysis.
//
//   Pass 2 (CLIP semantic comparison - all images):
//     Image-to-image similarity against reference images in ./references/.
//
//   Final ranking: CLIP score (primary), heuristic (tiebreaker).
//
// Usage: node score.js <renders-dir> [top-n]
// =============================================================================

const { loadTarget } = require("./targets");
const target = loadTarget();

function parseArgs(args) {
  let [rendersDir, topN] = args;
  if (!rendersDir) {
    console.error("Usage: node score.js <renders-dir> [top-n]");
    console.error("  renders-dir: directory containing generated PNGs");
    console.error("  top-n:       how many top results to copy (default: 20)");
    process.exit(1);
  }
  topN = topN ? parseInt(topN) : 20;
  return { rendersDir, topN };
}

async function main(args) {
  const { rendersDir, topN } = parseArgs(args);

  const files = fs
    .readdirSync(rendersDir)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.error("No image files found in", rendersDir);
    process.exit(1);
  }

  console.log(`=== QQL ${target.name} Scorer ===`);
  console.log(`Scoring ${files.length} images from ${rendersDir}\n`);

  // Pass 1: Heuristic scoring (all images) — fast pre-filter
  const scores = [];
  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(rendersDir, files[i]);
    process.stdout.write(`\rPass 1 (heuristics): ${i + 1}/${files.length}...`);
    try {
      const score = await target.scoreImage(filePath);
      scores.push({ file: files[i], path: filePath, ...score });
    } catch (err) {
      console.error(`\nError scoring ${files[i]}: ${err.message}`);
    }
  }
  console.log(" Done.\n");

  // Sort by heuristic score
  scores.sort((a, b) => b.totalScore - a.totalScore);

  // Pass 2: CLIP scoring on ALL images
  let clipAvailable = false;
  console.log(`Pass 2 (CLIP): scoring all ${scores.length} images...`);
  console.log("  Initializing CLIP model...");
  try {
    await initCLIP();
    clipAvailable = true;
  } catch (err) {
    console.error(`\n  CLIP unavailable: ${err.message}`);
    console.log("  Falling back to heuristic-only scoring.");
    console.log("  To enable CLIP: ensure internet access on first run + reference images in ./references/\n");
  }

  if (clipAvailable) {
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i];
      process.stdout.write(`\r  CLIP scoring: ${i + 1}/${scores.length}...`);
      try {
        const clip = await scoreCLIP(s.path);
        s.similarity = clip.similarity;
        s.bestRef = clip.bestRef;
      } catch (err) {
        console.error(`\n  CLIP error on ${s.file}: ${err.message}`);
        s.similarity = 0;
      }
    }
    console.log(" Done.\n");
  }

  // Sort: CLIP similarity (primary), heuristic (tiebreaker)
  scores.sort((a, b) => {
    if (a.similarity != null && b.similarity != null)
      return b.similarity - a.similarity || b.totalScore - a.totalScore;
    if (a.similarity != null) return -1;
    if (b.similarity != null) return 1;
    return b.totalScore - a.totalScore;
  });

  // Print top results using target-specific formatting
  const hasClip = clipAvailable;
  console.log(`Top ${Math.min(topN, scores.length)} results:`);
  console.log("─".repeat(99));
  console.log(hasClip ? target.clipHeader : target.heurHeader);
  console.log("─".repeat(99));
  const formatRow = hasClip ? target.formatClipRow : target.formatHeurRow;
  for (let i = 0; i < Math.min(topN, scores.length); i++) {
    console.log(formatRow(i, scores[i]));
  }
  console.log("─".repeat(99));

  // Copy top-N to results directory
  const resultsDir = path.join(path.dirname(rendersDir), "results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  for (let i = 0; i < Math.min(topN, scores.length); i++) {
    const s = scores[i];
    const sim = s.similarity ?? 0;
    const destName = `rank-${String(i + 1).padStart(3, "0")}-sim-${sim}-heur-${s.totalScore}-${s.file}`;
    fs.copyFileSync(s.path, path.join(resultsDir, destName));
  }
  console.log(`\nTop ${Math.min(topN, scores.length)} copied to ${resultsDir}/`);

  // Save full scores
  const scoresFile = path.join(resultsDir, "_scores.json");
  fs.writeFileSync(scoresFile, JSON.stringify(scores, null, 2));
  console.log(`Full scores saved to ${scoresFile}`);

  // Append batch summary to history log for tracking parameter experiments
  const historyFile = path.join(path.dirname(rendersDir), "hall-of-fame", "_history.jsonl");
  try {
    const historyDir = path.dirname(historyFile);
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    const clipScores = scores.filter((s) => s.similarity != null).map((s) => s.similarity);
    const heurScores = scores.map((s) => s.totalScore);

    const traits = typeof target.traits === "function" ? target.traits() : target.traits;
    const entry = {
      timestamp: new Date().toISOString(),
      target: target.name,
      traits: {
        colorPalette: traits.colorPalette,
        colorMode: traits.colorMode,
        colorVariety: traits.colorVariety,
        structure: traits.structure,
        flowField: traits.flowField,
        turbulence: traits.turbulence,
        margin: traits.margin,
        ringSize: traits.ringSize,
        sizeVariety: traits.sizeVariety,
        spacing: traits.spacing,
        ringThickness: traits.ringThickness,
      },
      batch: {
        totalImages: files.length,
        passedHeuristic: scores.filter((s) => s.totalScore >= target.heuristicThreshold).length,
        clipScored: clipScores.length,
      },
      clip: clipScores.length > 0 ? {
        best: Math.max(...clipScores),
        worst: Math.min(...clipScores),
        avg: +(clipScores.reduce((a, b) => a + b, 0) / clipScores.length).toFixed(4),
        median: +clipScores.sort((a, b) => a - b)[Math.floor(clipScores.length / 2)]?.toFixed(4),
        above90: clipScores.filter((s) => s >= 0.9).length,
        above85: clipScores.filter((s) => s >= 0.85).length,
        above80: clipScores.filter((s) => s >= 0.8).length,
      } : null,
      heuristic: {
        best: Math.max(...heurScores),
        avg: +(heurScores.reduce((a, b) => a + b, 0) / heurScores.length).toFixed(2),
        median: +heurScores.sort((a, b) => a - b)[Math.floor(heurScores.length / 2)]?.toFixed(2),
      },
    };

    fs.appendFileSync(historyFile, JSON.stringify(entry) + "\n");
    console.log(`Batch history appended to ${historyFile}`);
  } catch (err) {
    // Non-fatal — don't crash scoring if history write fails
    console.error(`Warning: could not write history: ${err.message}`);
  }
}

main(process.argv.slice(2)).catch((e) => {
  process.exitCode = 1;
  console.error(e);
});
