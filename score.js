const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

// =============================================================================
// QQL Pepe Scorer
//
// Two-pass scoring system:
//   Pass 1 (Heuristic - all images, free & fast):
//     1. Green dominance (0-30) - How much of the image is green (Pepe's face)
//     2. Eye detection   (0-30) - Light/white regions in both sides of upper half
//     3. Mouth detection (0-20) - Warm/dark tones in the lower portion
//
//   Pass 2 (SSIM reference comparison - top candidates only):
//     Compares against reference Pepe images in ./references/
//     Takes the best match score across all references.
//
// Usage: node score.js <renders-dir> [top-n]
// Output: Ranked list of best candidates + copies top-N to results/
// =============================================================================

// Pepe greens span from yellow-green (~80) through blue-green (~200).
// Classic meme Pepe is hue ~85-110, Edinburgh palette is ~150-170.
const PEPE_GREEN_HUE_MIN = 70;
const PEPE_GREEN_HUE_MAX = 200;
const PEPE_GREEN_SAT_MIN = 10;
const PEPE_GREEN_BRIGHT_MAX = 100;
const PEPE_GREEN_BRIGHT_MIN = 10;

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


// Pepe mouth: warm/brown/red tones OR dark lines (black mouth outlines)
function isMouthColor(h, s, b) {
  const isWarm = h >= 0 && h <= 60 && s >= 15 && b >= 15 && b <= 95;
  const isDark = b <= 30;
  return isWarm || isDark;
}

// ---------------------------------------------------------------------------
// Blob detection via flood-fill on a binary mask
// Returns array of { pixels, minX, maxX, minY, maxY, cx, cy }
// ---------------------------------------------------------------------------
function findBlobs(mask, w, h, minSize) {
  const visited = new Uint8Array(w * h);
  const blobs = [];
  for (let i = 0; i < w * h; i++) {
    if (mask[i] && !visited[i]) {
      // BFS flood fill
      const queue = [i];
      visited[i] = 1;
      let pixels = 0;
      let minX = w, maxX = 0, minY = h, maxY = 0;
      let sumX = 0, sumY = 0;
      while (queue.length > 0) {
        const idx = queue.pop();
        const x = idx % w;
        const y = (idx - x) / w;
        pixels++;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        // 4-connected neighbors
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const ni = ny * w + nx;
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }
      }
      if (pixels >= minSize) {
        blobs.push({
          pixels,
          minX, maxX, minY, maxY,
          cx: sumX / pixels,
          cy: sumY / pixels,
          bboxW: maxX - minX + 1,
          bboxH: maxY - minY + 1,
        });
      }
    }
  }
  return blobs;
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
  const midY = Math.floor(h / 2);
  const midX = Math.floor(w / 2);

  // Build masks and count pixels in one pass
  let greenPixels = 0;
  const lightMask = new Uint8Array(w * h); // for blob detection
  let mouthPixels = 0;
  let mouthLeft = 0, mouthRight = 0;

  // Mouth concentration tracking — divide lower half into a grid
  const mouthGridCols = 8;
  const mouthGridRows = 4;
  const mouthGrid = new Float64Array(mouthGridCols * mouthGridRows);
  const mouthStartY = Math.floor(h * 0.5); // bottom half only

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsb = rgbToHsb(r, g, b);

      if (isGreen(hsb.h, hsb.s, hsb.b)) {
        greenPixels++;
      }

      if (isLight(hsb.h, hsb.s, hsb.b)) {
        lightMask[y * w + x] = 1;
      }

      // Mouth: bottom half only
      if (y >= mouthStartY && isMouthColor(hsb.h, hsb.s, hsb.b)) {
        mouthPixels++;
        if (x < midX) mouthLeft++;
        else mouthRight++;
        // Track which grid cell this falls in
        const gx = Math.min(Math.floor((x / w) * mouthGridCols), mouthGridCols - 1);
        const gy = Math.min(Math.floor(((y - mouthStartY) / (h - mouthStartY)) * mouthGridRows), mouthGridRows - 1);
        mouthGrid[gy * mouthGridCols + gx]++;
      }
    }
  }

  // =========================================================================
  // Score 1: Green dominance (0-30 points)
  // =========================================================================
  const greenRatio = greenPixels / totalPixels;
  let greenScore = 0;
  if (greenRatio >= 0.2 && greenRatio <= 0.75) {
    greenScore = 30;
  } else if (greenRatio >= 0.08 && greenRatio < 0.2) {
    greenScore = 30 * (greenRatio - 0.08) / 0.12;
  } else if (greenRatio > 0.75) {
    greenScore = 30 * Math.max(0, 1 - (greenRatio - 0.75) / 0.2);
  }

  // =========================================================================
  // Score 2: Eye detection via blob analysis (0-30 points)
  //
  // Find connected blobs of light pixels. Look for a PAIR that:
  //   - Are both in the upper 60% of the image
  //   - Are roughly the same size (within 3x of each other)
  //   - Are horizontally spaced (not stacked vertically)
  //   - Are at roughly the same height
  //   - Are each roughly circular (aspect ratio not too extreme)
  //   - Are large enough to be "eyes" not tiny dots
  // =========================================================================
  const minBlobSize = Math.floor(totalPixels * 0.002); // at least 0.2% of image
  const allBlobs = findBlobs(lightMask, w, h, minBlobSize);

  // Filter to blobs in upper 60%
  const upperBlobs = allBlobs.filter(b => b.cy < h * 0.6);

  let eyeScore = 0;
  let bestEyePair = null;

  for (let i = 0; i < upperBlobs.length; i++) {
    for (let j = i + 1; j < upperBlobs.length; j++) {
      const a = upperBlobs[i];
      const b = upperBlobs[j];

      // Size similarity — smaller blob should be at least 1/3 the size of larger
      const sizeRatio = Math.min(a.pixels, b.pixels) / Math.max(a.pixels, b.pixels);
      if (sizeRatio < 0.33) continue;

      // Horizontally separated — centers should be apart
      const dx = Math.abs(a.cx - b.cx);
      if (dx < w * 0.1) continue; // too close together horizontally

      // At roughly the same height — vertical offset small relative to image
      const dy = Math.abs(a.cy - b.cy);
      if (dy > h * 0.2) continue; // too far apart vertically

      // Each blob should be roughly circular (aspect ratio)
      const arA = a.bboxW / (a.bboxH || 1);
      const arB = b.bboxW / (b.bboxH || 1);
      if (arA > 3 || arA < 0.33) continue; // too elongated
      if (arB > 3 || arB < 0.33) continue;

      // Score this pair
      const avgSize = (a.pixels + b.pixels) / 2;
      const sizeScore = Math.min(avgSize / (totalPixels * 0.01), 1.0); // full marks at 1% each
      const pairScore = sizeScore * sizeRatio; // penalize size mismatch

      if (pairScore > eyeScore) {
        eyeScore = pairScore;
        bestEyePair = [a, b];
      }
    }
  }
  eyeScore = 30 * Math.min(eyeScore, 1.0);

  // =========================================================================
  // Score 3: Mouth region (0-20 points)
  //
  // Look for warm/dark pixels concentrated in the lower half.
  // Penalize if mouth-colored pixels are evenly spread everywhere
  // (that's just a warm-toned background, not a mouth).
  // =========================================================================
  const mouthRegionPixels = (h - mouthStartY) * w;
  const mouthRatio = mouthPixels / mouthRegionPixels;
  let mouthScore = 0;
  if (mouthRatio > 0.02 && mouthRatio < 0.6) {
    // Check concentration: what fraction of mouth pixels are in the densest cells?
    const cellPixels = Array.from(mouthGrid);
    cellPixels.sort((a, b) => b - a);
    const totalMouth = mouthPixels || 1;
    // Top 25% of cells (8 cells, top 2) should hold a good chunk of mouth pixels
    const topCells = Math.max(1, Math.floor(mouthGridCols * mouthGridRows * 0.25));
    let topSum = 0;
    for (let i = 0; i < topCells; i++) topSum += cellPixels[i];
    const concentration = topSum / totalMouth;
    // Uniform spread → concentration ≈ 0.25 (top 25% of cells hold 25%)
    // Concentrated mouth → concentration > 0.5
    // Score ramps from 0.3 to 0.7 concentration
    const concScore = Math.min(Math.max((concentration - 0.3) / 0.4, 0), 1.0);

    const presenceScore = Math.min(mouthRatio / 0.05, 1.0);
    mouthScore = 20 * presenceScore * concScore;
  }

  const totalScore = greenScore + eyeScore + mouthScore;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    greenScore: Math.round(greenScore * 100) / 100,
    eyeScore: Math.round(eyeScore * 100) / 100,
    mouthScore: Math.round(mouthScore * 100) / 100,
    greenRatio: Math.round(greenRatio * 1000) / 1000,
    eyeBlobs: bestEyePair ? bestEyePair.length : 0,
    mouthRatio: Math.round(mouthRatio * 1000) / 1000,
  };
}

// =============================================================================
// SSIM Reference Comparison (Pass 2)
// Compares a candidate image against all reference Pepe images and returns
// the best match. Uses a simplified SSIM on downscaled grayscale images.
// =============================================================================

function getPixelData(canvas, ctx, img, targetSize) {
  const tmpCanvas = createCanvas(targetSize, targetSize);
  const tmpCtx = tmpCanvas.getContext("2d");
  tmpCtx.drawImage(img, 0, 0, targetSize, targetSize);
  return tmpCtx.getImageData(0, 0, targetSize, targetSize).data;
}

function computeSSIM(data1, data2, w, h) {
  // Convert to grayscale luminance arrays
  const lum1 = [];
  const lum2 = [];
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    lum1.push(0.299 * data1[idx] + 0.587 * data1[idx + 1] + 0.114 * data1[idx + 2]);
    lum2.push(0.299 * data2[idx] + 0.587 * data2[idx + 1] + 0.114 * data2[idx + 2]);
  }

  const n = lum1.length;
  const mean1 = lum1.reduce((a, b) => a + b, 0) / n;
  const mean2 = lum2.reduce((a, b) => a + b, 0) / n;

  let var1 = 0, var2 = 0, covar = 0;
  for (let i = 0; i < n; i++) {
    const d1 = lum1[i] - mean1;
    const d2 = lum2[i] - mean2;
    var1 += d1 * d1;
    var2 += d2 * d2;
    covar += d1 * d2;
  }
  var1 /= n;
  var2 /= n;
  covar /= n;

  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;

  const ssim =
    ((2 * mean1 * mean2 + C1) * (2 * covar + C2)) /
    ((mean1 ** 2 + mean2 ** 2 + C1) * (var1 + var2 + C2));

  return ssim;
}

async function loadReferenceImages() {
  if (!fs.existsSync(REFERENCES_DIR)) return [];
  const files = fs.readdirSync(REFERENCES_DIR).filter((f) =>
    /\.(png|jpg|jpeg|webp)$/i.test(f)
  );
  const refs = [];
  for (const f of files) {
    const img = await loadImage(path.join(REFERENCES_DIR, f));
    refs.push({ name: f, img });
  }
  return refs;
}

async function scoreSSIM(imagePath, referenceImages, targetSize = 128) {
  if (referenceImages.length === 0) return { ssimScore: 0, bestMatch: "none" };

  const candidateImg = await loadImage(imagePath);
  const candidateCanvas = createCanvas(targetSize, targetSize);
  const candidateCtx = candidateCanvas.getContext("2d");
  candidateCtx.drawImage(candidateImg, 0, 0, targetSize, targetSize);
  const candidateData = candidateCtx.getImageData(0, 0, targetSize, targetSize).data;

  let bestSSIM = -1;
  let bestMatch = "";
  for (const ref of referenceImages) {
    const refCanvas = createCanvas(targetSize, targetSize);
    const refCtx = refCanvas.getContext("2d");
    refCtx.drawImage(ref.img, 0, 0, targetSize, targetSize);
    const refData = refCtx.getImageData(0, 0, targetSize, targetSize).data;

    const ssim = computeSSIM(candidateData, refData, targetSize, targetSize);
    if (ssim > bestSSIM) {
      bestSSIM = ssim;
      bestMatch = ref.name;
    }
  }

  // Normalize SSIM to a 0-20 point bonus score
  // SSIM ranges from -1 to 1, but typically 0 to 1 for similar images
  const ssimScore = Math.round(Math.max(0, bestSSIM) * 20 * 100) / 100;
  return { ssimScore, bestSSIM: Math.round(bestSSIM * 1000) / 1000, bestMatch };
}

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

  // Load reference images for Pass 2
  const referenceImages = await loadReferenceImages();
  const hasRefs = referenceImages.length > 0;
  if (hasRefs) {
    console.log(`Loaded ${referenceImages.length} reference image(s): ${referenceImages.map((r) => r.name).join(", ")}`);
  } else {
    console.log("No reference images found in ./references/ — running heuristic scoring only.");
    console.log("Add Pepe PNGs to ./references/ for SSIM comparison pass.\n");
  }

  console.log(`=== QQL Pepe Scorer ===`);
  console.log(`Scoring ${files.length} images from ${rendersDir}\n`);

  // Pass 1: Heuristic scoring (all images)
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

  // Pass 2: SSIM against references (top candidates only)
  if (hasRefs) {
    const ssimCandidates = Math.min(topN * 3, scores.length);
    console.log(`Pass 2 (SSIM vs ${referenceImages.length} refs): top ${ssimCandidates} candidates...`);
    for (let i = 0; i < ssimCandidates; i++) {
      process.stdout.write(`\r  Comparing ${i + 1}/${ssimCandidates}...`);
      const ssimResult = await scoreSSIM(scores[i].path, referenceImages);
      scores[i].ssimScore = ssimResult.ssimScore;
      scores[i].bestSSIM = ssimResult.bestSSIM;
      scores[i].bestMatch = ssimResult.bestMatch;
      scores[i].combinedScore =
        Math.round((scores[i].totalScore + ssimResult.ssimScore) * 100) / 100;
    }
    console.log(" Done.\n");

    // Re-sort by combined score
    scores.sort((a, b) => (b.combinedScore || b.totalScore) - (a.combinedScore || a.totalScore));
  }

  // Print top results
  const scoreKey = hasRefs ? "Combined" : "Score";
  console.log(`Top ${Math.min(topN, scores.length)} results:`);
  console.log("─".repeat(90));
  if (hasRefs) {
    console.log(
      "Rank  Combined  Heuristic  SSIM    Green   Eyes    Mouth   File"
    );
  } else {
    console.log(
      "Rank  Score   Green   Eyes    Mouth   Blobs  GreenRatio  File"
    );
  }
  console.log("─".repeat(90));
  for (let i = 0; i < Math.min(topN, scores.length); i++) {
    const s = scores[i];
    if (hasRefs) {
      console.log(
        `#${String(i + 1).padStart(3)}  ${String(s.combinedScore || 0).padStart(8)}  ` +
          `${String(s.totalScore).padStart(9)}  ${String(s.ssimScore || 0).padStart(5)}  ` +
          `${String(s.greenScore).padStart(6)}  ${String(s.eyeScore).padStart(6)}  ` +
          `${String(s.mouthScore).padStart(6)}  ${s.file.slice(0, 30)}`
      );
    } else {
      console.log(
        `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
          `${String(s.greenScore).padStart(6)}  ${String(s.eyeScore).padStart(6)}  ` +
          `${String(s.mouthScore).padStart(6)}  ` +
          `${String(s.eyeBlobs || 0).padStart(5)}  ` +
          `${String(s.greenRatio).padStart(10)}  ${s.file.slice(0, 30)}`
      );
    }
  }
  console.log("─".repeat(90));

  // Copy top-N to results directory
  const resultsDir = path.join(path.dirname(rendersDir), "results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  for (let i = 0; i < Math.min(topN, scores.length); i++) {
    const s = scores[i];
    const finalScore = s.combinedScore || s.totalScore;
    const destName = `rank-${String(i + 1).padStart(3, "0")}-score-${finalScore}-${s.file}`;
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
