const fs = require("fs");
const path = require("path");

// Load qql-headless dependencies
const render = require("./qql-headless/src/render");
const traitsLib = require("./qql-headless/src/vendor/qql-traits.min.js");
const random = require("./qql-headless/src/vendor/qql-safe-random.min.js");

// =============================================================================
// FIXED TRAITS - Optimized for Mona Lisa-like outputs
//
// Strategy:
//   - Palette: Randomly picks Berlin or Edinburgh each render.
//       Berlin: dark, moody — bBlack, bCoolGrayDark, bCoolGrayMid, bWarm, bAccent.
//         Rich darks and warm accents match the Mona Lisa's shadowy sfumato tones.
//       Edinburgh: muted earth tones — eCream, eCoolDarkGreen, eMidGreen, eBrown.
//         Browns and dark greens match the painting's landscape and skin tones.
//   - Stacked color mode: Creates layered depth, good for portrait-like composition.
//   - Low color variety: Keeps output tonally cohesive (no random neon).
//   - Everything else RANDOM: Turbulence, flow field, structure, spacing, rings,
//     margin, ring size — this is where the 1-in-a-million magic happens.
//     CLIP will find the matches; we just need the right color family.
// =============================================================================
const PALETTES = ["Berlin", "Edinburgh"];

function getFixedTraits() {
  const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  return {
    colorPalette: palette,
    colorMode: "Stacked",
    colorVariety: "Low",
    // Everything else random for maximum exploration:
    turbulence: null,
    bullseyeRings1: null,
    bullseyeRings3: null,
    bullseyeRings7: null,
    ringThickness: null,
    sizeVariety: null,
    structure: null,
    flowField: null,
    margin: null,
    ringSize: null,
    spacing: null,
  };
}

// 400px is enough for CLIP scoring (which uses 224px internally).
// Re-render winners at full resolution later.
const IMAGE_WIDTH = 400;

const DEFAULT_ADDRESS = "0xA4620Fc13546462e817Fa49e44F04330872495a7";

function parseArgs(args) {
  let [outdir, count, startIndex] = args;
  if (!outdir) {
    console.error("Usage: node generate.js <outdir> [count] [start-index]");
    console.error("  outdir:       directory to save PNGs");
    console.error("  count:        number of images to generate (default: 100)");
    console.error("  start-index:  starting index for filenames (default: 0)");
    process.exit(1);
  }
  count = count ? parseInt(count) : 100;
  startIndex = startIndex ? parseInt(startIndex) : 0;
  return { outdir, target: DEFAULT_ADDRESS, count, startIndex };
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
    return randomSeed(address, getFixedTraits());
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
  const { outdir, target, count, startIndex } = parseArgs(args);

  if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
  }

  console.log(`\n=== QQL Mona Lisa Hunter ===`);
  console.log(`Generating ${count} outputs with Mona Lisa-optimized traits`);
  console.log(`Palettes: ${PALETTES.join(" / ")} (random per render)`);
  console.log(`Output directory: ${outdir}`);
  if (startIndex > 0) console.log(`Starting at index: ${startIndex}`);
  console.log(`Trait template: ${JSON.stringify(getFixedTraits(), null, 2)}\n`);

  let generated = 0;
  for (let i = 0; i < count; i++) {
    try {
      await renderOne(target, outdir, startIndex + i, count);
      generated++;
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
        totalGenerated: generated,
        palettes: PALETTES,
        imageWidth: IMAGE_WIDTH,
        target,
      },
      null,
      2
    )
  );
  console.log(`\nGenerated ${generated}/${count} images.`);
  console.log(`Summary saved to ${summaryFile}`);
}

main(process.argv.slice(2)).catch((e) => {
  process.exitCode = 1;
  console.error(e);
});
