#!/usr/bin/env node
// Quick diagnostic: test each download strategy for a few known paintings.
// Run inside Docker: docker compose exec hunter node test-download-apis.js

const https = require("https");
const http = require("http");

const WIDTH = 1280;
const API = "https://commons.wikimedia.org/w/api.php";
const WPAPI = "https://en.wikipedia.org/w/api.php";

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const req = proto
      .get(url, { headers: { "User-Agent": "QQL-Hunter/1.0 (art project)" }, timeout: 15000 }, resolve)
      .on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function fetchJson(url) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await httpsGet(url);
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Bad JSON: " + data.slice(0, 200))); }
      });
      res.on("error", reject);
    } catch (e) { reject(e); }
  });
}

const tests = [
  { name: "starry-night.jpg", wikimedia: "Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg", search: "Starry Night Van Gogh" },
  { name: "mona-lisa.jpg", search: "Mona Lisa Leonardo da Vinci" },
  { name: "girl-with-a-pearl-earring.jpg", search: "Girl Pearl Earring Vermeer" },
  { name: "the-scream.jpg", search: "Scream Edvard Munch" },
  { name: "liberty-leading-people.jpg", search: "Liberty Leading People Delacroix" },
];

async function testResolveThumbUrl(filename) {
  const url = API + "?action=query&titles=File:" + encodeURIComponent(filename) +
    "&prop=imageinfo&iiprop=url&iiurlwidth=" + WIDTH + "&format=json";
  console.log("    URL:", url.slice(0, 120) + "...");
  const json = await fetchJson(url);
  const pages = (json.query && json.query.pages) || {};
  const page = Object.values(pages)[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  return (info && info.thumburl) || (info && info.url) || null;
}

async function testCommonsSearch(query) {
  const url = API + "?action=query&list=search&srnamespace=6&srsearch=" +
    encodeURIComponent(query) + "&srlimit=5&format=json";
  console.log("    URL:", url.slice(0, 120) + "...");
  const json = await fetchJson(url);
  const results = (json.query && json.query.search) || [];
  console.log("    Results:", results.length, "matches");
  for (const r of results.slice(0, 3)) {
    console.log("      -", r.title);
  }
  for (const r of results) {
    const filename = r.title.replace(/^File:/, "");
    if (/\.(jpg|jpeg|png|tif|tiff|webp)$/i.test(filename)) return filename;
  }
  return null;
}

async function testWikipediaSearch(query) {
  // Step 1: opensearch
  const searchUrl = WPAPI + "?action=opensearch&search=" +
    encodeURIComponent(query) + "&limit=3&format=json";
  console.log("    Search URL:", searchUrl.slice(0, 120) + "...");
  const searchJson = await fetchJson(searchUrl);
  const titles = (searchJson && searchJson[1]) || [];
  console.log("    Opensearch titles:", titles);
  if (titles.length === 0) return null;

  // Step 2: pageimages
  const pageUrl = WPAPI + "?action=query&titles=" +
    encodeURIComponent(titles[0]) + "&prop=pageimages&pithumbsize=" + WIDTH + "&format=json";
  console.log("    Pageimages URL:", pageUrl.slice(0, 120) + "...");
  const pageJson = await fetchJson(pageUrl);
  const pages = (pageJson.query && pageJson.query.pages) || {};
  const page = Object.values(pages)[0];
  console.log("    Page keys:", page ? Object.keys(page) : "none");
  const imgUrl = page && page.thumbnail && page.thumbnail.source;
  console.log("    Image URL:", imgUrl ? imgUrl.slice(0, 80) + "..." : "null");
  return imgUrl || null;
}

async function main() {
  console.log("=== Download API Diagnostic ===\n");

  // Test basic connectivity
  console.log("1. Testing HTTPS to commons.wikimedia.org ...");
  try {
    const res = await httpsGet(API + "?action=query&meta=siteinfo&format=json");
    let data = "";
    res.on("data", c => data += c);
    await new Promise(r => res.on("end", r));
    const j = JSON.parse(data);
    console.log("   OK - sitename:", j.query && j.query.general && j.query.general.sitename);
  } catch (e) {
    console.log("   FAILED:", e.message);
  }

  console.log("\n2. Testing HTTPS to en.wikipedia.org ...");
  try {
    const res = await httpsGet(WPAPI + "?action=query&meta=siteinfo&format=json");
    let data = "";
    res.on("data", c => data += c);
    await new Promise(r => res.on("end", r));
    const j = JSON.parse(data);
    console.log("   OK - sitename:", j.query && j.query.general && j.query.general.sitename);
  } catch (e) {
    console.log("   FAILED:", e.message);
  }

  for (const t of tests) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing: ${t.name} (search: "${t.search}")`);
    console.log("=".repeat(60));

    // Test A: Exact wikimedia filename
    if (t.wikimedia) {
      console.log("\n  [A] Exact Wikimedia filename:", t.wikimedia);
      try {
        const thumbUrl = await testResolveThumbUrl(t.wikimedia);
        console.log("    Result:", thumbUrl ? "OK - " + thumbUrl.slice(0, 80) + "..." : "FAILED - no thumb URL");
      } catch (e) {
        console.log("    ERROR:", e.message);
      }
    }

    // Test B: Wikipedia opensearch + pageimages
    console.log("\n  [B] Wikipedia opensearch + pageimages:");
    try {
      const imgUrl = await testWikipediaSearch(t.search);
      console.log("    Result:", imgUrl ? "OK" : "FAILED - no image URL");
    } catch (e) {
      console.log("    ERROR:", e.message);
    }

    // Test C: Commons search
    console.log("\n  [C] Commons search (without ' painting'):");
    try {
      const filename = await testCommonsSearch(t.search);
      console.log("    Best filename:", filename || "none found");
      if (filename) {
        const thumbUrl = await testResolveThumbUrl(filename);
        console.log("    Thumb URL:", thumbUrl ? "OK" : "FAILED");
      }
    } catch (e) {
      console.log("    ERROR:", e.message);
    }
  }

  console.log("\n=== Done ===");
}

main().catch(e => console.error("Fatal:", e));
