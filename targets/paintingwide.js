// =============================================================================
// TARGET: Wide Painting Search (catch-all exploration)
//
// Goal:
//   - Randomize ALL QQL traits so the generator can explore emergent outputs.
//   - Keep scoring broad and style-agnostic for "any painting-like" matches.
//
// Notes:
//   - Returning an empty traits object lets qql-traits fill every trait randomly.
//   - DINOv3 remains the primary ranker in score.js; this heuristic is only a
//     generic tiebreaker based on visual richness/contrast.
// =============================================================================

const { createCanvas, loadImage } = require("canvas");

const name = "Painting Wide";

// Empty traits => qql-traits fills all trait fields randomly.
function traits() {
  return {};
}

const heuristicThreshold = 0;

// Optional prompts for CLIP-style workflows.
// DINO mode ignores these.
const textPrompts = [
  "abstract painting",
  "oil painting",
  "impressionist painting",
  "expressionist painting",
  "landscape painting",
  "seascape painting",
  "night sky painting",
  "blue and white painting",
  "blue and yellow painting",
  "museum painting",
];

// Wikimedia Commons categories for bulk painting downloads.
// Used as Phase 2 fallback after the curated list to fill gaps.
const referenceCategories = [
  "Featured pictures of paintings",
  "Oil paintings in the Louvre",
  "Oil paintings in the Uffizi",
  "Paintings in the Rijksmuseum Amsterdam",
  "Paintings in the National Gallery, London",
  "Paintings in the Museo del Prado",
  "Paintings in the Metropolitan Museum of Art",
  "Paintings by Rembrandt",
  "Paintings by Vermeer",
  "Paintings by Monet",
  "Paintings by Van Gogh",
];

// ~1000 curated top paintings. Data lives in painting-refs.js for cleanliness.
const referenceUrls = require("./painting-refs");

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s: s * 100, v: v * 100 };
}

// Generic heuristic for broad visual richness.
// Keeps values in a readable 0-100-ish range for tie-breaking only.
async function scoreImage(imagePath) {
  const img = await loadImage(imagePath);
  const w = img.width;
  const h = img.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;

  const totalPixels = w * h;
  const colorBins = new Set();

  let satSum = 0;
  let lumSum = 0;
  let lumSqSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const { h: hue, s } = rgbToHsv(r, g, b);
    satSum += s;

    const l = luminance(r, g, b);
    lumSum += l;
    lumSqSum += l * l;

    // Coarse quantization for palette richness.
    const qR = Math.floor(r / 32);
    const qG = Math.floor(g / 32);
    const qB = Math.floor(b / 32);
    const qH = Math.floor(hue / 30);
    colorBins.add(`${qR}-${qG}-${qB}-${qH}`);
  }

  const meanSat = satSum / totalPixels;
  const meanLum = lumSum / totalPixels;
  const lumVar = Math.max(0, lumSqSum / totalPixels - meanLum * meanLum);
  const lumStd = Math.sqrt(lumVar);

  const colorRichness = Math.min(40, (colorBins.size / 180) * 40);
  const saturationScore = Math.min(30, (meanSat / 60) * 30);
  const contrastScore = Math.min(30, (lumStd / 70) * 30);

  const totalScore = colorRichness + saturationScore + contrastScore;

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    colorRichness: Math.round(colorRichness * 100) / 100,
    saturationScore: Math.round(saturationScore * 100) / 100,
    contrastScore: Math.round(contrastScore * 100) / 100,
    colorBins: colorBins.size,
    avgSaturation: Math.round(meanSat * 10) / 10,
    lumStd: Math.round(lumStd * 10) / 10,
  };
}

const clipHeader = "Rank  Similarity  BestRef                Heur    Color   Sat     Ctrst   File";
const heurHeader = "Rank  Score   Color   Sat     Ctrst   Bins    AvgSat  LumStd  File";

function formatClipRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ` +
    `${String(s.similarity ?? "-").padStart(10)}  ` +
    `${(s.bestRef ?? "-").padEnd(21).slice(0, 21)}  ` +
    `${String(s.totalScore).padStart(6)}  ` +
    `${String(s.colorRichness).padStart(6)}  ` +
    `${String(s.saturationScore).padStart(6)}  ` +
    `${String(s.contrastScore).padStart(6)}   ` +
    `${s.file.slice(0, 26)}`
  );
}

function formatHeurRow(i, s) {
  return (
    `#${String(i + 1).padStart(3)}  ${String(s.totalScore).padStart(6)}  ` +
    `${String(s.colorRichness).padStart(6)}  ${String(s.saturationScore).padStart(6)}  ` +
    `${String(s.contrastScore).padStart(6)}  ` +
    `${String(s.colorBins).padStart(6)}  ` +
    `${String(s.avgSaturation).padStart(6)}  ` +
    `${String(s.lumStd).padStart(6)}  ` +
    `${s.file.slice(0, 28)}`
  );
}

module.exports = {
  name,
  traits,
  heuristicThreshold,
  textPrompts,
  referenceUrls,
  referenceCategories,
  scoreImage,
  clipHeader,
  heurHeader,
  formatClipRow,
  formatHeurRow,
};

