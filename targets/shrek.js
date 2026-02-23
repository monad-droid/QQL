// =============================================================================
// TARGET: Shrek
//
// Edinburgh palette: Earthy greens, warm browns, cream tones.
// Heuristics: Strong green dominance, warm brown accents, round face shape.
// =============================================================================
const { createCanvas, loadImage } = require("canvas");

const name = "Shrek";

// Edinburgh works well for Shrek's swampy earthy greens + brown tones
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
  "Shrek",
  "Shrek the ogre, green face with brown eyes",
  "green ogre face with small ears",
  "Shrek animated movie character",
  "green ogre with round head and small brown eyes",
  "Shrek face, earthy green skin with brown accents",
  "abstract green ogre portrait made of circles and rings",
  "swampy green creature face with warm brown tones",
  "cartoon green face with beady eyes and wide grin",
  "earthy green and brown abstract face with round features",
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

function isGreen(h, s, b) {
  return h >= 60 && h <= 160 && s >= 15 && b >= 20 && b <= 85;
}

function isBrown(h, s, b) {
  return h >= 15 && h <= 50 && s >= 20 && b >= 15 && b <= 65;
}

function isLight(h, s, b) {
  return b >= 75 && s <= 30;
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
  let brownPixels = 0;
  const lightMask = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const hsb = rgbToHsb(r, g, b);
      if (isGreen(hsb.h, hsb.s, hsb.b)) greenPixels++;
      if (isBrown(hsb.h, hsb.s, hsb.b)) brownPixels++;
      if (isLight(hsb.h, hsb.s, hsb.b)) lightMask[y * w + x] = 1;
    }
  }

  // Score 1: Green dominance (0-30) — Shrek is very green
  const greenRatio = greenPixels / totalPixels;
  let greenScore = 0;
  if (greenRatio >= 0.2 && greenRatio <= 0.7) {
    greenScore = 30;
  } else if (greenRatio >= 0.08 && greenRatio < 0.2) {
    greenScore = 30 * (greenRatio - 0.08) / 0.12;
  } else if (greenRatio > 0.7) {
    greenScore = 30 * Math.max(0, 1 - (greenRatio - 0.7) / 0.2);
  }

  // Score 2: Brown accents (0-20) — earthy brown clothing/mud
  const brownRatio = brownPixels / totalPixels;
  let brownScore = 0;
  if (brownRatio >= 0.05 && brownRatio <= 0.35) {
    brownScore = 20;
  } else if (brownRatio >= 0.01 && brownRatio < 0.05) {
    brownScore = 20 * (brownRatio - 0.01) / 0.04;
  } else if (brownRatio > 0.35) {
    brownScore = 20 * Math.max(0, 1 - (brownRatio - 0.35) / 0.2);
  }

  // Score 3: Eye-like blobs in upper half (0-30)
  const minBlobSize = Math.floor(totalPixels * 0.002);
  const allBlobs = findBlobs(lightMask, w, h, minBlobSize);
  const upperBlobs = allBlobs.filter(b => b.cy < h * 0.55);

  let eyeScore = 0;
  for (let i = 0; i < upperBlobs.length; i++) {
    for (let j = i + 1; j < upperBlobs.length; j++) {
      const a = upperBlobs[i], b = upperBlobs[j];
      const sizeRatio = Math.min(a.pixels, b.pixels) / Math.max(a.pixels, b.pixels);
      if (sizeRatio < 0.33) continue;
      const dx = Math.abs(a.cx - b.cx);
      if (dx < w * 0.08) continue;
      const dy = Math.abs(a.cy - b.cy);
      if (dy > h * 0.2) continue;
      const avgSize = (a.pixels + b.pixels) / 2;
      const sizeScore = Math.min(avgSize / (totalPixels * 0.01), 1.0);
      const pairScore = sizeScore * sizeRatio;
      if (pairScore > eyeScore) eyeScore = pairScore;
    }
  }
  eyeScore = 30 * Math.min(eyeScore, 1.0);

  const totalScore = greenScore + brownScore + eyeScore;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    greenScore: Math.round(greenScore * 100) / 100,
    brownScore: Math.round(brownScore * 100) / 100,
    eyeScore: Math.round(eyeScore * 100) / 100,
    greenRatio: Math.round(greenRatio * 1000) / 1000,
    brownRatio: Math.round(brownRatio * 1000) / 1000,
  };
}

// ── Table headers ───────────────────────────────────────────────────────────

const clipHeader = "Rank  Similarity  BestRef                Heur    Green   Brown   Eyes    File";
const heurHeader = "Rank  Score   Green   Brown   Eyes    GreenR  BrownR  File";

function formatClipRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ` +
    `${String(s.similarity ?? "-").padStart(10)}  ` +
    `${(s.bestRef ?? "-").padEnd(21).slice(0, 21)}  ` +
    `${String(s.totalScore).padStart(6)}  ` +
    `${String(s.greenScore).padStart(6)}  ` +
    `${String(s.brownScore).padStart(6)}  ` +
    `${String(s.eyeScore).padStart(6)}   ` +
    `${s.file.slice(0, 26)}`
  );
}

function formatHeurRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
    `${String(s.greenScore).padStart(6)}  ${String(s.brownScore).padStart(6)}  ` +
    `${String(s.eyeScore).padStart(6)}  ` +
    `${String(s.greenRatio).padStart(6)}  ` +
    `${String(s.brownRatio).padStart(6)}   ` +
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
