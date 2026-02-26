#!/usr/bin/env node
// =============================================================================
// Smart Art Reference Downloader v2
//
// Uses Wikipedia and Wikimedia Commons APIs to find the correct image URL
// for each painting, then downloads it. Runs SEQUENTIALLY with proper
// rate limiting to avoid 429 errors from Wikimedia.
//
// Usage:
//   node scripts/download-with-api.js [output-dir]
//   node scripts/download-with-api.js references --resume
// =============================================================================

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const REFS_DIR = process.argv[2] || "references";
const RESUME = process.argv.includes("--resume");
const IMAGE_WIDTH = 800;
const REQUEST_TIMEOUT = 20000;

// Rate limiting - be very polite to Wikimedia
const DELAY_BETWEEN_PAINTINGS = 1500; // 1.5s between each painting
const DELAY_BETWEEN_API_CALLS = 500;  // 0.5s between API calls within a painting
const BACKOFF_BASE = 5000;            // 5s initial backoff on 429
const MAX_BACKOFF = 120000;           // 2 min max backoff

// ---------------------------------------------------------------------------
// Load painting data
// ---------------------------------------------------------------------------
let dataPath = path.join(__dirname, "..", "data", "art-references.json");
if (!fs.existsSync(dataPath)) {
  dataPath = path.join(process.cwd(), "data", "art-references.json");
}
if (!fs.existsSync(dataPath)) {
  console.error("ERROR: Cannot find data/art-references.json");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
if (!fs.existsSync(REFS_DIR)) fs.mkdirSync(REFS_DIR, { recursive: true });

console.log(`Art Reference Downloader v2`);
console.log(`  Paintings: ${data.length}`);
console.log(`  Output:    ${path.resolve(REFS_DIR)}`);
console.log(`  Resume:    ${RESUME}`);
console.log(`  Rate:      ~1 painting per ${DELAY_BETWEEN_PAINTINGS / 1000}s (sequential)`);
console.log(``);

// ---------------------------------------------------------------------------
// HTTP helpers with 429 backoff
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let currentBackoff = 0; // Global backoff tracker

function fetchJson(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent":
            "QQLArtHunter/1.0 (https://github.com/monad-droid/QQL; art reference collection)",
          Accept: "application/json",
        },
        timeout: REQUEST_TIMEOUT,
      },
      (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJson(res.headers.location, retries).then(resolve, reject);
          return;
        }

        // Handle 429 - rate limited
        if (res.statusCode === 429) {
          // Consume body
          res.resume();
          const wait = Math.min(
            BACKOFF_BASE * Math.pow(2, 3 - retries),
            MAX_BACKOFF
          );
          currentBackoff = wait;
          process.stdout.write(`    [429 rate limited - waiting ${wait / 1000}s...]\n`);
          if (retries > 0) {
            sleep(wait).then(() => {
              currentBackoff = 0;
              fetchJson(url, retries - 1).then(resolve, reject);
            });
          } else {
            reject(new Error("HTTP 429 - rate limited after retries"));
          }
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON parse error`));
          }
        });
      }
    );
    req.on("error", (e) => {
      if (retries > 0) {
        sleep(2000).then(() => fetchJson(url, retries - 1).then(resolve, reject));
      } else {
        reject(e);
      }
    });
    req.on("timeout", () => {
      req.destroy();
      if (retries > 0) {
        sleep(2000).then(() => fetchJson(url, retries - 1).then(resolve, reject));
      } else {
        reject(new Error("timeout"));
      }
    });
  });
}

function downloadFile(url, dest, retries = 3) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent":
            "QQLArtHunter/1.0 (https://github.com/monad-droid/QQL; art reference collection)",
        },
        timeout: 30000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, dest, retries).then(resolve, reject);
          return;
        }

        // Handle 429 on download too
        if (res.statusCode === 429) {
          res.resume();
          const wait = Math.min(BACKOFF_BASE * Math.pow(2, 3 - retries), MAX_BACKOFF);
          process.stdout.write(`    [429 on download - waiting ${wait / 1000}s...]\n`);
          if (retries > 0) {
            sleep(wait).then(() =>
              downloadFile(url, dest, retries - 1).then(resolve, reject)
            );
          } else {
            reject(new Error("HTTP 429"));
          }
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const ws = fs.createWriteStream(dest);
        res.pipe(ws);
        ws.on("finish", () => {
          const stat = fs.statSync(dest);
          if (stat.size < 1000) {
            fs.unlinkSync(dest);
            reject(new Error("File too small"));
          } else {
            resolve(true);
          }
        });
        ws.on("error", reject);
      }
    );
    req.on("error", (e) => {
      if (retries > 0) {
        sleep(3000).then(() =>
          downloadFile(url, dest, retries - 1).then(resolve, reject)
        );
      } else {
        reject(e);
      }
    });
    req.on("timeout", () => {
      req.destroy();
      if (retries > 0) {
        sleep(3000).then(() =>
          downloadFile(url, dest, retries - 1).then(resolve, reject)
        );
      } else {
        reject(new Error("timeout"));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Wikipedia/Commons API strategies
// ---------------------------------------------------------------------------

async function strategyWikipediaPageImage(title, artist) {
  const searchTerm = `${title} ${artist} painting`;
  const searchUrl =
    `https://en.wikipedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(searchTerm)}&srlimit=3&format=json`;

  const searchResult = await fetchJson(searchUrl);
  const pages = searchResult?.query?.search || [];

  for (const page of pages.slice(0, 2)) {
    await sleep(DELAY_BETWEEN_API_CALLS);
    const pageTitle = encodeURIComponent(page.title);
    const imageUrl =
      `https://en.wikipedia.org/w/api.php?action=query` +
      `&titles=${pageTitle}` +
      `&prop=pageimages&piprop=original|thumbnail&pithumbsize=${IMAGE_WIDTH}` +
      `&format=json`;

    const imageResult = await fetchJson(imageUrl);
    const pageData = Object.values(imageResult?.query?.pages || {})[0];
    if (pageData?.thumbnail?.source) return pageData.thumbnail.source;
    if (pageData?.original?.source) return pageData.original.source;
  }
  return null;
}

async function strategyCommonsSearch(title, artist) {
  const searchTerm = `${title} ${artist}`;
  const searchUrl =
    `https://commons.wikimedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(searchTerm)}` +
    `&srnamespace=6&srlimit=3&format=json`;

  const searchResult = await fetchJson(searchUrl);
  const files = searchResult?.query?.search || [];

  for (const file of files.slice(0, 2)) {
    await sleep(DELAY_BETWEEN_API_CALLS);
    const fileTitle = encodeURIComponent(file.title);
    const infoUrl =
      `https://commons.wikimedia.org/w/api.php?action=query` +
      `&titles=${fileTitle}&prop=imageinfo&iiprop=url|mime` +
      `&iiurlwidth=${IMAGE_WIDTH}&format=json`;

    const infoResult = await fetchJson(infoUrl);
    const pageData = Object.values(infoResult?.query?.pages || {})[0];
    const info = pageData?.imageinfo?.[0];

    if (info && info.mime && info.mime.startsWith("image/")) {
      return info.thumburl || info.url;
    }
  }
  return null;
}

async function strategyOriginalUrl(originalUrl) {
  return new Promise((resolve) => {
    const mod = originalUrl.startsWith("https") ? https : http;
    const req = mod.request(
      originalUrl,
      {
        method: "HEAD",
        timeout: 10000,
        headers: { "User-Agent": "QQLArtHunter/1.0" },
      },
      (res) => {
        res.resume();
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(res.headers.location);
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(originalUrl);
        } else {
          resolve(null);
        }
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function strategyWikipediaTitleOnly(title) {
  const searchUrl =
    `https://en.wikipedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(title + " painting")}&srlimit=2&format=json`;

  const searchResult = await fetchJson(searchUrl);
  const pages = searchResult?.query?.search || [];

  for (const page of pages.slice(0, 1)) {
    await sleep(DELAY_BETWEEN_API_CALLS);
    const pageTitle = encodeURIComponent(page.title);
    const imageUrl =
      `https://en.wikipedia.org/w/api.php?action=query` +
      `&titles=${pageTitle}&prop=pageimages&piprop=original|thumbnail` +
      `&pithumbsize=${IMAGE_WIDTH}&format=json`;

    const imageResult = await fetchJson(imageUrl);
    const pageData = Object.values(imageResult?.query?.pages || {})[0];
    if (pageData?.thumbnail?.source) return pageData.thumbnail.source;
    if (pageData?.original?.source) return pageData.original.source;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------
async function resolveImageUrl(entry) {
  const { title, artist, url: originalUrl } = entry;

  // Strategy 1: Wikipedia page image
  try {
    const url = await strategyWikipediaPageImage(title, artist);
    if (url) return { url, strategy: "wikipedia" };
  } catch (e) {}

  await sleep(DELAY_BETWEEN_API_CALLS);

  // Strategy 2: Commons search
  try {
    const url = await strategyCommonsSearch(title, artist);
    if (url) return { url, strategy: "commons" };
  } catch (e) {}

  await sleep(DELAY_BETWEEN_API_CALLS);

  // Strategy 3: Original URL
  try {
    const url = await strategyOriginalUrl(originalUrl);
    if (url) return { url, strategy: "original" };
  } catch (e) {}

  await sleep(DELAY_BETWEEN_API_CALLS);

  // Strategy 4: Wikipedia title only
  try {
    const url = await strategyWikipediaTitleOnly(title);
    if (url) return { url, strategy: "wiki-title-only" };
  } catch (e) {}

  return null;
}

// ---------------------------------------------------------------------------
// Sequential main loop (NO parallel workers)
// ---------------------------------------------------------------------------
async function main() {
  let ok = 0;
  let fail = 0;
  let skip = 0;
  const failed = [];
  const resolved = [];

  const startTime = Date.now();

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    const dest = path.join(REFS_DIR, entry.name);

    // Skip if already downloaded
    if (RESUME && fs.existsSync(dest)) {
      try {
        const stat = fs.statSync(dest);
        if (stat.size > 1000) {
          skip++;
          if (skip % 25 === 0) {
            process.stdout.write(`  [${i + 1}/${data.length}] skipped ${skip} existing...\n`);
          }
          continue;
        }
      } catch (e) {}
    }

    // Resolve URL
    let result;
    try {
      result = await resolveImageUrl(entry);
    } catch (e) {
      result = null;
    }

    if (!result) {
      fail++;
      failed.push({ name: entry.name, title: entry.title, artist: entry.artist });
      process.stdout.write(
        `  [${i + 1}/${data.length}] FAIL: ${entry.title} (${entry.artist}) - no image found\n`
      );
      await sleep(DELAY_BETWEEN_PAINTINGS);
      continue;
    }

    // Download
    try {
      await downloadFile(result.url, dest);
      ok++;
      resolved.push({ ...entry, resolvedUrl: result.url, strategy: result.strategy });
      process.stdout.write(
        `  [${i + 1}/${data.length}] OK: ${entry.title} [${result.strategy}]\n`
      );
    } catch (e) {
      // Try non-thumbnail fallback
      let rescued = false;
      if (result.url.includes("/thumb/")) {
        try {
          const directUrl = result.url
            .replace("/thumb/", "/")
            .replace(/\/\d+px-[^/]+$/, "");
          await sleep(1000);
          await downloadFile(directUrl, dest);
          ok++;
          resolved.push({ ...entry, resolvedUrl: directUrl, strategy: result.strategy + "-direct" });
          process.stdout.write(
            `  [${i + 1}/${data.length}] OK: ${entry.title} [${result.strategy}-direct]\n`
          );
          rescued = true;
        } catch (e2) {}
      }

      if (!rescued) {
        fail++;
        failed.push({ name: entry.name, title: entry.title, artist: entry.artist });
        process.stdout.write(
          `  [${i + 1}/${data.length}] FAIL: ${entry.title} - download: ${e.message}\n`
        );
      }
    }

    // Progress every 50
    const total = ok + fail + skip;
    if (total % 50 === 0 && total > 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (total / (elapsed || 1)).toFixed(1);
      const eta = (((data.length - total) / rate) / 60).toFixed(0);
      process.stdout.write(
        `  --- Progress: ${total}/${data.length} | ${ok} ok, ${fail} fail, ${skip} skip | ${elapsed}s elapsed, ~${eta}min left ---\n`
      );
    }

    // Polite delay between paintings
    await sleep(DELAY_BETWEEN_PAINTINGS);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results (${elapsed} minutes):`);
  console.log(`  Downloaded: ${ok}`);
  console.log(`  Failed:     ${fail}`);
  console.log(`  Skipped:    ${skip}`);
  console.log(`  Total:      ${ok + fail + skip}`);
  console.log(
    `  Success:    ${(((ok + skip) / (ok + fail + skip)) * 100).toFixed(1)}%`
  );

  if (failed.length > 0 && failed.length <= 100) {
    console.log(`\nFailed paintings:`);
    failed.forEach((f) => console.log(`  - ${f.title} (${f.artist})`));
  } else if (failed.length > 100) {
    console.log(`\n${failed.length} paintings failed (too many to list).`);
  }

  // Save results
  if (resolved.length > 0) {
    const resolvedPath = path.join(path.dirname(dataPath), "art-references-resolved.json");
    const resolvedData = data.map((entry) => {
      const r = resolved.find((x) => x.name === entry.name);
      return r ? { ...entry, url: r.resolvedUrl, strategy: r.strategy } : entry;
    });
    fs.writeFileSync(resolvedPath, JSON.stringify(resolvedData, null, 2));
    console.log(`\nSaved resolved URLs to ${resolvedPath}`);

    const minPath = path.join(path.dirname(dataPath), "art-references-minimal.json");
    const minimal = resolvedData
      .filter((d) => resolved.find((x) => x.name === d.name))
      .map(({ name, url }) => ({ name, url }));
    fs.writeFileSync(minPath, JSON.stringify(minimal, null, 2));
    console.log(`Updated minimal version with ${minimal.length} working entries.`);
  }

  // Count files
  try {
    const files = fs.readdirSync(REFS_DIR).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
    console.log(`\nImage files in ${REFS_DIR}/: ${files.length}`);
  } catch (e) {}
}

main().catch(console.error);
