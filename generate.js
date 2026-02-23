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
//   - Fidenza palette: Best Renaissance palette. Contains:
//       fNewsprint (hue 40, sat 12, bright 88) — warm parchment-like base
//       fBrown/fDarkBrown/fExtraDarkBrown — dark surround tones (hair/bg)
//       fPaleYellow (hue 43, sat 60, bright 99) — golden highlights (skin)
//       fPink (hue 11, sat 35, bright 97) — skin tone highlights
//       fOrange (hue 25, sat 78, bright 90) — warm face tones
//     Fidenza has 6 backgrounds, including "Fidenza Brown" (dark, B=18) which
//     creates the dark surround typical of Renaissance portraits, and
//     "Fidenza Newsprint" (warm beige, B=92) for a golden canvas.
//   - Stacked color mode: Concentric rings create depth and layered portrait
//     compositions — lighter inner rings, darker outer rings.
//   - Low color variety: Keeps output warm and cohesive, avoids random cool tones.
//   - No turbulence: Clean, round circles for smooth portrait-like shapes.
//   - Bullseye rings on: Concentric depth = Renaissance chiaroscuro effect.
//   - Wild size variety: Large circles (face) + small (detail/texture).
//   - Thick rings: Visible, prominent shapes.
//   - Wide margin: Pushes circles inward, creating a centered portrait framing.
//   - Everything else RANDOM: Flow field, structure, spacing, ring size
//     are where the 1-in-a-million magic happens.
// =============================================================================
const FIXED_TRAITS = {
  colorPalette: "Fidenza",
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

// 400px is enough for CLIP scoring (which uses 224px internally).
// Re-render winners at full resolution later.
const IMAGE_WIDTH = 400;

const DEFAULT_ADDRESS = "0xA4620Fc13546462e817Fa49e44F04330872495a7";

function parseArgs(args) {
  let [outdir, count, startIndex, workerTag] = args;
  if (!outdir) {
    console.error("Usage: node generate.js <outdir> [count] [start-index] [worker-tag]");
    process.exit(1);
  }
  count = count ? parseInt(count) : 100;
  startIndex = startIndex ? parseInt(startIndex) : 0;
  const prefix = workerTag ? `[W${workerTag}] ` : "";
  return { outdir, target: DEFAULT_ADDRESS, count, startIndex, prefix };
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

async function renderOne(target, outdir, index, localNum, localTotal, prefix) {
  const seed = generateSeed(target);
  const traits = traitsLib.extractTraits(seed);

  console.log(`${prefix}[${localNum}/${localTotal}] #${String(index).padStart(5, "0")} Rendering seed: ${seed.slice(0, 18)}...`);
  console.log(`${prefix}  Traits: palette=${traits.colorPalette} flow=${traits.flowField} structure=${traits.structure} spacing=${traits.spacing}`);

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

  console.log(`${prefix}  Done in ${elapsed}s -> ${outfile}`);
  return { seed, traits, renderData, outfile };
}

async function main(args) {
  const { outdir, target, count, startIndex, prefix } = parseArgs(args);

  if (!fs.existsSync(outdir)) {
    fs.mkdirSync(outdir, { recursive: true });
  }

  console.log(`${prefix}Generating ${count} images (indices ${startIndex}-${startIndex + count - 1})`);

  let generated = 0;
  for (let i = 0; i < count; i++) {
    try {
      await renderOne(target, outdir, startIndex + i, i + 1, count, prefix);
      generated++;
    } catch (err) {
      console.error(`${prefix}  ERROR on render ${startIndex + i}: ${err.message}`);
    }
  }

  console.log(`${prefix}Done: ${generated}/${count} images.`);
}

main(process.argv.slice(2)).catch((e) => {
  process.exitCode = 1;
  console.error(e);
});
