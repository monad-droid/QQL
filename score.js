const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { initCLIP, scoreCLIP } = require("./clip-score");

// =============================================================================
// QQL Mona Lisa Scorer
//
// Scoring system:
//   Pass 1 (Heuristic - all images, fast pre-filter):
//     Lightweight color/composition checks. Threshold is set to 0 so all
//     images advance to CLIP — the heuristic is just for tiebreaking.
//
//   Pass 2 (CLIP semantic comparison):
//     Uses CLIP vision model to compute image-to-image similarity against
//     reference images in ./references/. This is the real judge.
//
//   Final ranking: CLIP score (primary), heuristic (tiebreaker).
//
// Usage: node score.js <renders-dir> [top-n]
// Output: Ranked list of best candidates + copies top-N to results/
// =============================================================================

// Mona Lisa tones: dark values, warm browns/ambers, muted greens.
// Heuristic is lightweight — CLIP does the real work (threshold = 0).

const REFERENCES_DIR = path.join(__dirname, "lisa-reference");

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

// Dark pixel: brightness <= 40
function isDark(h, s, b) {
  return b <= 40;
}

// Warm pixel: hue 0-60 (reds/oranges/yellows/browns) with some saturation
function isWarm(h, s, b) {
  return h >= 0 && h <= 60 && s >= 10 && b >= 10;
}

// Muted/earthy pixel: low saturation, mid brightness (the sfumato look)
function isMuted(h, s, b) {
  return s <= 40 && b >= 15 && b <= 70;
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

  let darkPixels = 0;
  let warmPixels = 0;
  let mutedPixels = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsb = rgbToHsb(r, g, b);

      if (isDark(hsb.h, hsb.s, hsb.b)) darkPixels++;
      if (isWarm(hsb.h, hsb.s, hsb.b)) warmPixels++;
      if (isMuted(hsb.h, hsb.s, hsb.b)) mutedPixels++;
    }
  }

  // =========================================================================
  // Score 1: Dark tones (0-30) — Mona Lisa is predominantly dark
  // =========================================================================
  const darkRatio = darkPixels / totalPixels;
  let darkScore = 0;
  if (darkRatio >= 0.2 && darkRatio <= 0.8) {
    darkScore = 30;
  } else if (darkRatio >= 0.05 && darkRatio < 0.2) {
    darkScore = 30 * (darkRatio - 0.05) / 0.15;
  } else if (darkRatio > 0.8) {
    darkScore = 30 * Math.max(0, 1 - (darkRatio - 0.8) / 0.15);
  }

  // =========================================================================
  // Score 2: Warm tones (0-30) — browns, ambers, skin tones
  // =========================================================================
  const warmRatio = warmPixels / totalPixels;
  let warmScore = 0;
  if (warmRatio >= 0.1 && warmRatio <= 0.6) {
    warmScore = 30;
  } else if (warmRatio >= 0.02 && warmRatio < 0.1) {
    warmScore = 30 * (warmRatio - 0.02) / 0.08;
  } else if (warmRatio > 0.6) {
    warmScore = 30 * Math.max(0, 1 - (warmRatio - 0.6) / 0.3);
  }

  // =========================================================================
  // Score 3: Muted tones (0-20) — low-saturation earthy colors (sfumato)
  // =========================================================================
  const mutedRatio = mutedPixels / totalPixels;
  let mutedScore = 0;
  if (mutedRatio >= 0.15) {
    mutedScore = 20 * Math.min(mutedRatio / 0.4, 1.0);
  }

  const totalScore = darkScore + warmScore + mutedScore;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    darkScore: Math.round(darkScore * 100) / 100,
    warmScore: Math.round(warmScore * 100) / 100,
    mutedScore: Math.round(mutedScore * 100) / 100,
    darkRatio: Math.round(darkRatio * 1000) / 1000,
    warmRatio: Math.round(warmRatio * 1000) / 1000,
    mutedRatio: Math.round(mutedRatio * 1000) / 1000,
  };
}

// =============================================================================
// CLIP initialization helper
// =============================================================================
const HEURISTIC_THRESHOLD = 0; // all images go to CLIP (heuristic is just for tiebreaking)

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
  console.log("─".repeat(95));
  if (hasClip) {
    console.log(
      "Rank  Similarity  BestRef                Heur    Dark    Warm    Muted   File"
    );
  } else {
    console.log(
      "Rank  Score   Dark    Warm    Muted   DarkR   WarmR   File"
    );
  }
  console.log("─".repeat(95));
  for (let i = 0; i < Math.min(topN, scores.length); i++) {
    const s = scores[i];
    if (hasClip) {
      console.log(
        `#${String(i + 1).padStart(3)}  ` +
          `${String(s.similarity ?? "-").padStart(10)}  ` +
          `${(s.bestRef ?? "-").padEnd(21).slice(0, 21)}  ` +
          `${String(s.totalScore).padStart(6)}  ` +
          `${String(s.darkScore).padStart(6)}  ` +
          `${String(s.warmScore).padStart(6)}  ` +
          `${String(s.mutedScore).padStart(6)}   ` +
          `${s.file.slice(0, 26)}`
      );
    } else {
      console.log(
        `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
          `${String(s.darkScore).padStart(6)}  ${String(s.warmScore).padStart(6)}  ` +
          `${String(s.mutedScore).padStart(6)}  ` +
          `${String(s.darkRatio).padStart(7)}  ` +
          `${String(s.warmRatio).padStart(7)}  ${s.file.slice(0, 30)}`
      );
    }
  }
  console.log("─".repeat(95));

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
