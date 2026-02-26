#!/usr/bin/env node
// =============================================================================
// Smart Art Reference Downloader
//
// Uses Wikipedia and Wikimedia Commons APIs to find the correct image URL
// for each painting, then downloads it. Much more reliable than guessing
// Wikimedia Commons filenames.
//
// Runs standalone with no dependencies beyond Node.js built-ins.
//
// Usage:
//   node scripts/download-with-api.js [output-dir]
//   node scripts/download-with-api.js references
//   PARALLEL=8 node scripts/download-with-api.js references
//   node scripts/download-with-api.js references --resume   # skip existing
//   node scripts/download-with-api.js references --dry-run  # just resolve URLs
// =============================================================================

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const REFS_DIR = process.argv[2] || "references";
const CONCURRENCY = parseInt(process.env.PARALLEL || "5", 10);
const RESUME = process.argv.includes("--resume");
const DRY_RUN = process.argv.includes("--dry-run");
const IMAGE_WIDTH = 800;
const REQUEST_TIMEOUT = 20000;

// Rate limiting: small delay between API calls to be polite
const API_DELAY_MS = 100;

// ---------------------------------------------------------------------------
// Load painting data
// ---------------------------------------------------------------------------
let dataPath = path.join(__dirname, "..", "data", "art-references.json");
if (!fs.existsSync(dataPath)) {
  // Fallback: try current directory
  dataPath = path.join(process.cwd(), "data", "art-references.json");
}
if (!fs.existsSync(dataPath)) {
  console.error("ERROR: Cannot find data/art-references.json");
  console.error("Run 'node scripts/build-art-references.js' first.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
if (!fs.existsSync(REFS_DIR)) fs.mkdirSync(REFS_DIR, { recursive: true });

console.log(`Art Reference Downloader`);
console.log(`  Paintings: ${data.length}`);
console.log(`  Output:    ${path.resolve(REFS_DIR)}`);
console.log(`  Workers:   ${CONCURRENCY}`);
console.log(`  Resume:    ${RESUME}`);
console.log(`  Dry run:   ${DRY_RUN}`);
console.log(``);

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url, retries = 2) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent": "QQLArtHunter/1.0 (art reference downloader)",
          Accept: "application/json",
        },
        timeout: REQUEST_TIMEOUT,
      },
      (res) => {
        // Follow redirects
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          fetchJson(res.headers.location, retries).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        });
      }
    );
    req.on("error", (e) => {
      if (retries > 0) {
        sleep(1000).then(() => fetchJson(url, retries - 1).then(resolve, reject));
      } else {
        reject(e);
      }
    });
    req.on("timeout", () => {
      req.destroy();
      if (retries > 0) {
        sleep(1000).then(() => fetchJson(url, retries - 1).then(resolve, reject));
      } else {
        reject(new Error("timeout"));
      }
    });
  });
}

function downloadFile(url, dest, retries = 2) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent": "QQLArtHunter/1.0 (art reference downloader)",
        },
        timeout: 30000,
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          downloadFile(res.headers.location, dest, retries).then(
            resolve,
            reject
          );
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const ws = fs.createWriteStream(dest);
        res.pipe(ws);
        ws.on("finish", () => {
          // Verify file has content
          const stat = fs.statSync(dest);
          if (stat.size < 1000) {
            fs.unlinkSync(dest);
            reject(new Error("File too small (likely error page)"));
          } else {
            resolve(true);
          }
        });
        ws.on("error", reject);
      }
    );
    req.on("error", (e) => {
      if (retries > 0) {
        sleep(2000).then(() =>
          downloadFile(url, dest, retries - 1).then(resolve, reject)
        );
      } else {
        reject(e);
      }
    });
    req.on("timeout", () => {
      req.destroy();
      if (retries > 0) {
        sleep(2000).then(() =>
          downloadFile(url, dest, retries - 1).then(resolve, reject)
        );
      } else {
        reject(new Error("timeout"));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Wikipedia API strategies to find painting images
// ---------------------------------------------------------------------------

/**
 * Strategy 1: Search Wikipedia for the painting article, get its main image.
 * This is the most reliable for famous paintings.
 */
async function strategyWikipediaPageImage(title, artist) {
  // Search for the painting article
  const searchTerm = `${title} ${artist} painting`;
  const searchUrl =
    `https://en.wikipedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(searchTerm)}` +
    `&srlimit=5&format=json`;

  const searchResult = await fetchJson(searchUrl);
  const pages = searchResult?.query?.search || [];

  for (const page of pages) {
    await sleep(API_DELAY_MS);

    // Get the page's main image as a thumbnail
    const pageTitle = encodeURIComponent(page.title);
    const imageUrl =
      `https://en.wikipedia.org/w/api.php?action=query` +
      `&titles=${pageTitle}` +
      `&prop=pageimages&piprop=original|thumbnail&pithumbsize=${IMAGE_WIDTH}` +
      `&format=json`;

    const imageResult = await fetchJson(imageUrl);
    const pageData = Object.values(imageResult?.query?.pages || {})[0];

    // Prefer thumbnail at our desired width, fall back to original
    if (pageData?.thumbnail?.source) {
      return pageData.thumbnail.source;
    }
    if (pageData?.original?.source) {
      return pageData.original.source;
    }
  }
  return null;
}

/**
 * Strategy 2: Search Wikimedia Commons directly for the painting.
 * Gets the image info with a thumbnail URL.
 */
async function strategyCommonsSearch(title, artist) {
  const searchTerm = `${title} ${artist}`;
  const searchUrl =
    `https://commons.wikimedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(searchTerm)}` +
    `&srnamespace=6&srlimit=3&format=json`;

  const searchResult = await fetchJson(searchUrl);
  const files = searchResult?.query?.search || [];

  for (const file of files) {
    await sleep(API_DELAY_MS);

    const fileTitle = encodeURIComponent(file.title);
    const infoUrl =
      `https://commons.wikimedia.org/w/api.php?action=query` +
      `&titles=${fileTitle}` +
      `&prop=imageinfo&iiprop=url|size|mime` +
      `&iiurlwidth=${IMAGE_WIDTH}` +
      `&format=json`;

    const infoResult = await fetchJson(infoUrl);
    const pageData = Object.values(infoResult?.query?.pages || {})[0];
    const info = pageData?.imageinfo?.[0];

    if (info) {
      // Check it's actually an image
      if (info.mime && info.mime.startsWith("image/")) {
        return info.thumburl || info.url;
      }
    }
  }
  return null;
}

/**
 * Strategy 3: Try the original Special:FilePath URL from our data.
 * Some of these work, so try them as a fallback.
 */
async function strategyOriginalUrl(originalUrl) {
  return new Promise((resolve) => {
    const mod = originalUrl.startsWith("https") ? https : http;
    const req = mod.request(
      originalUrl,
      {
        method: "HEAD",
        timeout: 10000,
        headers: {
          "User-Agent": "QQLArtHunter/1.0",
        },
      },
      (res) => {
        // Follow redirect and check final status
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          // The redirect target is the actual image URL
          resolve(res.headers.location);
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(originalUrl);
        } else {
          resolve(null);
        }
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * Strategy 4: Search Wikipedia with just the title (no artist).
 * Some paintings are known by title alone.
 */
async function strategyWikipediaTitleOnly(title) {
  const searchUrl =
    `https://en.wikipedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(title + " painting")}` +
    `&srlimit=3&format=json`;

  const searchResult = await fetchJson(searchUrl);
  const pages = searchResult?.query?.search || [];

  for (const page of pages) {
    await sleep(API_DELAY_MS);
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

// ---------------------------------------------------------------------------
// Main resolver: tries all strategies in order
// ---------------------------------------------------------------------------
async function resolveImageUrl(entry) {
  const { title, artist, url: originalUrl } = entry;

  // Strategy 1: Wikipedia page image (title + artist)
  try {
    const url = await strategyWikipediaPageImage(title, artist);
    if (url) return { url, strategy: "wikipedia" };
  } catch (e) {}

  await sleep(API_DELAY_MS);

  // Strategy 2: Commons search
  try {
    const url = await strategyCommonsSearch(title, artist);
    if (url) return { url, strategy: "commons" };
  } catch (e) {}

  await sleep(API_DELAY_MS);

  // Strategy 3: Original Special:FilePath URL
  try {
    const url = await strategyOriginalUrl(originalUrl);
    if (url) return { url, strategy: "original" };
  } catch (e) {}

  await sleep(API_DELAY_MS);

  // Strategy 4: Wikipedia title only
  try {
    const url = await strategyWikipediaTitleOnly(title);
    if (url) return { url, strategy: "wiki-title-only" };
  } catch (e) {}

  return null;
}

// ---------------------------------------------------------------------------
// Worker and main
// ---------------------------------------------------------------------------
let idx = 0;
let ok = 0;
let fail = 0;
let skip = 0;
const failed = [];
const resolved = []; // Track resolved URLs for updating data

async function worker(workerId) {
  while (idx < data.length) {
    const i = idx++;
    const entry = data[i];
    const dest = path.join(REFS_DIR, entry.name);

    // Skip if file exists and --resume
    if (RESUME && fs.existsSync(dest)) {
      const stat = fs.statSync(dest);
      if (stat.size > 1000) {
        skip++;
        continue;
      }
    }

    // Resolve the image URL
    let result;
    try {
      result = await resolveImageUrl(entry);
    } catch (e) {
      result = null;
    }

    if (!result) {
      fail++;
      failed.push(entry.name);
      process.stdout.write(
        `  [${ok + fail + skip}/${data.length}] FAIL: ${entry.title} (${entry.artist}) - no image found\n`
      );
      continue;
    }

    if (DRY_RUN) {
      ok++;
      resolved.push({ ...entry, resolvedUrl: result.url, strategy: result.strategy });
      process.stdout.write(
        `  [${ok + fail + skip}/${data.length}] OK: ${entry.title} [${result.strategy}]\n`
      );
      continue;
    }

    // Download the image
    try {
      await downloadFile(result.url, dest);
      ok++;
      resolved.push({ ...entry, resolvedUrl: result.url, strategy: result.strategy });
      if (ok % 10 === 0 || ok <= 5) {
        process.stdout.write(
          `  [${ok + fail + skip}/${data.length}] OK: ${entry.title} [${result.strategy}]\n`
        );
      }
    } catch (e) {
      // If download fails, try the resolved URL directly without thumbnail
      try {
        if (result.url.includes("/thumb/")) {
          // Try the non-thumbnail version
          const directUrl = result.url
            .replace("/thumb/", "/")
            .replace(/\/\d+px-[^/]+$/, "");
          await downloadFile(directUrl, dest);
          ok++;
          resolved.push({ ...entry, resolvedUrl: directUrl, strategy: result.strategy + "-direct" });
          if (ok % 10 === 0) {
            process.stdout.write(
              `  [${ok + fail + skip}/${data.length}] OK: ${entry.title} [${result.strategy}-direct]\n`
            );
          }
          continue;
        }
      } catch (e2) {}

      fail++;
      failed.push(entry.name);
      process.stdout.write(
        `  [${ok + fail + skip}/${data.length}] FAIL: ${entry.title} - download error: ${e.message}\n`
      );
    }

    // Progress report every 50
    if ((ok + fail + skip) % 50 === 0) {
      process.stdout.write(
        `  --- Progress: ${ok + fail + skip}/${data.length} (${ok} ok, ${fail} fail, ${skip} skip) ---\n`
      );
    }
  }
}

async function main() {
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker(i));
  }
  await Promise.all(workers);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results:`);
  console.log(`  Downloaded: ${ok}`);
  console.log(`  Failed:     ${fail}`);
  console.log(`  Skipped:    ${skip}`);
  console.log(`  Total:      ${ok + fail + skip}`);
  console.log(
    `  Success:    ${(((ok + skip) / (ok + fail + skip)) * 100).toFixed(1)}%`
  );

  if (failed.length > 0 && failed.length <= 50) {
    console.log(`\nFailed paintings:`);
    failed.forEach((f) => console.log(`  - ${f}`));
  } else if (failed.length > 50) {
    console.log(`\n${failed.length} paintings failed (too many to list).`);
  }

  // Save resolved URLs to a file for reference
  if (resolved.length > 0) {
    const resolvedPath = path.join(
      path.dirname(dataPath),
      "art-references-resolved.json"
    );
    const resolvedData = data.map((entry) => {
      const r = resolved.find((x) => x.name === entry.name);
      if (r) {
        return { ...entry, url: r.resolvedUrl, strategy: r.strategy };
      }
      return entry;
    });
    fs.writeFileSync(resolvedPath, JSON.stringify(resolvedData, null, 2));
    console.log(`\nSaved resolved URLs to ${resolvedPath}`);

    // Update the minimal version too
    const minPath = path.join(
      path.dirname(dataPath),
      "art-references-minimal.json"
    );
    const minimal = resolvedData
      .filter((d) => {
        const r = resolved.find((x) => x.name === d.name);
        return r != null;
      })
      .map(({ name, url }) => ({ name, url }));
    fs.writeFileSync(minPath, JSON.stringify(minimal, null, 2));
    console.log(`Updated minimal version with ${minimal.length} working entries.`);
  }

  // Count actual files in output dir
  try {
    const files = fs.readdirSync(REFS_DIR).filter((f) =>
      /\.(jpg|jpeg|png|webp)$/i.test(f)
    );
    console.log(`\nImage files in ${REFS_DIR}/: ${files.length}`);
  } catch (e) {}
}

main().catch(console.error);
