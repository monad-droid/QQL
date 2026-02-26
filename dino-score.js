const fs = require("fs");
const path = require("path");

// =============================================================================
// DINOv3 Similarity — Image-to-image comparison using Meta's DINOv3
//
// DINOv3 is a self-supervised vision model that learns structural and visual
// features without text alignment. Superior to CLIP for comparing images across
// different visual domains (abstract generative art ↔ photographs of paintings).
//
// Uses the CLS token from DINOv3 ViT-S/16 (384-dim embeddings, 21M params)
// for global image representation, then cosine similarity to rank candidates.
//
// Reference images go in ./references/.
// Text prompts are NOT used — DINOv3 is vision-only.
// =============================================================================

const DINO_MODEL = "onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX";
const EMBED_DIM = 384; // ViT-S/16 hidden size
const REFERENCES_DIR = path.join(__dirname, "references");

let _processor = null;
let _model = null;
let _refEmbeddings = null;

async function getTransformers() {
  return await import("@huggingface/transformers");
}

async function initDINO() {
  const { AutoProcessor, AutoModel } = await getTransformers();

  if (!_model) {
    console.log("  Loading DINOv3 ViT-B/16 model (first run downloads ~350MB)...");
    [_processor, _model] = await Promise.all([
      AutoProcessor.from_pretrained(DINO_MODEL),
      AutoModel.from_pretrained(DINO_MODEL),
    ]);
    console.log("  DINOv3 model loaded.");
  }

  // Pre-compute reference image embeddings
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
  let rawImage = await RawImage.read(imagePath);
  // DINOv3 expects 3-channel RGB; convert RGBA/grayscale images
  if (rawImage.channels !== 3) {
    rawImage = rawImage.rgb();
  }
  const inputs = await _processor(rawImage);
  const output = await _model(inputs);

  // DINOv3 output: last_hidden_state [1, seq_len, 768]
  // CLS token is at position 0 — first EMBED_DIM values in the flat array
  const data = output.last_hidden_state.data;
  return Array.from(data.slice(0, EMBED_DIM));
}

async function getRefEmbeddings() {
  if (_refEmbeddings) return _refEmbeddings;

  _refEmbeddings = [];
  if (!fs.existsSync(REFERENCES_DIR)) return _refEmbeddings;

  const files = fs
    .readdirSync(REFERENCES_DIR)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

  if (files.length === 0) return _refEmbeddings;

  console.log(`  Encoding ${files.length} reference image(s) with DINOv3...`);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    process.stdout.write(`\r  Encoding references: ${i + 1}/${files.length}...`);
    try {
      const embedding = await encodeImage(path.join(REFERENCES_DIR, f));
      _refEmbeddings.push({ name: f, embedding });
    } catch (err) {
      console.error(`\n  Warning: skipping reference ${f}: ${err.message}`);
    }
  }
  console.log(` Done (${_refEmbeddings.length} encoded).`);

  return _refEmbeddings;
}

// Compare one candidate against all reference images.
// Returns best match.
async function scoreDINO(imagePath) {
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
    allSims.push({ name, sim: Math.round(sim * 10000) / 10000 });
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

module.exports = { initDINO, scoreDINO, encodeImage, cosineSimilarity };
