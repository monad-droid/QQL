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

// Starter pack of open-license/public-domain painting references.
// Source: Wikimedia Commons image URLs (curated across eras/styles).
// `download-references.sh` will fetch these when TARGET=paintingwide.
const referenceUrls = [
  {
    name: "starry-night.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1280px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
  },
  {
    name: "great-wave.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/1280px-Tsunami_by_hokusai_19th_century.jpg",
  },
  {
    name: "mona-lisa.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Mona_Lisa.jpg/1200px-Mona_Lisa.jpg",
  },
  {
    name: "girl-with-a-pearl-earring.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Johannes_Vermeer_-_Girl_with_a_Pearl_Earring.jpg/1200px-Johannes_Vermeer_-_Girl_with_a_Pearl_Earring.jpg",
  },
  {
    name: "birth-of-venus.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Birth_of_Venus_Botticelli.jpg/1280px-Birth_of_Venus_Botticelli.jpg",
  },
  {
    name: "wanderer-above-the-sea-of-fog.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Caspar_David_Friedrich_-_Wanderer_above_the_Sea_of_Fog.jpg/1280px-Caspar_David_Friedrich_-_Wanderer_above_the_Sea_of_Fog.jpg",
  },
  {
    name: "liberty-leading-the-people.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Eug%C3%A8ne_Delacroix_-_La_Libert%C3%A9_guidant_le_peuple.jpg/1280px-Eug%C3%A8ne_Delacroix_-_La_Libert%C3%A9_guidant_le_peuple.jpg",
  },
  {
    name: "impression-sunrise.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Claude_Monet%2C_Impression%2C_soleil_levant.jpg/1280px-Claude_Monet%2C_Impression%2C_soleil_levant.jpg",
  },
  {
    name: "water-lilies.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Claude_Monet_-_Water_Lilies_-_1916.jpg/1280px-Claude_Monet_-_Water_Lilies_-_1916.jpg",
  },
  {
    name: "the-night-watch.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/The_Nightwatch_by_Rembrandt.jpg/1280px-The_Nightwatch_by_Rembrandt.jpg",
  },
  {
    name: "the-kiss-klimt.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Gustav_Klimt_016.jpg/1024px-Gustav_Klimt_016.jpg",
  },
  {
    name: "american-gothic.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Grant_DeVolson_Wood_-_American_Gothic.jpg/1000px-Grant_DeVolson_Wood_-_American_Gothic.jpg",
  },
];

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
  scoreImage,
  clipHeader,
  heurHeader,
  formatClipRow,
  formatHeurRow,
};

