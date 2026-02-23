const fs = require("fs");
const path = require("path");

// =============================================================================
// CLIP Similarity — Image-to-image AND text-to-image comparison
//
// Two modes:
//   1. Image-to-image: encode both images with CLIP vision model, compare.
//   2. Text-to-image:  encode text prompts with CLIP text model, compare
//      against image embeddings. No reference images needed.
//
// Text mode often works better for finding "looks like X" because CLIP's
// text encoder captures the general concept rather than matching pixel details
// of one specific reference photo.
//
// Reference images go in ./references/. Text prompts are defined per-target.
// Both can be used together — the best score across all references wins.
// =============================================================================

const CLIP_MODEL = "Xenova/clip-vit-base-patch32";
const REFERENCES_DIR = path.join(__dirname, "references");

let _visionModel = null;
let _textModel = null;
let _tokenizer = null;
let _processor = null;
let _refEmbeddings = null;
let _textEmbeddings = null;

async function getTransformers() {
  return await import("@huggingface/transformers");
}

async function initCLIP({ textPrompts = [] } = {}) {
  const {
    CLIPVisionModelWithProjection,
    CLIPTextModelWithProjection,
    AutoTokenizer,
    AutoProcessor,
  } = await getTransformers();

  if (!_visionModel) {
    console.log("  Loading CLIP vision model (first run downloads ~350MB)...");
    [_processor, _visionModel] = await Promise.all([
      AutoProcessor.from_pretrained(CLIP_MODEL),
      CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL),
    ]);
    console.log("  CLIP vision model loaded.");
  }

  // Load text model if we have text prompts
  if (textPrompts.length > 0 && !_textModel) {
    console.log("  Loading CLIP text model...");
    [_tokenizer, _textModel] = await Promise.all([
      AutoTokenizer.from_pretrained(CLIP_MODEL),
      CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL),
    ]);
    console.log("  CLIP text model loaded.");
  }

  // Pre-compute reference image embeddings
  await getRefEmbeddings();

  // Pre-compute text prompt embeddings
  if (textPrompts.length > 0) {
    await getTextEmbeddings(textPrompts);
  }
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function encodeImage(imagePath) {
  const { RawImage } = await getTransformers();
  const rawImage = await RawImage.read(imagePath);
  const imageInputs = await _processor(rawImage);
  const output = await _visionModel(imageInputs);
  return Array.from(output.image_embeds.data);
}

async function encodeText(text) {
  const textInputs = await _tokenizer(text, { padding: true, truncation: true });
  const output = await _textModel(textInputs);
  return Array.from(output.text_embeds.data);
}

async function getTextEmbeddings(prompts) {
  if (_textEmbeddings) return _textEmbeddings;

  _textEmbeddings = [];
  console.log(`  Encoding ${prompts.length} text prompt(s)...`);
  for (const prompt of prompts) {
    const embedding = await encodeText(prompt);
    _textEmbeddings.push({ name: `"${prompt}"`, embedding });
  }
  console.log(`  Text prompts encoded: ${prompts.map(p => `"${p}"`).join(", ")}`);

  return _textEmbeddings;
}

async function getRefEmbeddings() {
  if (_refEmbeddings) return _refEmbeddings;

  _refEmbeddings = [];
  if (!fs.existsSync(REFERENCES_DIR)) return _refEmbeddings;

  const files = fs
    .readdirSync(REFERENCES_DIR)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

  if (files.length === 0) return _refEmbeddings;

  console.log(`  Encoding ${files.length} reference image(s)...`);
  for (const f of files) {
    const embedding = await encodeImage(path.join(REFERENCES_DIR, f));
    _refEmbeddings.push({ name: f, embedding });
  }
  console.log(`  References encoded: ${files.join(", ")}`);

  return _refEmbeddings;
}

// Compare one candidate against all references (images + text prompts).
// Returns best match across both.
async function scoreCLIP(imagePath) {
  const refEmbs = await getRefEmbeddings();
  const textEmbs = _textEmbeddings || [];

  const allRefs = [...refEmbs, ...textEmbs];

  if (allRefs.length === 0) {
    throw new Error("No reference images in ./references/ and no text prompts configured");
  }

  const candidateEmbedding = await encodeImage(imagePath);

  let bestSim = -Infinity;
  let bestRef = "";
  const allSims = [];

  for (const { name, embedding } of allRefs) {
    const sim = cosineSimilarity(candidateEmbedding, embedding);
    allSims.push({ name, sim: Math.round(sim * 1000) / 1000 });
    if (sim > bestSim) {
      bestSim = sim;
      bestRef = name;
    }
  }

  return {
    similarity: Math.round(bestSim * 10000) / 10000,
    bestRef,
    allSims,
  };
}

module.exports = { initCLIP, scoreCLIP, encodeImage, encodeText, cosineSimilarity };
