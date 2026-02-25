#!/usr/bin/env node
// Download reference images from Wikimedia Commons + Wikipedia.
//
// Each entry in referenceUrls can specify:
//   - wikimedia: exact Wikimedia Commons filename (fastest, tried first)
//   - search:    search query to find the painting on Commons/Wikipedia (fallback)
//
// Usage: node download-references.js [refs_dir]
//   TARGET env var selects which target config to use (default: pepe)
//   MAX_REFS env var caps total downloads (default: 2000)
//   VERBOSE=1 for detailed per-request logging

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REFS_DIR = process.argv[2] || "references";
const WIDTH = 1280;
const CONCURRENCY = 4;
const MAX_REFS = parseInt(process.env.MAX_REFS) || 2000;
const VERBOSE = process.env.VERBOSE === "1";
// CATEGORIES_ONLY=1 skips the slow search-based manual list (used at build time)
const CATEGORIES_ONLY = process.env.CATEGORIES_ONLY === "1";
const REQ_TIMEOUT = 20000;   // 20s per HTTP request (thumbs can be slow to generate)
const BATCH_DELAY = 300;     // 300ms between batches to avoid rate limiting
const MAX_RETRIES = 3;       // retry failed API calls up to 3 times

// Load target config
const TARGET = process.env.TARGET || "pepe";
process.env.TARGET = TARGET;
const { loadTarget } = require("./targets");
const target = loadTarget();

const manualRefs = target.referenceUrls || [];
const categories = target.referenceCategories || [];

if (manualRefs.length === 0 && categories.length === 0) {
  console.log("No reference images or categories defined for target:", TARGET);
  process.exit(0);
}

fs.mkdirSync(REFS_DIR, { recursive: true });

// ─── HTTP helpers ───────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const req = proto.get(
      url,
      {
        headers: { "User-Agent": "QQL-Hunter/1.0 (art reference downloader; contact: github.com/monad-droid/QQL)" },
        timeout: REQ_TIMEOUT,
      },
      resolve
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function fetchJson(url) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await httpsGet(url);
      if (res.statusCode === 429 || res.statusCode >= 500) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Bad JSON: " + data.slice(0, 100)));
        }
      });
      res.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

// fetchJson with retry + backoff
async function fetchJsonRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchJson(url);
    } catch (e) {
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        if (VERBOSE) console.log(`    [retry] attempt ${attempt + 1} failed (${e.message}), waiting ${delay}ms...`);
        await sleep(delay);
      } else {
        throw e;
      }
    }
  }
}

function downloadFile(url, dest, redirects = 5) {
  return new Promise(async (resolve, reject) => {
    if (redirects <= 0) return reject(new Error("Too many redirects"));
    try {
      const res = await httpsGet(url);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
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

// ─── Wikimedia URL helpers ──────────────────────────────────────────────────

const API = "https://commons.wikimedia.org/w/api.php";
const WPAPI = "https://en.wikipedia.org/w/api.php";

// Compute Wikimedia Commons thumbnail URL directly from filename.
// Uses the deterministic MD5-based path: /thumb/{a}/{ab}/{name}/{W}px-{name}
// No API call needed — works for ~95% of files.
function computeThumbUrl(filename, width) {
  const name = filename.replace(/ /g, "_");
  const hash = crypto.createHash("md5").update(name).digest("hex");

  let thumbName;
  if (/\.tiff?$/i.test(name)) {
    thumbName = "lossy-page1-" + width + "px-" + name + ".jpg";
  } else if (/\.svg$/i.test(name)) {
    thumbName = width + "px-" + name + ".png";
  } else {
    thumbName = width + "px-" + name;
  }

  return (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/" +
    hash[0] + "/" + hash.slice(0, 2) + "/" +
    encodeURIComponent(name) + "/" +
    encodeURIComponent(thumbName)
  );
}

// Resolve thumb URL via API (used as fallback for manual refs).
async function resolveThumbUrl(filename) {
  const url =
    API +
    "?action=query&titles=File:" +
    encodeURIComponent(filename) +
    "&prop=imageinfo&iiprop=url&iiurlwidth=" +
    WIDTH +
    "&format=json";
  const json = await fetchJsonRetry(url);
  const pages = (json.query && json.query.pages) || {};
  const page = Object.values(pages)[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  return (info && info.thumburl) || (info && info.url) || null;
}

// Search Wikimedia Commons for a painting by title/artist.
async function searchWikimediaFile(query) {
  const url =
    API +
    "?action=query&list=search" +
    "&srnamespace=6" +
    "&srsearch=" + encodeURIComponent(query) +
    "&srlimit=10" +
    "&format=json";
  try {
    const json = await fetchJsonRetry(url);
    const results = (json.query && json.query.search) || [];
    if (VERBOSE) console.log(`    [commons] search "${query}" -> ${results.length} results`);
    for (const r of results) {
      const filename = r.title.replace(/^File:/, "");
      if (/\.(jpg|jpeg|png|tif|tiff|webp)$/i.test(filename)) {
        if (VERBOSE) console.log(`    [commons] matched: ${filename.slice(0, 60)}`);
        return filename;
      }
    }
  } catch (e) {
    if (VERBOSE) console.log(`    [commons] ERROR: ${e.message}`);
  }
  return null;
}

// Search Wikipedia for a painting article, then extract its primary image.
async function searchWikipediaForImage(query) {
  try {
    const searchUrl =
      WPAPI +
      "?action=opensearch" +
      "&search=" + encodeURIComponent(query) +
      "&limit=3&format=json";
    const searchJson = await fetchJsonRetry(searchUrl);
    const titles = (searchJson && searchJson[1]) || [];
    if (VERBOSE) console.log(`    [wp] opensearch "${query}" -> ${titles.length} titles: ${titles.slice(0, 2).join(", ")}`);
    if (titles.length === 0) return null;

    const pageUrl =
      WPAPI +
      "?action=query" +
      "&titles=" + encodeURIComponent(titles[0]) +
      "&prop=pageimages&pithumbsize=" + WIDTH +
      "&format=json";
    const pageJson = await fetchJsonRetry(pageUrl);
    const pages = (pageJson.query && pageJson.query.pages) || {};
    const page = Object.values(pages)[0];
    const imgUrl = page && page.thumbnail && page.thumbnail.source;
    if (VERBOSE) console.log(`    [wp] pageimages "${titles[0]}" -> ${imgUrl ? "OK" : "no image"}`);
    return imgUrl || null;
  } catch (e) {
    if (VERBOSE) console.log(`    [wp] ERROR: ${e.message}`);
  }
  return null;
}

// ─── Category crawl with combined URL resolution ────────────────────────────

// Enumerate subcategories of a category.
async function listSubcategories(categoryName) {
  const subcats = [];
  let cmcontinue = "";

  while (true) {
    let url =
      API +
      "?action=query&list=categorymembers" +
      "&cmtitle=Category:" +
      encodeURIComponent(categoryName) +
      "&cmtype=subcat&cmlimit=500&format=json";
    if (cmcontinue) url += "&cmcontinue=" + encodeURIComponent(cmcontinue);

    const json = await fetchJsonRetry(url);
    const members = (json.query && json.query.categorymembers) || [];

    for (const m of members) {
      subcats.push(m.title.replace(/^Category:/, ""));
    }

    cmcontinue =
      json.continue && json.continue.cmcontinue
        ? json.continue.cmcontinue
        : "";
    if (!cmcontinue || members.length === 0) break;
  }

  return subcats;
}

// Crawl a category using generator=categorymembers + prop=imageinfo.
// Returns [{filename, thumbUrl}] — both file listing AND URL resolution
// in a single API request per 50 files (vs. 1 API call per file before).
async function crawlCategoryWithUrls(categoryName, maxFiles) {
  const results = [];
  let cont = "";

  while (results.length < maxFiles) {
    let url =
      API +
      "?action=query" +
      "&generator=categorymembers" +
      "&gcmtitle=Category:" + encodeURIComponent(categoryName) +
      "&gcmtype=file&gcmlimit=50" +
      "&prop=imageinfo&iiprop=url" +
      "&iiurlwidth=" + WIDTH +
      "&format=json";
    if (cont) url += "&gcmcontinue=" + encodeURIComponent(cont);

    const json = await fetchJsonRetry(url);
    const pages = (json.query && json.query.pages) || {};

    let count = 0;
    for (const [id, page] of Object.entries(pages)) {
      if (parseInt(id) < 0) continue; // missing/invalid page
      const filename = (page.title || "").replace(/^File:/, "");
      if (!/\.(jpg|jpeg|png|webp|tif|tiff)$/i.test(filename)) continue;

      const info = page.imageinfo && page.imageinfo[0];
      const apiUrl = info && (info.thumburl || info.url);
      // Use API-provided URL if available, else compute from MD5 hash
      const thumbUrl = apiUrl || computeThumbUrl(filename, WIDTH);

      results.push({ filename, thumbUrl });
      count++;
    }

    cont = json.continue && json.continue.gcmcontinue
      ? json.continue.gcmcontinue
      : "";
    if (!cont || count === 0) break;

    await sleep(BATCH_DELAY);
  }

  return results.slice(0, maxFiles);
}

// Crawl a category + 1 level of subcategories, returning [{filename, thumbUrl}].
async function crawlCategoryFull(categoryName, maxFiles) {
  console.log(`  Crawling: ${categoryName} ...`);
  const results = await crawlCategoryWithUrls(categoryName, maxFiles);
  console.log(`    -> ${results.length} files with URLs`);

  if (results.length < maxFiles) {
    const subcats = await listSubcategories(categoryName);
    if (subcats.length > 0) {
      const remaining = maxFiles - results.length;
      const perSubcat = Math.max(50, Math.floor(remaining / Math.max(1, subcats.length)));
      const seenFiles = new Set(results.map((r) => r.filename));

      for (const sub of subcats) {
        if (results.length >= maxFiles) break;
        console.log(`  Crawling subcategory: ${sub} ...`);
        const subResults = await crawlCategoryWithUrls(sub, perSubcat);
        console.log(`    -> ${subResults.length} files`);
        for (const r of subResults) {
          if (results.length >= maxFiles) break;
          if (!seenFiles.has(r.filename)) {
            seenFiles.add(r.filename);
            results.push(r);
          }
        }
      }
    }
  }

  return results;
}

// ─── Download logic ─────────────────────────────────────────────────────────

async function downloadOneManual(ref) {
  const dest = path.join(REFS_DIR, ref.name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "exists";

  if (ref.url) {
    try {
      await downloadFile(ref.url, dest);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "ok";
    } catch (_) {}
  }

  // Try exact Wikimedia filename first
  if (ref.wikimedia) {
    try {
      const thumbUrl = await resolveThumbUrl(ref.wikimedia);
      if (thumbUrl) {
        await downloadFile(thumbUrl, dest);
        if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "ok";
      }
    } catch (e) {
      if (VERBOSE) console.log(`    [wikimedia] error ${ref.name}: ${e.message}`);
      try { fs.unlinkSync(dest); } catch (_e) {}
    }
  }

  // Fall back to Wikipedia opensearch + pageimages (most reliable for famous paintings)
  if (ref.search) {
    try {
      const imgUrl = await searchWikipediaForImage(ref.search);
      if (imgUrl) {
        await downloadFile(imgUrl, dest);
        if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "ok";
        if (VERBOSE) console.log(`    [wp] downloaded but too small: ${ref.name}`);
      }
    } catch (e) {
      if (VERBOSE) console.log(`    [wp] download error for ${ref.name}: ${e.message}`);
      try { fs.unlinkSync(dest); } catch (_e) {}
    }
  }

  // Fall back to Commons search-based resolution
  if (ref.search) {
    try {
      const filename = await searchWikimediaFile(ref.search);
      if (filename) {
        const thumbUrl = await resolveThumbUrl(filename);
        if (thumbUrl) {
          await downloadFile(thumbUrl, dest);
          if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "ok";
          if (VERBOSE) console.log(`    [commons] downloaded but too small: ${ref.name}`);
        }
      }
    } catch (e) {
      if (VERBOSE) console.log(`    [commons] download error for ${ref.name}: ${e.message}`);
      try { fs.unlinkSync(dest); } catch (_e) {}
    }
  }

  return "failed";
}

// Download a crawled file using its pre-resolved URL (no API call needed).
async function downloadOneCrawled(entry) {
  const localName = entry.filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
  const dest = path.join(REFS_DIR, localName);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "exists";

  // Primary: use pre-resolved URL (from API or MD5 hash)
  try {
    await downloadFile(entry.thumbUrl, dest);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "ok";
  } catch (e) {
    if (VERBOSE) console.log(`    [dl] ${entry.filename.slice(0, 50)}: ${e.message}`);
    try { fs.unlinkSync(dest); } catch (_e) {}
  }

  // Fallback: compute URL via MD5 hash (in case API URL was wrong)
  try {
    const md5Url = computeThumbUrl(entry.filename, WIDTH);
    if (md5Url !== entry.thumbUrl) {
      await downloadFile(md5Url, dest);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "ok";
    }
  } catch (_) {
    try { fs.unlinkSync(dest); } catch (_e) {}
  }

  return "failed";
}

async function runBatch(items, downloadFn, label, getName) {
  let ok = 0, exists = 0, fail = 0;

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (item) => {
      const r = await downloadFn(item);
      if (getName) {
        const tag = r === "ok" ? "OK" : r === "exists" ? "SKIP" : "FAIL";
        console.log(`  [${tag}] ${getName(item)}`);
      }
      return r;
    }));
    for (const r of results) {
      if (r === "ok") ok++;
      else if (r === "exists") exists++;
      else fail++;
    }
    // Progress summary
    const done = Math.min(i + CONCURRENCY, items.length);
    if (!getName && (done % 20 === 0 || done === items.length)) {
      process.stdout.write(
        `\r  ${label}: ${done}/${items.length} (${ok} new, ${exists} cached, ${fail} failed)`
      );
    }
    // Throttle between batches to avoid rate limiting
    if (i + CONCURRENCY < items.length) {
      await sleep(BATCH_DELAY);
    }
  }

  if (!getName) process.stdout.write("\n");
  return { ok, exists, fail };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`>>> Reference image downloader for target: ${TARGET}`);
  console.log(`>>> Max references: ${MAX_REFS}`);
  console.log(`>>> Destination: ${REFS_DIR}/`);
  console.log(`>>> Concurrency: ${CONCURRENCY}, batch delay: ${BATCH_DELAY}ms, timeout: ${REQ_TIMEOUT}ms`);
  console.log("");

  let totalOk = 0, totalExists = 0, totalFail = 0;

  // Phase 1: Crawl Wikimedia Commons categories with combined URL resolution.
  // Uses generator=categorymembers + prop=imageinfo to get filenames AND
  // thumbnail URLs in the same API call (50 per request vs. 1 per file before).
  if (categories.length > 0) {
    const existingCount = fs
      .readdirSync(REFS_DIR)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).length;
    const remaining = MAX_REFS - existingCount;

    if (remaining > 0) {
      console.log(
        `>>> Phase 1: Crawling ${categories.length} Wikimedia categories (up to ${remaining} images)...`
      );
      console.log(`    Using combined crawl+resolve (50 files/request instead of 1 file/request)`);
      console.log("");

      const allEntries = []; // [{filename, thumbUrl}]
      const seenFiles = new Set();
      const perCategory = Math.ceil(remaining / categories.length);

      for (const cat of categories) {
        if (allEntries.length >= remaining) break;
        try {
          const entries = await crawlCategoryFull(cat, perCategory);
          for (const e of entries) {
            if (allEntries.length >= remaining) break;
            if (!seenFiles.has(e.filename)) {
              seenFiles.add(e.filename);
              allEntries.push(e);
            }
          }
        } catch (e) {
          console.log(`  Error crawling ${cat}: ${e.message}`);
        }
      }

      console.log(`  Found ${allEntries.length} unique files with pre-resolved URLs`);
      console.log("");

      if (allEntries.length > 0) {
        const r = await runBatch(allEntries, downloadOneCrawled, "Category");
        totalOk += r.ok;
        totalExists += r.exists;
        totalFail += r.fail;
        console.log(
          `  Categories: ${r.ok} downloaded, ${r.exists} cached, ${r.fail} failed`
        );
        console.log("");
      }
    }
  }

  // Phase 2: Download curated reference list (search-based, slower)
  // Skipped when CATEGORIES_ONLY=1 (e.g. during Docker build)
  if (!CATEGORIES_ONLY && manualRefs.length > 0) {
    console.log(`>>> Phase 2: Downloading ${manualRefs.length} curated references...`);
    const r = await runBatch(manualRefs, downloadOneManual, "Manual", (ref) => ref.name);
    totalOk += r.ok;
    totalExists += r.exists;
    totalFail += r.fail;
    console.log(
      `  Manual: ${r.ok} downloaded, ${r.exists} cached, ${r.fail} failed`
    );
    console.log("");
  }

  // Summary
  const finalFiles = fs
    .readdirSync(REFS_DIR)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  console.log("═══════════════════════════════════════════════");
  console.log(
    `  Total: ${totalOk} downloaded, ${totalExists} cached, ${totalFail} failed`
  );
  console.log(`  ${finalFiles.length} reference images available in ${REFS_DIR}/`);
  console.log("═══════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("Download error:", e.message);
  process.exit(0); // non-fatal
});
