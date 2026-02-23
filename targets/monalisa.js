// =============================================================================
// TARGET: Mona Lisa
//
// Alternates between Berlin and Edinburgh palettes:
//   Berlin:    warm browns/tans, dark backgrounds — Renaissance portrait tones
//   Edinburgh: muted earthy greens/creams — sfumato landscape tones
// Heuristics: Warm tone dominance, vignette/dark surround, central concentration.
// =============================================================================
const { createCanvas, loadImage } = require("canvas");

const name = "Mona Lisa";

const PALETTES = ["Berlin", "Edinburgh"];

// Returns fresh traits each call, randomly picking a palette
function traits() {
  const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  return {
    colorPalette: palette,
    colorMode: "Stacked",
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
    spacing: null,
  };
}

const heuristicThreshold = 20;

// Reference image URLs for download-references.sh
const referenceUrls = [
  {
    name: "mona-lisa-full.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/800px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg",
  },
  {
    name: "mona-lisa-small.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/400px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg",
  },
];

// ── Color detection ─────────────────────────────────────────────────────────

const WARM_HUE_MIN = 5;
const WARM_HUE_MAX = 50;
const WARM_SAT_MIN = 10;
const WARM_SAT_MAX = 85;
const WARM_BRIGHT_MIN = 20;
const WARM_BRIGHT_MAX = 95;

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

function isWarm(h, s, b) {
  return (
    h >= WARM_HUE_MIN && h <= WARM_HUE_MAX &&
    s >= WARM_SAT_MIN && s <= WARM_SAT_MAX &&
    b >= WARM_BRIGHT_MIN && b <= WARM_BRIGHT_MAX
  );
}

function isDark(h, s, b) {
  return b <= 30;
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
  const centerX = w / 2;
  const centerY = h / 2;
  const innerRadius = Math.sqrt(centerX * centerX + centerY * centerY) * 0.35;

  let warmPixels = 0;
  let darkPixels = 0;

  let innerBrightnessSum = 0;
  let innerCount = 0;
  let outerBrightnessSum = 0;
  let outerCount = 0;
  let outerDarkPixels = 0;

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

      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isInner = dist <= innerRadius;

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
        const gx = Math.min(Math.floor((x / w) * gridCols), gridCols - 1);
        const gy = Math.min(Math.floor((y / h) * gridRows), gridRows - 1);
        warmGrid[gy * gridCols + gx]++;
      }

      if (isDark(hsb.h, hsb.s, hsb.b)) darkPixels++;
    }
  }

  // Score 1: Warm tone dominance (0-30)
  const warmRatio = warmPixels / totalPixels;
  let warmScore = 0;
  if (warmRatio >= 0.15 && warmRatio <= 0.55) {
    warmScore = 30;
  } else if (warmRatio >= 0.05 && warmRatio < 0.15) {
    warmScore = 30 * (warmRatio - 0.05) / 0.10;
  } else if (warmRatio > 0.55) {
    warmScore = 30 * Math.max(0, 1 - (warmRatio - 0.55) / 0.25);
  }

  // Score 2: Vignette / dark surround (0-30)
  const innerAvgBrightness = innerCount > 0 ? innerBrightnessSum / innerCount : 0;
  const outerAvgBrightness = outerCount > 0 ? outerBrightnessSum / outerCount : 0;
  const outerDarkRatio = outerCount > 0 ? outerDarkPixels / outerCount : 0;

  let vignetteScore = 0;
  const brightnessDiff = innerAvgBrightness - outerAvgBrightness;
  if (brightnessDiff > 0) {
    const diffScore = Math.min(Math.max((brightnessDiff - 5) / 20, 0), 1.0);
    const darkPresence = Math.min(outerDarkRatio / 0.15, 1.0);
    vignetteScore = 30 * diffScore * darkPresence;
  }

  // Score 3: Central warm concentration (0-20)
  let centerWarm = 0;
  const totalWarm = warmPixels || 1;
  for (let gy = 1; gy <= 2; gy++) {
    for (let gx = 1; gx <= 2; gx++) {
      centerWarm += warmGrid[gy * gridCols + gx];
    }
  }
  const centerConcentration = centerWarm / totalWarm;

  let concentrationScore = 0;
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

// ── Table headers for console output ────────────────────────────────────────

const clipHeader = "Rank  Similarity  BestRef                Heur    Warm    Vignt   Conc    File";
const heurHeader = "Rank  Score   Warm    Vignt   Conc    WarmR   DarkR   BriDiff  CtrConc  File";

function formatClipRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ` +
    `${String(s.similarity ?? "-").padStart(10)}  ` +
    `${(s.bestRef ?? "-").padEnd(21).slice(0, 21)}  ` +
    `${String(s.totalScore).padStart(6)}  ` +
    `${String(s.warmScore).padStart(6)}  ` +
    `${String(s.vignetteScore).padStart(6)}  ` +
    `${String(s.concentrationScore).padStart(6)}   ` +
    `${s.file.slice(0, 26)}`
  );
}

function formatHeurRow(i, s) {
  return (
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

module.exports = {
  name,
  traits,
  heuristicThreshold,
  referenceUrls,
  scoreImage,
  clipHeader,
  heurHeader,
  formatClipRow,
  formatHeurRow,
};
