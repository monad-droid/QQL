#!/usr/bin/env node
// Download reference images from Wikimedia Commons.
//
// Each entry in referenceUrls can specify:
//   - wikimedia: exact Wikimedia Commons filename (fastest, tried first)
//   - search:    search query to find the painting on Commons (fallback)
//
// Usage: node download-references.js [refs_dir]
//   TARGET env var selects which target config to use (default: pepe)
//   MAX_REFS env var caps total downloads (default: 2000)

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const REFS_DIR = process.argv[2] || "references";
const WIDTH = 1280;
const CONCURRENCY = 6;
const MAX_REFS = parseInt(process.env.MAX_REFS) || 2000;

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

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto
      .get(url, { headers: { "User-Agent": "QQL-Hunter/1.0 (art project)" } }, resolve)
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
          reject(new Error("Bad JSON"));
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

// ─── Wikimedia API helpers ──────────────────────────────────────────────────

const API = "https://commons.wikimedia.org/w/api.php";

async function resolveThumbUrl(filename) {
  const url =
    API +
    "?action=query&titles=File:" +
    encodeURIComponent(filename) +
    "&prop=imageinfo&iiprop=url&iiurlwidth=" +
    WIDTH +
    "&format=json";
  const json = await fetchJson(url);
  const pages = (json.query && json.query.pages) || {};
  const page = Object.values(pages)[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  return (info && info.thumburl) || (info && info.url) || null;
}

// Search Wikimedia Commons for a painting by title/artist.
// Returns the best matching filename or null.
async function searchWikimediaFile(query) {
  const url =
    API +
    "?action=query&list=search" +
    "&srnamespace=6" + // File: namespace only
    "&srsearch=" + encodeURIComponent(query) +
    "&srlimit=10" +
    "&format=json";
  try {
    const json = await fetchJson(url);
    const results = (json.query && json.query.search) || [];
    for (const r of results) {
      // r.title is like "File:Mona_Lisa.jpg"
      const filename = r.title.replace(/^File:/, "");
      if (/\.(jpg|jpeg|png|tif|tiff|webp)$/i.test(filename)) {
        return filename;
      }
    }
  } catch (_) {}
  return null;
}

const WPAPI = "https://en.wikipedia.org/w/api.php";

// Search Wikipedia for a painting article, then extract its primary image.
// This is more reliable than Commons search for famous paintings because
// Wikipedia articles almost always have the correct painting as infobox image.
async function searchWikipediaForImage(query) {
  try {
    // Step 1: opensearch to find the Wikipedia article title
    const searchUrl =
      WPAPI +
      "?action=opensearch" +
      "&search=" + encodeURIComponent(query) +
      "&limit=3&format=json";
    const searchJson = await fetchJson(searchUrl);
    // opensearch returns [query, [titles], [descriptions], [urls]]
    const titles = (searchJson && searchJson[1]) || [];
    if (titles.length === 0) return null;

    // Step 2: get pageimages thumbnail for the best match (capped at WIDTH)
    const pageUrl =
      WPAPI +
      "?action=query" +
      "&titles=" + encodeURIComponent(titles[0]) +
      "&prop=pageimages&pithumbsize=" + WIDTH +
      "&format=json";
    const pageJson = await fetchJson(pageUrl);
    const pages = (pageJson.query && pageJson.query.pages) || {};
    const page = Object.values(pages)[0];
    const imgUrl = page && page.thumbnail && page.thumbnail.source;
    return imgUrl || null;
  } catch (_) {}
  return null;
}

// Enumerate all files in a Wikimedia Commons category (handles pagination).
async function listCategoryFiles(categoryName, maxFiles) {
  const files = [];
  let cmcontinue = "";

  while (files.length < maxFiles) {
    const batch = Math.min(500, maxFiles - files.length);
    let url =
      API +
      "?action=query&list=categorymembers" +
      "&cmtitle=Category:" +
      encodeURIComponent(categoryName) +
      "&cmtype=file&cmlimit=" +
      batch +
      "&format=json";
    if (cmcontinue) url += "&cmcontinue=" + encodeURIComponent(cmcontinue);

    const json = await fetchJson(url);
    const members = (json.query && json.query.categorymembers) || [];

    for (const m of members) {
      // m.title is like "File:Mona_Lisa.jpg"
      const filename = m.title.replace(/^File:/, "");
      // Only include image files
      if (/\.(jpg|jpeg|png|webp|tif|tiff)$/i.test(filename)) {
        files.push(filename);
      }
    }

    cmcontinue =
      json.continue && json.continue.cmcontinue
        ? json.continue.cmcontinue
        : "";
    if (!cmcontinue || members.length === 0) break;
  }

  return files;
}

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

    const json = await fetchJson(url);
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

// Crawl a category + optional 1 level of subcategories.
async function crawlCategory(categoryName, maxFiles, recurse = true) {
  console.log(`  Crawling: ${categoryName} ...`);
  const files = await listCategoryFiles(categoryName, maxFiles);
  console.log(`    -> ${files.length} files`);

  if (recurse && files.length < maxFiles) {
    const subcats = await listSubcategories(categoryName);
    const remaining = maxFiles - files.length;
    const perSubcat = Math.max(50, Math.floor(remaining / Math.max(1, subcats.length)));

    for (const sub of subcats) {
      if (files.length >= maxFiles) break;
      console.log(`  Crawling subcategory: ${sub} ...`);
      const subFiles = await listCategoryFiles(sub, perSubcat);
      console.log(`    -> ${subFiles.length} files`);
      for (const f of subFiles) {
        if (files.length >= maxFiles) break;
        if (!files.includes(f)) files.push(f);
      }
    }
  }

  return files;
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
    } catch (_) {
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
      }
    } catch (_) {
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
        }
      }
    } catch (_) {
      try { fs.unlinkSync(dest); } catch (_e) {}
    }
  }

  return "failed";
}

async function downloadOneCrawled(filename) {
  // Use a sanitized version of the filename as local name
  const localName = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
  const dest = path.join(REFS_DIR, localName);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "exists";

  try {
    const thumbUrl = await resolveThumbUrl(filename);
    if (!thumbUrl) return "not_found";
    await downloadFile(thumbUrl, dest);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return "ok";
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
      // Per-item logging for manual refs
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
    // Progress summary every 50
    const done = Math.min(i + CONCURRENCY, items.length);
    if (!getName && (done % 50 === 0 || done === items.length)) {
      process.stdout.write(
        `  ${label}: ${done}/${items.length} (${ok} new, ${exists} cached, ${fail} failed)\r`
      );
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
  console.log("");

  let totalOk = 0, totalExists = 0, totalFail = 0;

  // Phase 1: Download manual reference list (guaranteed baseline)
  if (manualRefs.length > 0) {
    console.log(`>>> Phase 1: Downloading ${manualRefs.length} curated references...`);
    const r = await runBatch(manualRefs, downloadOneManual, "Manual", (ref) => ref.name);
    totalOk += r.ok;
    totalExists += r.exists;
    totalFail += r.fail;
    console.log(
      `  Manual: ${r.ok} downloaded, ${r.exists} cached, ${r.fail} failed`
    );
    console.log("");
  }

  // Phase 2: Crawl Wikimedia Commons categories for bulk references
  if (categories.length > 0) {
    const existingCount = fs
      .readdirSync(REFS_DIR)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).length;
    const remaining = MAX_REFS - existingCount;

    if (remaining > 0) {
      console.log(
        `>>> Phase 2: Crawling ${categories.length} Wikimedia categories (up to ${remaining} more)...`
      );

      // Collect all filenames from all categories, deduplicating
      const allFiles = new Set();
      const perCategory = Math.ceil(remaining / categories.length);

      for (const cat of categories) {
        if (allFiles.size >= remaining) break;
        try {
          const files = await crawlCategory(cat, perCategory, true);
          for (const f of files) {
            if (allFiles.size >= remaining) break;
            allFiles.add(f);
          }
        } catch (e) {
          console.log(`  Error crawling ${cat}: ${e.message}`);
        }
      }

      console.log(`  Found ${allFiles.size} unique files across all categories`);
      console.log("");

      if (allFiles.size > 0) {
        const fileList = [...allFiles];
        const r = await runBatch(fileList, downloadOneCrawled, "Category");
        totalOk += r.ok;
        totalExists += r.exists;
        totalFail += r.fail;
        console.log(
          `  Categories: ${r.ok} downloaded, ${r.exists} cached, ${r.fail} failed`
        );
      }
    } else {
      console.log(
        `>>> Phase 2: Skipped — already have ${existingCount} references (max: ${MAX_REFS})`
      );
    }
  }

  // Summary
  const finalFiles = fs
    .readdirSync(REFS_DIR)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  console.log("");
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
