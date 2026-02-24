// =============================================================================
// TARGET: The Great Wave off Kanagawa (Hokusai, 1831)
//
// Seattle palette: Cool blues, whites, warm grays.
// Heuristics: Blue dominance, white foam accents, blue-white contrast.
// =============================================================================
const { createCanvas, loadImage } = require("canvas");

const name = "Great Wave";

const traits = {
  colorPalette: "Seattle",
  colorMode: null,
  colorVariety: "Low",
  turbulence: "None",
  bullseyeRings1: "Off",
  bullseyeRings3: "On",
  bullseyeRings7: "Off",
  ringThickness: "Thick",
  sizeVariety: null,
  structure: "Orbital",
  flowField: "Circular",
  margin: "Wide",
  ringSize: null,
  spacing: null,
};

const heuristicThreshold = 20;

// Text prompts for CLIP text-to-image scoring
const textPrompts = [
  // Direct references
  "The Great Wave off Kanagawa",
  "The Great Wave off Kanagawa by Hokusai",
  "Hokusai Great Wave Japanese woodblock print",
  "giant ocean wave with white foam curling over",
  // Descriptive
  "deep blue ocean wave with white crests and spray",
  "large curling wave with Mount Fuji in background",
  "Japanese ukiyo-e print of towering blue wave",
  "dark blue sea wave crashing with white foam tips",
  "powerful ocean wave with deep indigo blue water",
  // Abstract art bridging prompts
  "abstract blue and white circular wave pattern",
  "generative art with deep blue curves and white accents",
  "concentric blue circles with white highlights resembling ocean waves",
  "dark blue abstract spiral with white foam-like texture",
  "circular blue and white pattern evoking a crashing wave",
  "deep blue generative art with curving white ring patterns",
  "abstract ocean wave made of concentric blue and white circles",
];

// Reference image URLs for download-references.sh
const referenceUrls = [
  {
    name: "great-wave-full.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/1280px-Tsunami_by_hokusai_19th_century.jpg",
  },
  {
    name: "great-wave-small.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/400px-Tsunami_by_hokusai_19th_century.jpg",
  },
];

// ── Color detection ─────────────────────────────────────────────────────────

const BLUE_HUE_MIN = 190;
const BLUE_HUE_MAX = 250;
const BLUE_SAT_MIN = 20;
const BLUE_BRIGHT_MIN = 10;
const BLUE_BRIGHT_MAX = 85;

const WHITE_SAT_MAX = 20;
const WHITE_BRIGHT_MIN = 75;

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

function isBlue(h, s, b) {
  return (
    h >= BLUE_HUE_MIN && h <= BLUE_HUE_MAX &&
    s >= BLUE_SAT_MIN &&
    b >= BLUE_BRIGHT_MIN && b <= BLUE_BRIGHT_MAX
  );
}

function isWhite(h, s, b) {
  return s <= WHITE_SAT_MAX && b >= WHITE_BRIGHT_MIN;
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

  let bluePixels = 0;
  let whitePixels = 0;
  let upperBlue = 0, upperCount = 0;
  let lowerBlue = 0, lowerCount = 0;
  const midY = Math.floor(h / 2);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsb = rgbToHsb(r, g, b);

      const blue = isBlue(hsb.h, hsb.s, hsb.b);
      if (blue) bluePixels++;
      if (isWhite(hsb.h, hsb.s, hsb.b)) whitePixels++;

      if (y < midY) {
        upperCount++;
        if (blue) upperBlue++;
      } else {
        lowerCount++;
        if (blue) lowerBlue++;
      }
    }
  }

  // Score 1: Blue dominance (0-30)
  const blueRatio = bluePixels / totalPixels;
  let blueScore = 0;
  if (blueRatio >= 0.25 && blueRatio <= 0.70) {
    blueScore = 30;
  } else if (blueRatio >= 0.10 && blueRatio < 0.25) {
    blueScore = 30 * (blueRatio - 0.10) / 0.15;
  } else if (blueRatio > 0.70) {
    blueScore = 30 * Math.max(0, 1 - (blueRatio - 0.70) / 0.20);
  }

  // Score 2: White foam accents (0-30)
  const whiteRatio = whitePixels / totalPixels;
  let foamScore = 0;
  if (whiteRatio >= 0.05 && whiteRatio <= 0.35) {
    foamScore = 30;
  } else if (whiteRatio >= 0.01 && whiteRatio < 0.05) {
    foamScore = 30 * (whiteRatio - 0.01) / 0.04;
  } else if (whiteRatio > 0.35) {
    foamScore = 30 * Math.max(0, 1 - (whiteRatio - 0.35) / 0.20);
  }

  // Score 3: Blue-white contrast (0-20)
  // Reward images where blue and white coexist in good proportion
  let contrastScore = 0;
  if (blueRatio > 0.05 && whiteRatio > 0.02) {
    const ratio = Math.min(blueRatio, whiteRatio) / Math.max(blueRatio, whiteRatio);
    // Best when blue:white is roughly 3:1 to 5:1 (ratio ~0.2-0.33)
    if (ratio >= 0.15 && ratio <= 0.50) {
      contrastScore = 20;
    } else if (ratio < 0.15) {
      contrastScore = 20 * (ratio / 0.15);
    } else {
      contrastScore = 20 * Math.max(0, 1 - (ratio - 0.50) / 0.30);
    }
  }

  const totalScore = blueScore + foamScore + contrastScore;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    blueScore: Math.round(blueScore * 100) / 100,
    foamScore: Math.round(foamScore * 100) / 100,
    contrastScore: Math.round(contrastScore * 100) / 100,
    blueRatio: Math.round(blueRatio * 1000) / 1000,
    whiteRatio: Math.round(whiteRatio * 1000) / 1000,
  };
}

// ── Table headers for console output ────────────────────────────────────────

const clipHeader = "Rank  Similarity  BestRef                Heur    Blue    Foam    Ctrst   File";
const heurHeader = "Rank  Score   Blue    Foam    Ctrst   BlueR   WhiteR  File";

function formatClipRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ` +
    `${String(s.similarity ?? "-").padStart(10)}  ` +
    `${(s.bestRef ?? "-").padEnd(21).slice(0, 21)}  ` +
    `${String(s.totalScore).padStart(6)}  ` +
    `${String(s.blueScore).padStart(6)}  ` +
    `${String(s.foamScore).padStart(6)}  ` +
    `${String(s.contrastScore).padStart(6)}   ` +
    `${s.file.slice(0, 26)}`
  );
}

function formatHeurRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
    `${String(s.blueScore).padStart(6)}  ${String(s.foamScore).padStart(6)}  ` +
    `${String(s.contrastScore).padStart(6)}  ` +
    `${String(s.blueRatio).padStart(6)}  ` +
    `${String(s.whiteRatio).padStart(6)}  ` +
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
