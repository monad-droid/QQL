const fs = require("fs");
const path = require("path");

// =============================================================================
// CLIP Image Similarity — Pure image-to-image comparison
//
// Standard approach: encode both images with a pre-trained vision model,
// compare feature vectors with cosine similarity. No text, no hacks.
//
// This is the same technique used by reverse image search, "find similar
// images," and every image retrieval system.
//
// Reference images go in ./references/. Each candidate is compared against
// every reference; the best match score is used for ranking.
// =============================================================================

const CLIP_MODEL = "Xenova/clip-vit-base-patch32";
const REFERENCES_DIR = path.join(__dirname, "lisa-reference");

let _visionModel = null;
let _processor = null;
let _refEmbeddings = null;

async function getTransformers() {
  return await import("@huggingface/transformers");
}

async function initCLIP() {
  if (_visionModel) return;

  const { CLIPVisionModelWithProjection, AutoProcessor } =
    await getTransformers();

  console.log("  Loading CLIP vision model (first run downloads ~350MB)...");

  [_processor, _visionModel] = await Promise.all([
    AutoProcessor.from_pretrained(CLIP_MODEL),
    CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL),
  ]);

  console.log("  CLIP vision model loaded.");

  // Pre-compute reference embeddings
  await getRefEmbeddings();
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

// Compare one candidate against all references. Returns best match.
async function scoreCLIP(imagePath) {
  const refEmbs = await getRefEmbeddings();
  if (refEmbs.length === 0) {
    throw new Error("No reference images in ./references/");
  }

  const candidateEmbedding = await encodeImage(imagePath);

  let bestSim = -Infinity;
  let bestRef = "";
  const allSims = [];

  for (const { name, embedding } of refEmbs) {
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

module.exports = { initCLIP, scoreCLIP, encodeImage, cosineSimilarity };
