// =============================================================================
// TARGET: Alien
//
// Miami palette: neon greens, electric blues, dark backgrounds.
// Heuristics: Green/cyan dominance, dark background, large central eyes.
// =============================================================================
const { createCanvas, loadImage } = require("canvas");

const name = "Alien";

// Traits optimized for alien-like appearance: big eyes, dark surround, green/blue tones
const traits = {
  colorPalette: "Miami",
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
  "alien face",
  "grey alien with big black eyes",
  "alien head, large eyes, green skin",
  "extraterrestrial being",
];

const referenceUrls = [];

// ── Color detection ─────────────────────────────────────────────────────────

function rgbToHsb(r, g, b) {
  r /= 255; g /= 255; b /= 255;
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

function isAlienGreen(h, s, b) {
  return h >= 80 && h <= 200 && s >= 15 && b >= 15 && b <= 90;
}

function isDark(h, s, b) {
  return b <= 25;
}

function isLight(h, s, b) {
  return b >= 70 && s <= 30;
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
        sumX += x; sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const ni = ny * w + nx;
            if (mask[ni] && !visited[ni]) { visited[ni] = 1; queue.push(ni); }
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

  let greenPixels = 0;
  let darkPixels = 0;
  const lightMask = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const hsb = rgbToHsb(r, g, b);
      if (isAlienGreen(hsb.h, hsb.s, hsb.b)) greenPixels++;
      if (isDark(hsb.h, hsb.s, hsb.b)) darkPixels++;
      if (isLight(hsb.h, hsb.s, hsb.b)) lightMask[y * w + x] = 1;
    }
  }

  // Score 1: Green/cyan dominance (0-30)
  const greenRatio = greenPixels / totalPixels;
  let greenScore = 0;
  if (greenRatio >= 0.15 && greenRatio <= 0.65) {
    greenScore = 30;
  } else if (greenRatio >= 0.05 && greenRatio < 0.15) {
    greenScore = 30 * (greenRatio - 0.05) / 0.10;
  } else if (greenRatio > 0.65) {
    greenScore = 30 * Math.max(0, 1 - (greenRatio - 0.65) / 0.2);
  }

  // Score 2: Dark background (0-20)
  const darkRatio = darkPixels / totalPixels;
  let darkScore = 0;
  if (darkRatio >= 0.1 && darkRatio <= 0.6) {
    darkScore = 20;
  } else if (darkRatio >= 0.03 && darkRatio < 0.1) {
    darkScore = 20 * (darkRatio - 0.03) / 0.07;
  }

  // Score 3: Big eye blobs — aliens have large almond eyes (0-30)
  const minBlobSize = Math.floor(totalPixels * 0.003);
  const allBlobs = findBlobs(lightMask, w, h, minBlobSize);
  const upperBlobs = allBlobs.filter(b => b.cy < h * 0.55);

  let eyeScore = 0;
  for (let i = 0; i < upperBlobs.length; i++) {
    for (let j = i + 1; j < upperBlobs.length; j++) {
      const a = upperBlobs[i], b = upperBlobs[j];
      const sizeRatio = Math.min(a.pixels, b.pixels) / Math.max(a.pixels, b.pixels);
      if (sizeRatio < 0.33) continue;
      const dx = Math.abs(a.cx - b.cx);
      if (dx < w * 0.1) continue;
      const dy = Math.abs(a.cy - b.cy);
      if (dy > h * 0.2) continue;
      const avgSize = (a.pixels + b.pixels) / 2;
      const sizeScore = Math.min(avgSize / (totalPixels * 0.015), 1.0);
      const pairScore = sizeScore * sizeRatio;
      if (pairScore > eyeScore) eyeScore = pairScore;
    }
  }
  eyeScore = 30 * Math.min(eyeScore, 1.0);

  const totalScore = greenScore + darkScore + eyeScore;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    greenScore: Math.round(greenScore * 100) / 100,
    darkScore: Math.round(darkScore * 100) / 100,
    eyeScore: Math.round(eyeScore * 100) / 100,
    greenRatio: Math.round(greenRatio * 1000) / 1000,
    darkRatio: Math.round(darkRatio * 1000) / 1000,
  };
}

// ── Table headers ───────────────────────────────────────────────────────────

const clipHeader = "Rank  Similarity  BestRef                Heur    Green   Dark    Eyes    File";
const heurHeader = "Rank  Score   Green   Dark    Eyes    GreenR  DarkR   File";

function formatClipRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ` +
    `${String(s.similarity ?? "-").padStart(10)}  ` +
    `${(s.bestRef ?? "-").padEnd(21).slice(0, 21)}  ` +
    `${String(s.totalScore).padStart(6)}  ` +
    `${String(s.greenScore).padStart(6)}  ` +
    `${String(s.darkScore).padStart(6)}  ` +
    `${String(s.eyeScore).padStart(6)}   ` +
    `${s.file.slice(0, 26)}`
  );
}

function formatHeurRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
    `${String(s.greenScore).padStart(6)}  ${String(s.darkScore).padStart(6)}  ` +
    `${String(s.eyeScore).padStart(6)}  ` +
    `${String(s.greenRatio).padStart(6)}  ` +
    `${String(s.darkRatio).padStart(6)}   ` +
    `${s.file.slice(0, 30)}`
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
