#!/usr/bin/env node
// =============================================================================
// Verify Art References
//
// Tests each URL in data/art-references.json by sending a HEAD request.
// Reports which URLs resolve successfully and which fail.
//
// Usage:
//   node scripts/verify-art-references.js              # check all
//   node scripts/verify-art-references.js --first 50   # check first 50
//   node scripts/verify-art-references.js --fix        # remove failed entries
// =============================================================================

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const args = process.argv.slice(2);
const limit = args.includes("--first")
  ? parseInt(args[args.indexOf("--first") + 1]) || 50
  : Infinity;
const doFix = args.includes("--fix");

const dataPath = path.join(__dirname, "..", "data", "art-references.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const entries = data.slice(0, limit);

console.log(`Verifying ${entries.length} of ${data.length} entries...\n`);

let ok = 0;
let fail = 0;
let pending = entries.length;
const failed = [];
const concurrency = 10;
let idx = 0;

function checkUrl(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, { method: "HEAD", timeout: 10000 }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        checkUrl(res.headers.location).then(resolve);
      } else {
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      }
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function worker() {
  while (idx < entries.length) {
    const i = idx++;
    const entry = entries[i];
    const isOk = await checkUrl(entry.url);
    if (isOk) {
      ok++;
    } else {
      fail++;
      failed.push(entry.name);
      process.stdout.write(`  FAIL: ${entry.name} (${entry.title})\n`);
    }
    if ((ok + fail) % 50 === 0) {
      process.stdout.write(`  Progress: ${ok + fail}/${entries.length} (${ok} ok, ${fail} fail)\n`);
    }
  }
}

async function main() {
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  console.log(`\n=== Results ===`);
  console.log(`  OK:     ${ok}`);
  console.log(`  Failed: ${fail}`);
  console.log(`  Total:  ${ok + fail}`);
  console.log(`  Success rate: ${((ok / (ok + fail)) * 100).toFixed(1)}%`);

  if (failed.length > 0) {
    console.log(`\nFailed entries:`);
    failed.forEach((f) => console.log(`  - ${f}`));
  }

  if (doFix && failed.length > 0) {
    const failedSet = new Set(failed);
    const filtered = data.filter((d) => !failedSet.has(d.name));
    fs.writeFileSync(dataPath, JSON.stringify(filtered, null, 2));
    console.log(`\nRemoved ${failed.length} failed entries. ${filtered.length} remaining.`);

    // Also update minimal version
    const minPath = path.join(__dirname, "..", "data", "art-references-minimal.json");
    const minimal = filtered.map(({ name, url }) => ({ name, url }));
    fs.writeFileSync(minPath, JSON.stringify(minimal, null, 2));
    console.log(`Updated minimal version.`);
  }
}

main().catch(console.error);
