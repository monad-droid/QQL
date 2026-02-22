const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

// =============================================================================
// CLIP Scoring Module
//
// Uses OpenAI's CLIP model (via @huggingface/transformers ONNX runtime) to
// compute semantic similarity between QQL renders and Pepe the Frog.
//
// Two scoring modes:
//   1. Text similarity:  "Does this image look like Pepe the frog?"
//   2. Image similarity: "Does this image match these reference Pepe images?"
//
// Both produce cosine similarity scores in [0, 1].
// =============================================================================

const CLIP_MODEL = "Xenova/clip-vit-base-patch32";

const PEPE_TEXT_PROMPTS = [
  "Pepe the frog meme face",
  "green frog face with big round eyes",
  "cartoon frog with two white eyes on green background",
];

const REFERENCES_DIR = path.join(__dirname, "references");

let _pipeline = null;
let _tokenizer = null;
let _textModel = null;
let _visionModel = null;
let _processor = null;
let _textEmbeddings = null;
let _refEmbeddings = null;

// Dynamically import ESM module
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
    RawImage,
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

// Pre-compute text embeddings for Pepe prompts
async function getTextEmbeddings() {
  if (_textEmbeddings) return _textEmbeddings;

  _textEmbeddings = [];
  for (const prompt of PEPE_TEXT_PROMPTS) {
    const inputs = await _tokenizer(prompt, {
      padding: true,
      truncation: true,
    });
    const output = await _textModel(inputs);
    const embedding = Array.from(output.text_embeds.data);
    _textEmbeddings.push({ prompt, embedding });
  }
  return _textEmbeddings;
}

// Pre-compute image embeddings for reference Pepe images
async function getRefEmbeddings() {
  if (_refEmbeddings) return _refEmbeddings;

  _refEmbeddings = [];
  if (!fs.existsSync(REFERENCES_DIR)) return _refEmbeddings;

  const { RawImage } = await getTransformers();

  const files = fs
    .readdirSync(REFERENCES_DIR)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

  for (const f of files) {
    const imgPath = path.join(REFERENCES_DIR, f);
    const rawImage = await RawImage.read(imgPath);
    const imageInputs = await _processor(rawImage);
    const output = await _visionModel(imageInputs);
    const embedding = Array.from(output.image_embeds.data);
    _refEmbeddings.push({ name: f, embedding });
  }

  return _refEmbeddings;
}

// Encode a single image to CLIP embedding
async function encodeImage(imagePath) {
  const { RawImage } = await getTransformers();
  const rawImage = await RawImage.read(imagePath);
  const imageInputs = await _processor(rawImage);
  const output = await _visionModel(imageInputs);
  return Array.from(output.image_embeds.data);
}

// Score a single image against text prompts and reference images
// Returns { clipScore (0-100), textScore, refScore, bestTextPrompt, bestRefImage }
async function scoreCLIP(imagePath) {
  const imageEmbedding = await encodeImage(imagePath);

  const textEmbeddings = await getTextEmbeddings();
  const refEmbeddings = await getRefEmbeddings();

  // Text similarity: best match across prompts
  let bestTextSim = -1;
  let bestTextPrompt = "";
  for (const { prompt, embedding } of textEmbeddings) {
    const sim = cosineSimilarity(imageEmbedding, embedding);
    if (sim > bestTextSim) {
      bestTextSim = sim;
      bestTextPrompt = prompt;
    }
  }

  // Reference image similarity: best match across references
  let bestRefSim = -1;
  let bestRefImage = "none";
  for (const { name, embedding } of refEmbeddings) {
    const sim = cosineSimilarity(imageEmbedding, embedding);
    if (sim > bestRefSim) {
      bestRefSim = sim;
      bestRefImage = name;
    }
  }

  // Combine: if we have references, weight them more (they're more specific)
  // Text similarity is a baseline signal, reference images are the gold standard
  let combinedSim;
  if (refEmbeddings.length > 0) {
    combinedSim = bestRefSim * 0.6 + bestTextSim * 0.4;
  } else {
    combinedSim = bestTextSim;
  }

  // CLIP cosine similarities for matching content typically range 0.15 - 0.35
  // Map this range to 0-100 for scoring
  // Below 0.15 = definitely not Pepe, above 0.35 = very strong match
  const normalized = Math.min(
    Math.max((combinedSim - 0.15) / (0.35 - 0.15), 0),
    1.0
  );
  const clipScore = Math.round(normalized * 100 * 100) / 100;

  return {
    clipScore,
    textSim: Math.round(bestTextSim * 1000) / 1000,
    refSim: refEmbeddings.length > 0 ? Math.round(bestRefSim * 1000) / 1000 : null,
    bestTextPrompt,
    bestRefImage,
    rawSim: Math.round(combinedSim * 1000) / 1000,
  };
}

module.exports = { initCLIP, scoreCLIP, encodeImage, cosineSimilarity };
