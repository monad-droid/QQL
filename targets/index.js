// Target loader — reads TARGET env var and returns the right config.
// Default: "pepe" (so the VPS keeps working without changes).
//
// Usage:
//   TARGET=monalisa node generate.js ...
//   TARGET=pepe node score.js ...       (or just: node score.js ...)

const path = require("path");

const AVAILABLE = {
  pepe: "./pepe.js",
  monalisa: "./monalisa.js",
};

function loadTarget() {
  const targetKey = (process.env.TARGET || "pepe").toLowerCase();
  const targetPath = AVAILABLE[targetKey];

  if (!targetPath) {
    const valid = Object.keys(AVAILABLE).join(", ");
    console.error(`Unknown TARGET="${targetKey}". Available: ${valid}`);
    process.exit(1);
  }

  const target = require(targetPath);
  console.log(`[target: ${target.name}]`);
  return target;
}

module.exports = { loadTarget, AVAILABLE };
