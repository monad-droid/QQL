const fs = require("fs");
const path = require("path");

// Load qql-headless dependencies
const render = require("./qql-headless/src/render");
const traitsLib = require("./qql-headless/src/vendor/qql-traits.min.js");
const random = require("./qql-headless/src/vendor/qql-safe-random.min.js");

// =============================================================================
// FIXED TRAITS - Optimized for Pepe-like outputs
//
// Strategy:
//   - Edinburgh palette: Best match for Pepe's earthy/muted green. Contains:
//       eCream (sat 4, bright 96) — near-white, perfect for eyes
//       eCoolDarkGreen (hue 170, sat 52, bright 25) — Pepe face green
//       eMidGreen (hue 150, sat 60, bright 35) — Pepe face green
//       eGrayBlue (hue 200, sat 45, bright 40) — dark enough for pupils
//       eBrown (hue 30, sat 35, bright 35) — mouth/lip tones
//     Edinburgh has 5 backgrounds, including "Edinburgh Green" which makes
//     the entire canvas green — Pepe's face base color.
//   - Stacked color mode: Creates rings-within-rings = concentric circles that
//     resemble eyes (white outer ring, dark inner ring).
//   - Low color variety: Keeps output green-dominant, reduces random color noise.
//   - No turbulence: Clean, round circles (not distorted/wobbly).
//   - Bullseye rings on: Multiple concentric rings = more eye-like shapes.
//   - Wild size variety: Need both large rings (eyes) and small rings (detail).
//   - Thick rings: Visible, prominent shapes.
//   - Wide margin: Pushes circles inward, creating a face-shaped boundary.
//   - Everything else RANDOM: Flow field, structure, spacing, ring size
//     are where the 1-in-a-million magic happens.
// =============================================================================
const FIXED_TRAITS = {
  colorPalette: "Edinburgh",
  colorMode: "Stacked",
  colorVariety: "Low",
  turbulence: "None",
  bullseyeRings1: "On",
  bullseyeRings3: "On",
  bullseyeRings7: "On",
  ringThickness: "Thick",
  sizeVariety: "Wild",
  // Left random for maximum exploration:
  structure: null,
  flowField: null,
  margin: "Wide",
  ringSize: null,
  spacing: null,
};

// Smaller width for batch generation speed; increase for final renders
const IMAGE_WIDTH = 800;

const DEFAULT_ADDRESS = "0xA4620Fc13546462e817Fa49e44F04330872495a7";

function parseArgs(args) {
  let [outdir, count] = args;
  if (!outdir) {
    console.error("Usage: node generate.js <outdir> [count]");
    console.error("  outdir: directory to save PNGs");
    console.error("  count:  number of images to generate (default: 100)");
    process.exit(1);
  }
  count = count ? parseInt(count) : 100;
  return { outdir, target: DEFAULT_ADDRESS, count };
}

function isHex(s) {
  return s.toLowerCase().match(/^0x[0-9a-f]*$/);
}

function randomSeed(address, traits) {
  if (!Buffer.isBuffer(address) || address.length !== 20)
    throw new Error("expected address, got: " + address);
  const buf = Buffer.from(
    Array(32)
      .fill()
      .map(() => Math.random() * 256)
  );
  address.copy(buf);
  const baseSeed = "0x" + buf.toString("hex");
  const rng = random.makeUnseededRng();
  const fullTraits = traitsLib.fillTraits(traits, rng);
  return traitsLib.encodeTraits(baseSeed, fullTraits);
}

function generateSeed(target) {
  target = target.toLowerCase();
  if (!isHex(target)) {
    throw new Error("expected hex string; got: " + target);
  }
  const nibbles = target.slice(2);
  if (nibbles.length === 40) {
    const address = Buffer.from(nibbles, "hex");
    return randomSeed(address, FIXED_TRAITS);
  }
  if (nibbles.length === 64) return target;
  throw new Error("expected address (40 hex) or seed (64 hex); got: " + target);
}

async function renderOne(target, outdir, index, total) {
  const seed = generateSeed(target);
  const traits = traitsLib.extractTraits(seed);

  console.log(`[${index + 1}/${total}] Rendering seed: ${seed.slice(0, 18)}...`);
  console.log(`  Traits: palette=${traits.colorPalette} flow=${traits.flowField} structure=${traits.structure} spacing=${traits.spacing}`);

  const startTime = Date.now();
  const { imageData, renderData } = await render({ seed, width: IMAGE_WIDTH });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const basename = `${String(index).padStart(5, "0")}-${seed}.png`;
  const outfile = path.join(outdir, basename);
  await fs.promises.writeFile(outfile, imageData);

  // Save metadata alongside the image
  const metafile = path.join(outdir, `${String(index).padStart(5, "0")}-${seed}.json`);
  await fs.promises.writeFile(
    metafile,
    JSON.stringify({ seed, traits, renderData, elapsed: parseFloat(elapsed) }, null, 2)
  );

  console.log(`  Done in ${elapsed}s -> ${outfile}`);
  return { seed, traits, renderData, outfile };
}

async function main(args) {
  const { outdir, target, count } = parseArgs(args);

  if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
  }

  console.log(`\n=== QQL Pepe Hunter ===`);
  console.log(`Generating ${count} outputs with Pepe-optimized traits`);
  console.log(`Output directory: ${outdir}`);
  console.log(`Fixed traits: ${JSON.stringify(FIXED_TRAITS, null, 2)}\n`);

  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      const result = await renderOne(target, outdir, i, count);
      results.push(result);
    } catch (err) {
      console.error(`  ERROR on render ${i + 1}: ${err.message}`);
    }
  }

  // Save summary
  const summaryFile = path.join(outdir, "_summary.json");
  await fs.promises.writeFile(
    summaryFile,
    JSON.stringify(
      {
        totalGenerated: results.length,
        fixedTraits: FIXED_TRAITS,
        imageWidth: IMAGE_WIDTH,
        target,
      },
      null,
      2
    )
  );
  console.log(`\nGenerated ${results.length}/${count} images.`);
  console.log(`Summary saved to ${summaryFile}`);
}

main(process.argv.slice(2)).catch((e) => {
  process.exitCode = 1;
  console.error(e);
});
