const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { initCLIP, scoreCLIP } = require("./clip-score");

// =============================================================================
// QQL Mona Lisa Scorer
//
// Two-pass scoring system:
//   Pass 1 (Heuristic - all images, fast pre-filter):
//     1. Warm tone dominance (0-30) - How much of the image is warm/golden
//     2. Vignette / dark surround (0-30) - Bright center, dark edges (portrait)
//     3. Central warm concentration (0-20) - Warm tones clustered in center
//     Threshold: images scoring >= 20 advance to Pass 2.
//
//   Pass 2 (CLIP semantic comparison - candidates only):
//     Uses OpenAI CLIP model to compute semantic similarity to Mona Lisa
//     reference images. This is the real judge — it understands what a
//     Renaissance portrait looks like, not just warm pixels and dark edges.
//     Score: 0-100 points.
//
//   Final ranking: CLIP score (primary), heuristic (tiebreaker).
//
// Usage: node score.js <renders-dir> [top-n]
// Output: Ranked list of best candidates + copies top-N to results/
// =============================================================================

// Warm tones: peach, golden-brown, amber, skin tones
// Fidenza palette warm range: fPaleYellow (h=43), fOrange (h=25), fPink (h=11),
// fBrown (h=25), fNewsprint (h=40)
const WARM_HUE_MIN = 5;
const WARM_HUE_MAX = 50;
const WARM_SAT_MIN = 10;
const WARM_SAT_MAX = 85;
const WARM_BRIGHT_MIN = 20;
const WARM_BRIGHT_MAX = 95;

const REFERENCES_DIR = path.join(__dirname, "references");

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

function rgbToHsb(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, b: v };
}

// Warm skin/golden tones — the dominant color of the Mona Lisa
function isWarm(h, s, b) {
  return (
    h >= WARM_HUE_MIN &&
    h <= WARM_HUE_MAX &&
    s >= WARM_SAT_MIN &&
    s <= WARM_SAT_MAX &&
    b >= WARM_BRIGHT_MIN &&
    b <= WARM_BRIGHT_MAX
  );
}

// Dark tones — background/hair regions in a Renaissance portrait
function isDark(h, s, b) {
  return b <= 30;
}

async function scoreImage(imagePath) {
  const img = await loadImage(imagePath);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;

  const totalPixels = w * h;
  const centerX = w / 2;
  const centerY = h / 2;
  // Inner zone: pixels within 35% of image half-diagonal from center
  const innerRadius = Math.sqrt(centerX * centerX + centerY * centerY) * 0.35;

  let warmPixels = 0;
  let darkPixels = 0;

  // Zone tracking for vignette detection
  let innerBrightnessSum = 0;
  let innerCount = 0;
  let outerBrightnessSum = 0;
  let outerCount = 0;
  let outerDarkPixels = 0;

  // Grid for warm concentration (4x4)
  const gridCols = 4;
  const gridRows = 4;
  const warmGrid = new Float64Array(gridCols * gridRows);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsb = rgbToHsb(r, g, b);

      // Distance from center
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isInner = dist <= innerRadius;

      // Track brightness by zone
      if (isInner) {
        innerBrightnessSum += hsb.b;
        innerCount++;
      } else {
        outerBrightnessSum += hsb.b;
        outerCount++;
        if (isDark(hsb.h, hsb.s, hsb.b)) outerDarkPixels++;
      }

      if (isWarm(hsb.h, hsb.s, hsb.b)) {
        warmPixels++;
        // Track grid cell for concentration
        const gx = Math.min(Math.floor((x / w) * gridCols), gridCols - 1);
        const gy = Math.min(Math.floor((y / h) * gridRows), gridRows - 1);
        warmGrid[gy * gridCols + gx]++;
      }

      if (isDark(hsb.h, hsb.s, hsb.b)) {
        darkPixels++;
      }
    }
  }

  // =========================================================================
  // Score 1: Warm tone dominance (0-30 points)
  //
  // The Mona Lisa is dominated by warm golden-brown tones. We want images
  // where a significant portion of pixels are in the warm range, but not
  // so much that it's just a flat warm rectangle.
  // =========================================================================
  const warmRatio = warmPixels / totalPixels;
  let warmScore = 0;
  if (warmRatio >= 0.15 && warmRatio <= 0.55) {
    warmScore = 30;
  } else if (warmRatio >= 0.05 && warmRatio < 0.15) {
    warmScore = 30 * (warmRatio - 0.05) / 0.10;
  } else if (warmRatio > 0.55) {
    warmScore = 30 * Math.max(0, 1 - (warmRatio - 0.55) / 0.25);
  }

  // =========================================================================
  // Score 2: Vignette / dark surround (0-30 points)
  //
  // Renaissance portraits have a bright subject against a dark background.
  // We measure the brightness differential between the center and edges,
  // and also check that the outer zone has substantial dark pixels.
  // =========================================================================
  const innerAvgBrightness = innerCount > 0 ? innerBrightnessSum / innerCount : 0;
  const outerAvgBrightness = outerCount > 0 ? outerBrightnessSum / outerCount : 0;
  const outerDarkRatio = outerCount > 0 ? outerDarkPixels / outerCount : 0;

  let vignetteScore = 0;
  // Brightness differential: center should be brighter than edges
  const brightnessDiff = innerAvgBrightness - outerAvgBrightness;
  if (brightnessDiff > 0) {
    // Score ramps from 5 to 25 brightness units difference
    const diffScore = Math.min(Math.max((brightnessDiff - 5) / 20, 0), 1.0);
    // Also require some dark pixels in outer zone (at least 15%)
    const darkPresence = Math.min(outerDarkRatio / 0.15, 1.0);
    vignetteScore = 30 * diffScore * darkPresence;
  }

  // =========================================================================
  // Score 3: Central warm concentration (0-20 points)
  //
  // The Mona Lisa's warm tones (face/hands) are concentrated in the center,
  // not spread uniformly. We check if the center 2x2 cells of a 4x4 grid
  // hold a disproportionate share of warm pixels.
  // =========================================================================
  let centerWarm = 0;
  const totalWarm = warmPixels || 1;
  // Center 2x2 cells (rows 1-2, cols 1-2 of 0-indexed 4x4 grid)
  for (let gy = 1; gy <= 2; gy++) {
    for (let gx = 1; gx <= 2; gx++) {
      centerWarm += warmGrid[gy * gridCols + gx];
    }
  }
  const centerConcentration = centerWarm / totalWarm;

  let concentrationScore = 0;
  // Center 2x2 is 25% of area. If it holds >30% of warm pixels, that's concentrated.
  // Full score at 45%+ concentration.
  if (centerConcentration > 0.25) {
    concentrationScore = 20 * Math.min((centerConcentration - 0.25) / 0.20, 1.0);
  }

  const totalScore = warmScore + vignetteScore + concentrationScore;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    warmScore: Math.round(warmScore * 100) / 100,
    vignetteScore: Math.round(vignetteScore * 100) / 100,
    concentrationScore: Math.round(concentrationScore * 100) / 100,
    warmRatio: Math.round(warmRatio * 1000) / 1000,
    darkRatio: Math.round((darkPixels / totalPixels) * 1000) / 1000,
    brightnessDiff: Math.round((innerAvgBrightness - outerAvgBrightness) * 10) / 10,
    centerConcentration: Math.round(centerConcentration * 1000) / 1000,
  };
}

// =============================================================================
// CLIP initialization helper
// =============================================================================
const HEURISTIC_THRESHOLD = 20; // minimum heuristic score to advance to CLIP

async function main(args) {
  const { rendersDir, topN } = parseArgs(args);

  const files = fs
    .readdirSync(rendersDir)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.error("No PNG files found in", rendersDir);
    process.exit(1);
  }

  console.log(`=== QQL Mona Lisa Scorer ===`);
  console.log(`Scoring ${files.length} images from ${rendersDir}\n`);

  // Pass 1: Heuristic scoring (all images) — fast pre-filter
  const scores = [];
  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(rendersDir, files[i]);
    process.stdout.write(`\rPass 1 (heuristics): ${i + 1}/${files.length}...`);
    try {
      const score = await scoreImage(filePath);
      scores.push({ file: files[i], path: filePath, ...score });
    } catch (err) {
      console.error(`\nError scoring ${files[i]}: ${err.message}`);
    }
  }
  console.log(" Done.\n");

  // Sort by heuristic score
  scores.sort((a, b) => b.totalScore - a.totalScore);

  // Filter candidates for Pass 2 — only images that pass heuristic threshold
  const clipCandidates = scores.filter((s) => s.totalScore >= HEURISTIC_THRESHOLD);
  const clipCount = clipCandidates.length;

  let clipAvailable = false;
  if (clipCount === 0) {
    console.log(`No images scored >= ${HEURISTIC_THRESHOLD} in heuristics. Skipping CLIP pass.`);
    console.log(`Best heuristic score: ${scores[0]?.totalScore || 0}\n`);
  } else {
    // Pass 2: CLIP image similarity — compare against reference images
    console.log(`Pass 2 (CLIP): ${clipCount}/${files.length} images passed heuristic threshold (>= ${HEURISTIC_THRESHOLD})`);
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
      for (let i = 0; i < clipCount; i++) {
        const s = clipCandidates[i];
        process.stdout.write(`\r  CLIP scoring: ${i + 1}/${clipCount}...`);
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
  }

  // Sort: CLIP similarity (primary), heuristic (tiebreaker)
  scores.sort((a, b) => {
    // CLIP-scored images first, sorted by similarity
    if (a.similarity != null && b.similarity != null)
      return b.similarity - a.similarity || b.totalScore - a.totalScore;
    if (a.similarity != null) return -1;
    if (b.similarity != null) return 1;
    return b.totalScore - a.totalScore;
  });

  // Print top results
  const hasClip = clipAvailable && clipCount > 0;
  console.log(`Top ${Math.min(topN, scores.length)} results:`);
  console.log("─".repeat(99));
  if (hasClip) {
    console.log(
      "Rank  Similarity  BestRef                Heur    Warm    Vignt   Conc    File"
    );
  } else {
    console.log(
      "Rank  Score   Warm    Vignt   Conc    WarmR   DarkR   BriDiff  CtrConc  File"
    );
  }
  console.log("─".repeat(99));
  for (let i = 0; i < Math.min(topN, scores.length); i++) {
    const s = scores[i];
    if (hasClip) {
      console.log(
        `#${String(i + 1).padStart(3)}  ` +
          `${String(s.similarity ?? "-").padStart(10)}  ` +
          `${(s.bestRef ?? "-").padEnd(21).slice(0, 21)}  ` +
          `${String(s.totalScore).padStart(6)}  ` +
          `${String(s.warmScore).padStart(6)}  ` +
          `${String(s.vignetteScore).padStart(6)}  ` +
          `${String(s.concentrationScore).padStart(6)}   ` +
          `${s.file.slice(0, 26)}`
      );
    } else {
      console.log(
        `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
          `${String(s.warmScore).padStart(6)}  ${String(s.vignetteScore).padStart(6)}  ` +
          `${String(s.concentrationScore).padStart(6)}  ` +
          `${String(s.warmRatio).padStart(6)}  ` +
          `${String(s.darkRatio).padStart(6)}  ` +
          `${String(s.brightnessDiff).padStart(8)}  ` +
          `${String(s.centerConcentration).padStart(7)}  ` +
          `${s.file.slice(0, 26)}`
      );
    }
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
}

main(process.argv.slice(2)).catch((e) => {
  process.exitCode = 1;
  console.error(e);
});
