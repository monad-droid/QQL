const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

// =============================================================================
// QQL Pepe Scorer
//
// Scores generated QQL images for Pepe-likeness using multiple heuristics:
//   1. Green dominance - How much of the image is green (Pepe's face)
//   2. Eye detection  - Presence of two light/white circular regions in upper half
//   3. Symmetry       - Bilateral symmetry (Pepe's face is roughly symmetric)
//   4. Dark center    - Dark regions inside light regions (pupils)
//
// Usage: node score.js <renders-dir> [top-n]
// Output: Ranked list of best candidates + copies top-N to results/
// =============================================================================

// Edinburgh greens: eCoolDarkGreen (hue 170), eMidGreen (hue 150),
// Edinburgh Green bg (hue 150). Broader range to catch green variations.
const PEPE_GREEN_HUE_MIN = 120;
const PEPE_GREEN_HUE_MAX = 200;
const PEPE_GREEN_SAT_MIN = 15;
const PEPE_GREEN_BRIGHT_MAX = 85;
const PEPE_GREEN_BRIGHT_MIN = 10; // Edinburgh greens go as low as bright 20

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

function isGreen(h, s, b) {
  return (
    h >= PEPE_GREEN_HUE_MIN &&
    h <= PEPE_GREEN_HUE_MAX &&
    s >= PEPE_GREEN_SAT_MIN &&
    b >= PEPE_GREEN_BRIGHT_MIN &&
    b <= PEPE_GREEN_BRIGHT_MAX
  );
}

function isLight(h, s, b) {
  return b >= 75 && s <= 30;
}

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
  let greenPixels = 0;
  let lightPixelsTop = 0;
  let darkPixelsTop = 0;
  let lightPixelsBottom = 0;

  // Split image into quadrants for spatial analysis
  const midY = Math.floor(h / 2);
  const midX = Math.floor(w / 2);

  let greenTop = 0, greenBottom = 0;
  let lightTopLeft = 0, lightTopRight = 0;
  let darkTopLeft = 0, darkTopRight = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsb = rgbToHsb(r, g, b);

      if (isGreen(hsb.h, hsb.s, hsb.b)) {
        greenPixels++;
        if (y < midY) greenTop++;
        else greenBottom++;
      }

      if (y < midY) {
        if (isLight(hsb.h, hsb.s, hsb.b)) {
          lightPixelsTop++;
          if (x < midX) lightTopLeft++;
          else lightTopRight++;
        }
        if (isDark(hsb.h, hsb.s, hsb.b)) {
          darkPixelsTop++;
          if (x < midX) darkTopLeft++;
          else darkTopRight++;
        }
      } else {
        if (isLight(hsb.h, hsb.s, hsb.b)) lightPixelsBottom++;
      }
    }
  }

  const topPixels = midY * w;
  const quadPixels = midY * midX;

  // Score 1: Green dominance (0-30 points)
  // Pepe is mostly green. Want 30-70% green overall.
  const greenRatio = greenPixels / totalPixels;
  let greenScore = 0;
  if (greenRatio >= 0.3 && greenRatio <= 0.7) {
    greenScore = 30 * (1 - Math.abs(greenRatio - 0.5) / 0.2);
  } else if (greenRatio >= 0.15 && greenRatio < 0.3) {
    greenScore = 15 * (greenRatio / 0.3);
  }

  // Score 2: Eye regions - light spots in upper half (0-30 points)
  // Want two distinct light regions in upper-left and upper-right
  const lightTopRatio = lightPixelsTop / topPixels;
  const lightTopLeftRatio = lightTopLeft / quadPixels;
  const lightTopRightRatio = lightTopRight / quadPixels;

  let eyeScore = 0;
  // Both sides should have light regions (eyes)
  const minEyeRatio = Math.min(lightTopLeftRatio, lightTopRightRatio);
  const maxEyeRatio = Math.max(lightTopLeftRatio, lightTopRightRatio);
  if (minEyeRatio > 0.03 && maxEyeRatio < 0.5) {
    // Symmetry bonus: both eyes similar size
    const eyeSymmetry = minEyeRatio / (maxEyeRatio || 0.001);
    eyeScore = 20 * Math.min(minEyeRatio / 0.1, 1.0) + 10 * eyeSymmetry;
  }

  // Score 3: Dark pupils in upper half (0-20 points)
  // Want some dark spots inside the light regions (pupils)
  const darkTopRatio = darkPixelsTop / topPixels;
  let pupilScore = 0;
  if (darkTopRatio > 0.01 && darkTopRatio < 0.2) {
    const darkLeftRatio = darkTopLeft / quadPixels;
    const darkRightRatio = darkTopRight / quadPixels;
    const darkSymmetry =
      Math.min(darkLeftRatio, darkRightRatio) /
      (Math.max(darkLeftRatio, darkRightRatio) || 0.001);
    pupilScore = 12 * Math.min(darkTopRatio / 0.05, 1.0) + 8 * darkSymmetry;
  }

  // Score 4: Bilateral symmetry (0-20 points)
  // Compare left half vs mirrored right half
  let symmetryDiff = 0;
  const sampleStep = 4; // sample every 4th pixel for speed
  let sampleCount = 0;
  for (let y = 0; y < h; y += sampleStep) {
    for (let x = 0; x < midX; x += sampleStep) {
      const mirrorX = w - 1 - x;
      const idx1 = (y * w + x) * 4;
      const idx2 = (y * w + mirrorX) * 4;
      const dr = Math.abs(data[idx1] - data[idx2]);
      const dg = Math.abs(data[idx1 + 1] - data[idx2 + 1]);
      const db = Math.abs(data[idx1 + 2] - data[idx2 + 2]);
      symmetryDiff += (dr + dg + db) / (3 * 255);
      sampleCount++;
    }
  }
  const avgSymmetryDiff = symmetryDiff / sampleCount;
  const symmetryScore = 20 * Math.max(0, 1 - avgSymmetryDiff * 3);

  // Total score
  const totalScore = greenScore + eyeScore + pupilScore + symmetryScore;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    greenScore: Math.round(greenScore * 100) / 100,
    eyeScore: Math.round(eyeScore * 100) / 100,
    pupilScore: Math.round(pupilScore * 100) / 100,
    symmetryScore: Math.round(symmetryScore * 100) / 100,
    greenRatio: Math.round(greenRatio * 1000) / 1000,
    lightTopRatio: Math.round(lightTopRatio * 1000) / 1000,
  };
}

async function main(args) {
  const { rendersDir, topN } = parseArgs(args);

  const files = fs
    .readdirSync(rendersDir)
    .filter((f) => f.endsWith(".png"))
    .sort();

  if (files.length === 0) {
    console.error("No PNG files found in", rendersDir);
    process.exit(1);
  }

  console.log(`\n=== QQL Pepe Scorer ===`);
  console.log(`Scoring ${files.length} images from ${rendersDir}\n`);

  const scores = [];
  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(rendersDir, files[i]);
    process.stdout.write(`\rScoring ${i + 1}/${files.length}...`);
    try {
      const score = await scoreImage(filePath);
      scores.push({ file: files[i], path: filePath, ...score });
    } catch (err) {
      console.error(`\nError scoring ${files[i]}: ${err.message}`);
    }
  }
  console.log("\n");

  // Sort by total score descending
  scores.sort((a, b) => b.totalScore - a.totalScore);

  // Print top results
  console.log(`Top ${Math.min(topN, scores.length)} results:`);
  console.log("─".repeat(100));
  console.log(
    "Rank  Score   Green   Eyes    Pupils  Symmetry  GreenRatio  File"
  );
  console.log("─".repeat(100));
  for (let i = 0; i < Math.min(topN, scores.length); i++) {
    const s = scores[i];
    console.log(
      `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
        `${String(s.greenScore).padStart(6)}  ${String(s.eyeScore).padStart(6)}  ` +
        `${String(s.pupilScore).padStart(6)}  ${String(s.symmetryScore).padStart(8)}  ` +
        `${String(s.greenRatio).padStart(10)}  ${s.file.slice(0, 40)}`
    );
  }
  console.log("─".repeat(100));

  // Copy top-N to results directory
  const resultsDir = path.join(path.dirname(rendersDir), "results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  for (let i = 0; i < Math.min(topN, scores.length); i++) {
    const s = scores[i];
    const destName = `rank-${String(i + 1).padStart(3, "0")}-score-${s.totalScore}-${s.file}`;
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
