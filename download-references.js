#!/usr/bin/env node
// Download reference images from Wikimedia Commons using the MediaWiki API.
// Resolves thumbnail URLs at runtime so we only need filenames, not brittle paths.
//
// Usage: node download-references.js [refs_dir]
//   TARGET env var selects which target config to use (default: pepe)

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const REFS_DIR = process.argv[2] || "references";
const WIDTH = 1280; // thumbnail width
const CONCURRENCY = 4; // parallel downloads

// Load target config
const TARGET = process.env.TARGET || "pepe";
process.env.TARGET = TARGET;
const { loadTarget } = require("./targets");
const target = loadTarget();
const refs = target.referenceUrls || [];

if (refs.length === 0) {
  console.log("No reference images defined for target:", TARGET);
  process.exit(0);
}

fs.mkdirSync(REFS_DIR, { recursive: true });

function httpsGet(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto
      .get(url, { headers: { "User-Agent": "QQL-Hunter/1.0" }, ...opts }, resolve)
      .on("error", reject);
  });
}

function fetchJson(url) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await httpsGet(url);
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Bad JSON from " + url));
        }
      });
      res.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

function downloadFile(url, dest, redirects = 5) {
  return new Promise(async (resolve, reject) => {
    if (redirects <= 0) return reject(new Error("Too many redirects"));
    try {
      const res = await httpsGet(url);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest, redirects - 1).then(
          resolve,
          reject
        );
      }
      if (res.statusCode !== 200) {
        res.resume(); // drain
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on("finish", () => resolve());
      ws.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

// Resolve a Wikimedia Commons filename to a thumbnail URL via the API.
async function resolveWikimediaUrl(filename) {
  const apiUrl =
    "https://commons.wikimedia.org/w/api.php?action=query" +
    "&titles=File:" +
    encodeURIComponent(filename) +
    "&prop=imageinfo&iiprop=url&iiurlwidth=" +
    WIDTH +
    "&format=json";
  const json = await fetchJson(apiUrl);
  const pages = (json.query && json.query.pages) || {};
  const page = Object.values(pages)[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  return (info && info.thumburl) || (info && info.url) || null;
}

async function downloadOne(ref) {
  const dest = path.join(REFS_DIR, ref.name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    return "exists";
  }

  // Try direct URL first (legacy format)
  if (ref.url) {
    try {
      await downloadFile(ref.url, dest);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "ok";
    } catch (_) {
      // fall through to wikimedia API
    }
  }

  // Resolve via Wikimedia API
  if (ref.wikimedia) {
    try {
      const thumbUrl = await resolveWikimediaUrl(ref.wikimedia);
      if (!thumbUrl) return "not_found";
      await downloadFile(thumbUrl, dest);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "ok";
    } catch (_) {
      // clean up partial file
      try { fs.unlinkSync(dest); } catch (_e) {}
    }
  }

  return "failed";
}

async function main() {
  console.log(
    `>>> Downloading up to ${refs.length} reference images for target: ${TARGET}`
  );
  console.log(`>>> Destination: ${REFS_DIR}/`);
  console.log("");

  let ok = 0,
    exists = 0,
    fail = 0;
  const failures = [];

  // Process in batches for controlled concurrency
  for (let i = 0; i < refs.length; i += CONCURRENCY) {
    const batch = refs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (ref) => {
        const status = await downloadOne(ref);
        if (status === "ok") {
          process.stdout.write(`  [OK] ${ref.name}\n`);
        } else if (status === "exists") {
          // silent
        } else {
          process.stdout.write(`  [FAIL] ${ref.name}\n`);
          failures.push(ref.name);
        }
        return status;
      })
    );
    for (const r of results) {
      if (r === "ok") ok++;
      else if (r === "exists") exists++;
      else fail++;
    }
  }

  // Summary
  const files = fs
    .readdirSync(REFS_DIR)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  console.log("");
  console.log(
    `>>> Results: ${ok} downloaded, ${exists} already existed, ${fail} failed`
  );
  console.log(`>>> ${files.length} reference images available in ${REFS_DIR}/`);
  if (failures.length > 0) {
    console.log(`>>> Failed: ${failures.join(", ")}`);
  }
}

main().catch((e) => {
  console.error("Download error:", e.message);
  // Non-fatal — partial references are better than none
  process.exit(0);
});
