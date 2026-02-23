// =============================================================================
// TARGET: Pepe the Frog
//
// Edinburgh palette: Earthy/muted greens, cream whites, gray-blues.
// Heuristics: Green dominance, eye blob detection, mouth warm tones.
// =============================================================================
const { createCanvas, loadImage } = require("canvas");

const name = "Pepe";

// Edinburgh palette optimized for Pepe's earthy/muted green
const traits = {
  colorPalette: "Edinburgh",
  colorMode: "Simple",
  colorVariety: "Low",
  turbulence: "None",
  bullseyeRings1: "On",
  bullseyeRings3: "On",
  bullseyeRings7: "On",
  ringThickness: "Thick",
  sizeVariety: "Wild",
  structure: null,
  flowField: null,
  margin: "Wide",
  ringSize: null,
  spacing: "Dense",
};

const heuristicThreshold = 20;

// Text prompts for CLIP text-to-image scoring
const textPrompts = [
  // Pepe / frog
  "Pepe the frog",
  "Pepe the frog meme, green frog face",
  "green frog with big eyes and wide mouth",
  "abstract green circles resembling a frog face with two white eyes",
  "green circular pattern with two symmetrical white dots like eyes",
  // Turtle
  "green turtle face with round shell pattern",
  "turtle head with large dark eyes, green and brown",
  "abstract green turtle made of concentric circles",
  // Alien
  "alien face with large oval eyes, green skin",
  "green alien head with big black almond-shaped eyes",
  "abstract alien face made of circles and rings",
  // Shrek
  "Shrek green ogre face with round ears",
  "green ogre face with small eyes and wide mouth",
  "Shrek cartoon character, green face",
  // Yoda / Baby Yoda
  "Yoda green face with large pointed ears and big eyes",
  "Baby Yoda Grogu, green creature with huge round eyes",
  "small green alien creature with oversized eyes",
  // Abstract art bridging prompts
  "generative art with green tones forming a face shape, two bright circles as eyes",
  "muted green and cream abstract face with large round eyes",
  "earthy green geometric art with two prominent white circular shapes",
];

// Reference image URLs for download-references.sh
const referenceUrls = [
  {
    name: "pepe-classic.png",
    url: "https://upload.wikimedia.org/wikipedia/en/6/63/Feels_good_man.jpg",
  },
];

// ── Color detection ─────────────────────────────────────────────────────────

const PEPE_GREEN_HUE_MIN = 70;
const PEPE_GREEN_HUE_MAX = 200;
const PEPE_GREEN_SAT_MIN = 10;
const PEPE_GREEN_BRIGHT_MAX = 100;
const PEPE_GREEN_BRIGHT_MIN = 10;

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

function isMouthColor(h, s, b) {
  const isWarm = h >= 0 && h <= 60 && s >= 15 && b >= 15 && b <= 95;
  const isDark = b <= 30;
  return isWarm || isDark;
}

// ── Blob detection ──────────────────────────────────────────────────────────

function findBlobs(mask, w, h, minSize) {
  const visited = new Uint8Array(w * h);
  const blobs = [];
  for (let i = 0; i < w * h; i++) {
    if (mask[i] && !visited[i]) {
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
          pixels, minX, maxX, minY, maxY,
          cx: sumX / pixels, cy: sumY / pixels,
          bboxW: maxX - minX + 1, bboxH: maxY - minY + 1,
        });
      }
    }
  }
  return blobs;
}

// ── Heuristic scorer ────────────────────────────────────────────────────────

async function scoreImage(imagePath) {
  const img = await loadImage(imagePath);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;

  const totalPixels = w * h;
  const midX = Math.floor(w / 2);

  let greenPixels = 0;
  const lightMask = new Uint8Array(w * h);
  let mouthPixels = 0;
  let mouthLeft = 0, mouthRight = 0;

  const mouthGridCols = 8;
  const mouthGridRows = 4;
  const mouthGrid = new Float64Array(mouthGridCols * mouthGridRows);
  const mouthStartY = Math.floor(h * 0.5);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsb = rgbToHsb(r, g, b);

      if (isGreen(hsb.h, hsb.s, hsb.b)) greenPixels++;
      if (isLight(hsb.h, hsb.s, hsb.b)) lightMask[y * w + x] = 1;

      if (y >= mouthStartY && isMouthColor(hsb.h, hsb.s, hsb.b)) {
        mouthPixels++;
        if (x < midX) mouthLeft++;
        else mouthRight++;
        const gx = Math.min(Math.floor((x / w) * mouthGridCols), mouthGridCols - 1);
        const gy = Math.min(Math.floor(((y - mouthStartY) / (h - mouthStartY)) * mouthGridRows), mouthGridRows - 1);
        mouthGrid[gy * mouthGridCols + gx]++;
      }
    }
  }

  // Score 1: Green dominance (0-30)
  const greenRatio = greenPixels / totalPixels;
  let greenScore = 0;
  if (greenRatio >= 0.2 && greenRatio <= 0.75) {
    greenScore = 30;
  } else if (greenRatio >= 0.08 && greenRatio < 0.2) {
    greenScore = 30 * (greenRatio - 0.08) / 0.12;
  } else if (greenRatio > 0.75) {
    greenScore = 30 * Math.max(0, 1 - (greenRatio - 0.75) / 0.2);
  }

  // Score 2: Eye detection via blob analysis (0-30)
  const minBlobSize = Math.floor(totalPixels * 0.002);
  const allBlobs = findBlobs(lightMask, w, h, minBlobSize);
  const upperBlobs = allBlobs.filter(b => b.cy < h * 0.6);

  let eyeScore = 0;
  let bestEyePair = null;
  for (let i = 0; i < upperBlobs.length; i++) {
    for (let j = i + 1; j < upperBlobs.length; j++) {
      const a = upperBlobs[i];
      const b = upperBlobs[j];
      const sizeRatio = Math.min(a.pixels, b.pixels) / Math.max(a.pixels, b.pixels);
      if (sizeRatio < 0.33) continue;
      const dx = Math.abs(a.cx - b.cx);
      if (dx < w * 0.1) continue;
      const dy = Math.abs(a.cy - b.cy);
      if (dy > h * 0.2) continue;
      const arA = a.bboxW / (a.bboxH || 1);
      const arB = b.bboxW / (b.bboxH || 1);
      if (arA > 3 || arA < 0.33) continue;
      if (arB > 3 || arB < 0.33) continue;
      const avgSize = (a.pixels + b.pixels) / 2;
      const sizeScore = Math.min(avgSize / (totalPixels * 0.01), 1.0);
      const pairScore = sizeScore * sizeRatio;
      if (pairScore > eyeScore) {
        eyeScore = pairScore;
        bestEyePair = [a, b];
      }
    }
  }
  eyeScore = 30 * Math.min(eyeScore, 1.0);

  // Score 3: Mouth region (0-20)
  const mouthRegionPixels = (h - mouthStartY) * w;
  const mouthRatio = mouthPixels / mouthRegionPixels;
  let mouthScore = 0;
  if (mouthRatio > 0.02 && mouthRatio < 0.6) {
    const cellPixels = Array.from(mouthGrid);
    cellPixels.sort((a, b) => b - a);
    const totalMouth = mouthPixels || 1;
    const topCells = Math.max(1, Math.floor(mouthGridCols * mouthGridRows * 0.25));
    let topSum = 0;
    for (let i = 0; i < topCells; i++) topSum += cellPixels[i];
    const concentration = topSum / totalMouth;
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

// ── Table headers for console output ────────────────────────────────────────

const clipHeader = "Rank  Similarity  BestRef                Heur    Green   Eyes    Mouth   File";
const heurHeader = "Rank  Score   Green   Eyes    Mouth   Blobs  GreenRatio  File";

function formatClipRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ` +
    `${String(s.similarity ?? "-").padStart(10)}  ` +
    `${(s.bestRef ?? "-").padEnd(21).slice(0, 21)}  ` +
    `${String(s.totalScore).padStart(6)}  ` +
    `${String(s.greenScore).padStart(6)}  ` +
    `${String(s.eyeScore).padStart(6)}  ` +
    `${String(s.mouthScore).padStart(6)}   ` +
    `${s.file.slice(0, 26)}`
  );
}

function formatHeurRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
    `${String(s.greenScore).padStart(6)}  ${String(s.eyeScore).padStart(6)}  ` +
    `${String(s.mouthScore).padStart(6)}  ` +
    `${String(s.eyeBlobs || 0).padStart(5)}  ` +
    `${String(s.greenRatio).padStart(10)}  ${s.file.slice(0, 30)}`
  );
}

module.exports = {
  name,
  traits,
  heuristicThreshold,
  textPrompts,
  referenceUrls,
  scoreImage,
  clipHeader,
  heurHeader,
  formatClipRow,
  formatHeurRow,
};
