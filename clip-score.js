const fs = require("fs");
const path = require("path");

// =============================================================================
// CLIP Scoring Module — Contrastive Zero-Shot Classification
//
// Uses CLIP to answer: "Is this Pepe the frog, or just abstract art?"
//
// Compares each image against POSITIVE prompts (frog, Pepe) and NEGATIVE
// prompts (abstract art, circles, geometric patterns). Uses softmax to
// compute a probability — how much more does this look like Pepe than
// generic QQL art?
//
// This prevents false positives where CLIP matches visual style (circles,
// color palette) rather than actual frog-likeness.
// =============================================================================

const CLIP_MODEL = "Xenova/clip-vit-base-patch32";

// Positive: what Pepe looks like
const POSITIVE_PROMPTS = [
  "Pepe the frog meme",
  "green frog face with two big round white eyes",
  "cartoon frog face",
  "a green frog looking at the viewer",
];

// Negative: what QQL art typically looks like (NOT Pepe)
const NEGATIVE_PROMPTS = [
  "abstract geometric circles and rings",
  "concentric circles pattern on colored background",
  "generative art with dots and rings",
  "abstract colorful circles artwork",
];

const REFERENCES_DIR = path.join(__dirname, "references");

// Temperature for softmax — lower = more decisive, higher = more gradual
const SOFTMAX_TEMPERATURE = 0.01;

let _tokenizer = null;
let _textModel = null;
let _visionModel = null;
let _processor = null;
let _positiveEmbeddings = null;
let _negativeEmbeddings = null;
let _refEmbeddings = null;

async function getTransformers() {
  return await import("@huggingface/transformers");
}

async function initCLIP() {
  if (_visionModel) return;

  const {
    CLIPTextModelWithProjection,
    CLIPVisionModelWithProjection,
    AutoTokenizer,
    AutoProcessor,
  } = await getTransformers();

  console.log("  Loading CLIP model (first run downloads ~350MB)...");

  [_tokenizer, _processor, _textModel, _visionModel] = await Promise.all([
    AutoTokenizer.from_pretrained(CLIP_MODEL),
    AutoProcessor.from_pretrained(CLIP_MODEL),
    CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL),
    CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL),
  ]);

  console.log("  CLIP model loaded.");
}

function cosineSimilarity(a, b) {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function encodeText(text) {
  const inputs = await _tokenizer(text, { padding: true, truncation: true });
  const output = await _textModel(inputs);
  return Array.from(output.text_embeds.data);
}

async function getPositiveEmbeddings() {
  if (_positiveEmbeddings) return _positiveEmbeddings;
  _positiveEmbeddings = [];
  for (const prompt of POSITIVE_PROMPTS) {
    _positiveEmbeddings.push({ prompt, embedding: await encodeText(prompt) });
  }
  return _positiveEmbeddings;
}

async function getNegativeEmbeddings() {
  if (_negativeEmbeddings) return _negativeEmbeddings;
  _negativeEmbeddings = [];
  for (const prompt of NEGATIVE_PROMPTS) {
    _negativeEmbeddings.push({ prompt, embedding: await encodeText(prompt) });
  }
  return _negativeEmbeddings;
}

async function getRefEmbeddings() {
  if (_refEmbeddings) return _refEmbeddings;

  _refEmbeddings = [];
  if (!fs.existsSync(REFERENCES_DIR)) return _refEmbeddings;

  const { RawImage } = await getTransformers();
  const files = fs
    .readdirSync(REFERENCES_DIR)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

  for (const f of files) {
    const rawImage = await RawImage.read(path.join(REFERENCES_DIR, f));
    const imageInputs = await _processor(rawImage);
    const output = await _visionModel(imageInputs);
    _refEmbeddings.push({ name: f, embedding: Array.from(output.image_embeds.data) });
  }

  return _refEmbeddings;
}

async function encodeImage(imagePath) {
  const { RawImage } = await getTransformers();
  const rawImage = await RawImage.read(imagePath);
  const imageInputs = await _processor(rawImage);
  const output = await _visionModel(imageInputs);
  return Array.from(output.image_embeds.data);
}

// Contrastive zero-shot score: P(Pepe) vs P(abstract art)
// Uses softmax over positive and negative prompt similarities
function contrastiveScore(imageEmbedding, positiveEmbeddings, negativeEmbeddings) {
  // Get best similarity for each category
  let bestPosSim = -Infinity;
  let bestPosPrompt = "";
  for (const { prompt, embedding } of positiveEmbeddings) {
    const sim = cosineSimilarity(imageEmbedding, embedding);
    if (sim > bestPosSim) {
      bestPosSim = sim;
      bestPosPrompt = prompt;
    }
  }

  let bestNegSim = -Infinity;
  for (const { embedding } of negativeEmbeddings) {
    const sim = cosineSimilarity(imageEmbedding, embedding);
    if (sim > bestNegSim) bestNegSim = sim;
  }

  // Softmax: P(pepe) = exp(pos/T) / (exp(pos/T) + exp(neg/T))
  // Using log-sum-exp trick for numerical stability
  const logitPos = bestPosSim / SOFTMAX_TEMPERATURE;
  const logitNeg = bestNegSim / SOFTMAX_TEMPERATURE;
  const maxLogit = Math.max(logitPos, logitNeg);
  const probPepe =
    Math.exp(logitPos - maxLogit) /
    (Math.exp(logitPos - maxLogit) + Math.exp(logitNeg - maxLogit));

  return {
    probPepe,
    bestPosSim,
    bestNegSim,
    bestPosPrompt,
    margin: bestPosSim - bestNegSim,
  };
}

// Score a single image
// Returns { clipScore (0-100), probPepe, posSim, negSim, margin, refSim }
async function scoreCLIP(imagePath) {
  const imageEmbedding = await encodeImage(imagePath);

  const positiveEmbs = await getPositiveEmbeddings();
  const negativeEmbs = await getNegativeEmbeddings();
  const refEmbs = await getRefEmbeddings();

  // Contrastive text scoring
  const contrast = contrastiveScore(imageEmbedding, positiveEmbs, negativeEmbs);

  // Reference image similarity (optional bonus signal)
  let bestRefSim = null;
  let bestRefImage = "none";
  if (refEmbs.length > 0) {
    bestRefSim = -Infinity;
    for (const { name, embedding } of refEmbs) {
      const sim = cosineSimilarity(imageEmbedding, embedding);
      if (sim > bestRefSim) {
        bestRefSim = sim;
        bestRefImage = name;
      }
    }
  }

  // Final score: contrastive probability is the primary signal (0-100)
  // Reference similarity is a small bonus (up to 10 points) only when
  // the contrastive score already indicates some Pepe-likeness
  let clipScore = contrast.probPepe * 100;

  if (bestRefSim !== null && contrast.probPepe > 0.3) {
    // Bonus: up to 10 points from reference similarity
    // Only kicks in when CLIP text already thinks it looks frog-like
    const refBonus = Math.max(0, (bestRefSim - 0.5)) * 20; // 0.5-1.0 -> 0-10
    clipScore = Math.min(100, clipScore + refBonus);
  }

  clipScore = Math.round(clipScore * 100) / 100;

  return {
    clipScore,
    probPepe: Math.round(contrast.probPepe * 1000) / 1000,
    posSim: Math.round(contrast.bestPosSim * 1000) / 1000,
    negSim: Math.round(contrast.bestNegSim * 1000) / 1000,
    margin: Math.round(contrast.margin * 1000) / 1000,
    refSim: bestRefSim !== null ? Math.round(bestRefSim * 1000) / 1000 : null,
    bestRefImage,
  };
}

module.exports = { initCLIP, scoreCLIP, encodeImage, cosineSimilarity };
