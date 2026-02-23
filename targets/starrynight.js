// =============================================================================
// TARGET: The Starry Night (Vincent van Gogh, 1889)
//
// Seattle palette: Cool blues, warm grays, yellows.
// Heuristics: Blue dominance, yellow star accents, sky-ground contrast.
// =============================================================================
const { createCanvas, loadImage } = require("canvas");

const name = "Starry Night";

const traits = {
  colorPalette: "Seattle",
  colorMode: "Stacked",
  colorVariety: "Medium",
  turbulence: "High",
  bullseyeRings1: "Off",
  bullseyeRings3: "Off",
  bullseyeRings7: "On",
  ringThickness: "Mixed",
  sizeVariety: "Wild",
  structure: "Orbital",
  flowField: "Spiral",
  margin: "None",
  ringSize: "Medium",
  spacing: "Dense",
};

const heuristicThreshold = 20;

// Text prompts for CLIP text-to-image scoring
const textPrompts = [
  // Direct references
  "The Starry Night",
  "The Starry Night by Vincent van Gogh",
  "Van Gogh Starry Night painting, swirling night sky",
  "starry night sky with bright yellow stars and crescent moon",
  // Descriptive
  "deep blue swirling night sky with glowing yellow stars",
  "turbulent night sky painting with cypress tree silhouette",
  "post-impressionist night landscape with swirling clouds and stars",
  "dark blue sky with bright swirling star patterns over village",
  // Abstract art bridging prompts
  "abstract deep blue and yellow circular patterns resembling a night sky",
  "generative art with swirling blue rings and bright yellow accents",
  "concentric circles in deep navy blue with golden yellow highlights",
  "dark blue abstract spiral pattern with scattered bright yellow dots",
  "deep blue generative art with bright yellow circular patterns",
  "swirling abstract composition in midnight blue with golden stars",
  "turbulent blue and yellow abstract painting with spiral energy",
];

// Reference image URLs for download-references.sh
const referenceUrls = [
  {
    name: "starry-night-full.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1280px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
  },
  {
    name: "starry-night-small.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/400px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
  },
];

// ── Color detection ─────────────────────────────────────────────────────────

const BLUE_HUE_MIN = 195;
const BLUE_HUE_MAX = 250;
const BLUE_SAT_MIN = 20;
const BLUE_BRIGHT_MIN = 10;
const BLUE_BRIGHT_MAX = 80;

const YELLOW_HUE_MIN = 30;
const YELLOW_HUE_MAX = 60;
const YELLOW_SAT_MIN = 40;
const YELLOW_BRIGHT_MIN = 60;

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

function isYellow(h, s, b) {
  return (
    h >= YELLOW_HUE_MIN && h <= YELLOW_HUE_MAX &&
    s >= YELLOW_SAT_MIN &&
    b >= YELLOW_BRIGHT_MIN
  );
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
  const skyBoundary = Math.floor(h * 0.67);

  let bluePixels = 0;
  let yellowPixels = 0;
  let upperBrightnessSum = 0, upperCount = 0;
  let lowerBrightnessSum = 0, lowerCount = 0;
  let lowerDarkPixels = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsb = rgbToHsb(r, g, b);

      if (isBlue(hsb.h, hsb.s, hsb.b)) bluePixels++;
      if (isYellow(hsb.h, hsb.s, hsb.b)) yellowPixels++;

      if (y < skyBoundary) {
        upperBrightnessSum += hsb.b;
        upperCount++;
      } else {
        lowerBrightnessSum += hsb.b;
        lowerCount++;
        if (hsb.b <= 30) lowerDarkPixels++;
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

  // Score 2: Yellow star accents (0-30)
  const yellowRatio = yellowPixels / totalPixels;
  let starScore = 0;
  if (yellowRatio >= 0.05 && yellowRatio <= 0.30) {
    starScore = 30;
  } else if (yellowRatio >= 0.01 && yellowRatio < 0.05) {
    starScore = 30 * (yellowRatio - 0.01) / 0.04;
  } else if (yellowRatio > 0.30) {
    starScore = 30 * Math.max(0, 1 - (yellowRatio - 0.30) / 0.20);
  }

  // Score 3: Sky-ground contrast (0-20)
  const upperAvgBrightness = upperCount > 0 ? upperBrightnessSum / upperCount : 0;
  const lowerAvgBrightness = lowerCount > 0 ? lowerBrightnessSum / lowerCount : 0;
  const lowerDarkRatio = lowerCount > 0 ? lowerDarkPixels / lowerCount : 0;
  const brightnessDiff = upperAvgBrightness - lowerAvgBrightness;

  let contrastScore = 0;
  if (brightnessDiff > 0) {
    const diffScore = Math.min(Math.max((brightnessDiff - 3) / 15, 0), 1.0);
    const darkPresence = Math.min(lowerDarkRatio / 0.20, 1.0);
    contrastScore = 20 * diffScore * darkPresence;
  }

  const totalScore = blueScore + starScore + contrastScore;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    blueScore: Math.round(blueScore * 100) / 100,
    starScore: Math.round(starScore * 100) / 100,
    contrastScore: Math.round(contrastScore * 100) / 100,
    blueRatio: Math.round(blueRatio * 1000) / 1000,
    yellowRatio: Math.round(yellowRatio * 1000) / 1000,
    brightnessDiff: Math.round(brightnessDiff * 10) / 10,
    lowerDarkRatio: Math.round(lowerDarkRatio * 1000) / 1000,
  };
}

// ── Table headers for console output ────────────────────────────────────────

const clipHeader = "Rank  Similarity  BestRef                Heur    Blue    Stars   Ctrst   File";
const heurHeader = "Rank  Score   Blue    Stars   Ctrst   BlueR   YellR   BriDiff  LowDark  File";

function formatClipRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ` +
    `${String(s.similarity ?? "-").padStart(10)}  ` +
    `${(s.bestRef ?? "-").padEnd(21).slice(0, 21)}  ` +
    `${String(s.totalScore).padStart(6)}  ` +
    `${String(s.blueScore).padStart(6)}  ` +
    `${String(s.starScore).padStart(6)}  ` +
    `${String(s.contrastScore).padStart(6)}   ` +
    `${s.file.slice(0, 26)}`
  );
}

function formatHeurRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
    `${String(s.blueScore).padStart(6)}  ${String(s.starScore).padStart(6)}  ` +
    `${String(s.contrastScore).padStart(6)}  ` +
    `${String(s.blueRatio).padStart(6)}  ` +
    `${String(s.yellowRatio).padStart(6)}  ` +
    `${String(s.brightnessDiff).padStart(8)}  ` +
    `${String(s.lowerDarkRatio).padStart(7)}  ` +
    `${s.file.slice(0, 26)}`
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
