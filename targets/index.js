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
  alien: "./alien.js",
  shrek: "./shrek.js",
  yoda: "./yoda.js",
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

function getAllTextPrompts() {
  const seen = new Set();
  const all = [];
  for (const targetPath of Object.values(AVAILABLE)) {
    const t = require(targetPath);
    for (const prompt of t.textPrompts || []) {
      if (!seen.has(prompt)) {
        seen.add(prompt);
        all.push(prompt);
      }
    }
  }
  return all;
}

module.exports = { loadTarget, getAllTextPrompts, AVAILABLE };
