#!/usr/bin/env node
// =============================================================================
// HOF Browser — Local web UI for browsing Hall of Fame results
//
// Shows all references ranked by best similarity score. Click any reference
// to see its top QQL matches displayed side-by-side with the original painting.
//
// Usage: node hof-server.js [--port 3000]
//
// Zero dependencies — uses only Node.js built-ins.
// =============================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const HOF_DIR = "hall-of-fame";
const REFS_DIR = "references";
const ART_REF_FILE = "data/art-references.json";

const PORT = (() => {
  const i = process.argv.indexOf("--port");
  return i !== -1 && process.argv[i + 1] ? parseInt(process.argv[i + 1]) : 3000;
})();

// --- Data helpers ---

function refToDirName(refName) {
  return refName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function loadArtRefs() {
  try {
    const refs = JSON.parse(fs.readFileSync(ART_REF_FILE, "utf8"));
    const map = {};
    for (const ref of refs) {
      map[refToDirName(ref.name)] = ref;
    }
    return map;
  } catch (e) {
    return {};
  }
}

function getRefEntries(refDir) {
  if (!fs.existsSync(refDir)) return [];
  return fs
    .readdirSync(refDir)
    .filter((f) => f.endsWith(".png") && f.startsWith("sim-"))
    .map((f) => {
      const sim = parseFloat(f.split("-")[1]);
      return { file: f, sim: isNaN(sim) ? 0 : sim };
    })
    .sort((a, b) => b.sim - a.sim);
}

function getAllRefs() {
  if (!fs.existsSync(HOF_DIR)) return [];
  const artRefs = loadArtRefs();
  const dirs = fs
    .readdirSync(HOF_DIR)
    .filter((d) => fs.statSync(path.join(HOF_DIR, d)).isDirectory());

  const rows = [];
  for (const dir of dirs) {
    const entries = getRefEntries(path.join(HOF_DIR, dir));
    if (entries.length === 0) continue;
    const ref = artRefs[dir];
    rows.push({
      dir,
      count: entries.length,
      best: entries[0].sim,
      floor: entries[entries.length - 1].sim,
      title: ref ? ref.title : dir.replace(/_/g, " "),
      artist: ref ? ref.artist : "",
      year: ref ? ref.year : "",
      refUrl: ref ? ref.url : "",
      refName: ref ? ref.name : "",
    });
  }
  rows.sort((a, b) => b.best - a.best);
  return rows;
}

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(path.join(HOF_DIR, "_stats.json"), "utf8"));
  } catch (e) {
    return {};
  }
}

// --- HTML templates ---

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function scoreBar(score, max) {
  const pct = Math.min(100, (score / (max || 0.5)) * 100);
  return `<div class="score-bar"><div class="score-fill" style="width:${pct.toFixed(1)}%"></div></div>`;
}

function pageHead(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; }
  a { color: #7eb8ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
  header { padding: 20px 0; border-bottom: 1px solid #222; margin-bottom: 24px; }
  header h1 { font-size: 24px; font-weight: 600; }
  header .subtitle { color: #888; font-size: 14px; margin-top: 4px; }
  .stats-bar { display: flex; gap: 24px; padding: 12px 16px; background: #141414; border-radius: 8px; margin-bottom: 24px; font-size: 14px; }
  .stats-bar .stat { color: #888; }
  .stats-bar .stat b { color: #e0e0e0; }

  /* --- Index table --- */
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 1px solid #222; }
  th.num { text-align: right; }
  td { padding: 10px 12px; border-bottom: 1px solid #181818; font-size: 14px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.ref-row { cursor: pointer; transition: background 0.15s; }
  tr.ref-row:hover { background: #1a1a2a; }
  .rank { color: #666; font-weight: 600; }
  .score { color: #4fc3f7; font-weight: 600; font-family: monospace; font-size: 15px; }
  .floor { color: #666; font-family: monospace; }
  .count { color: #aaa; }
  .artist { color: #999; }
  .year { color: #555; font-size: 13px; }
  .score-bar { width: 80px; height: 6px; background: #1a1a1a; border-radius: 3px; display: inline-block; vertical-align: middle; margin-left: 8px; }
  .score-fill { height: 100%; background: linear-gradient(90deg, #1a5276, #4fc3f7); border-radius: 3px; }

  /* --- Detail page --- */
  .back { display: inline-block; margin-bottom: 16px; font-size: 14px; }
  .ref-header { display: flex; gap: 20px; align-items: center; margin-bottom: 24px; padding: 16px; background: #141414; border-radius: 8px; }
  .ref-header img { width: 120px; height: 120px; object-fit: cover; border-radius: 6px; border: 1px solid #333; }
  .ref-header .info h2 { font-size: 20px; margin-bottom: 4px; }
  .ref-header .info .meta { color: #888; font-size: 14px; }
  .entries-grid { display: flex; flex-direction: column; gap: 20px; }
  .entry-card { background: #141414; border-radius: 8px; overflow: hidden; border: 1px solid #222; transition: border-color 0.15s; }
  .entry-card:hover { border-color: #4fc3f7; }
  .entry-card .card-header { padding: 10px 14px; font-size: 13px; color: #888; display: flex; justify-content: space-between; align-items: center; }
  .entry-card .card-header .sim-score { color: #4fc3f7; font-weight: 600; font-family: monospace; font-size: 16px; }
  .comparison { display: flex; gap: 0; align-items: flex-start; }
  .comparison .side { flex: 1; position: relative; min-width: 0; }
  .comparison .side img { width: 100%; height: auto; display: block; background: #0a0a0a; }
  .comparison .side .label { position: absolute; bottom: 0; left: 0; right: 0; padding: 4px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; background: rgba(0,0,0,0.7); text-align: center; }
  .comparison .divider { width: 2px; background: #333; flex-shrink: 0; align-self: stretch; }
  .label-qql { color: #4fc3f7; }
  .label-ref { color: #ff9800; }

  /* Responsive */
  @media (max-width: 700px) {
    .comparison { flex-direction: column; }
    .comparison .divider { width: auto; height: 2px; }
    .ref-header { flex-direction: column; text-align: center; }
  }
</style>
</head>
<body>
<div class="container">`;
}

function pageFoot() {
  return `</div></body></html>`;
}

function renderIndex() {
  const rows = getAllRefs();
  const stats = loadStats();
  const maxScore = rows.length > 0 ? rows[0].best : 0.5;

  let html = pageHead("HOF Browser");
  html += `<header><h1>Hall of Fame Browser</h1><div class="subtitle">QQL generations ranked by similarity to reference paintings</div></header>`;

  if (stats.totalBatches) {
    html += `<div class="stats-bar">
      <div class="stat">Batches: <b>${stats.totalBatches}</b></div>
      <div class="stat">Images scored: <b>${(stats.totalImages || 0).toLocaleString()}</b></div>
      <div class="stat">HOF entries: <b>${(stats.totalEntries || 0).toLocaleString()}</b></div>
      <div class="stat">References matched: <b>${rows.length}</b></div>
      <div class="stat">Best similarity: <b>${(stats.bestSimilarity || 0).toFixed(4)}</b></div>
    </div>`;
  }

  if (rows.length === 0) {
    html += `<p style="padding:40px;text-align:center;color:#666">No hall-of-fame data yet. Run some batches first!</p>`;
  } else {
    html += `<table>
      <tr><th class="num">#</th><th>Title</th><th>Artist</th><th class="num">Year</th><th class="num">Best Score</th><th></th><th class="num">Floor</th><th class="num">Entries</th></tr>`;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      html += `<tr class="ref-row" onclick="location.href='/ref/${encodeURIComponent(r.dir)}'">
        <td class="num rank">${i + 1}</td>
        <td>${escHtml(r.title)}</td>
        <td class="artist">${escHtml(r.artist)}</td>
        <td class="num year">${r.year || ""}</td>
        <td class="num score">${r.best.toFixed(4)}</td>
        <td>${scoreBar(r.best, maxScore)}</td>
        <td class="num floor">${r.floor.toFixed(4)}</td>
        <td class="num count">${r.count}/50</td>
      </tr>`;
    }
    html += `</table>`;
  }

  html += pageFoot();
  return html;
}

function renderRefDetail(dirName) {
  const artRefs = loadArtRefs();
  const ref = artRefs[dirName];
  const refDir = path.join(HOF_DIR, dirName);
  const entries = getRefEntries(refDir);

  const title = ref ? ref.title : dirName.replace(/_/g, " ");
  const artist = ref ? ref.artist : "";
  const year = ref ? ref.year : "";

  // Reference image: prefer local file, fall back to URL
  let refImgSrc = "";
  if (ref && ref.name && fs.existsSync(path.join(REFS_DIR, ref.name))) {
    refImgSrc = "/img/ref/" + encodeURIComponent(ref.name);
  } else if (ref && ref.url) {
    refImgSrc = ref.url;
  }

  let html = pageHead(title + " — HOF Browser");
  html += `<header><h1>Hall of Fame Browser</h1></header>`;
  html += `<a class="back" href="/">&larr; Back to all references</a>`;

  html += `<div class="ref-header">`;
  if (refImgSrc) {
    html += `<img src="${escHtml(refImgSrc)}" alt="${escHtml(title)}">`;
  }
  html += `<div class="info">
    <h2>${escHtml(title)}</h2>
    <div class="meta">${escHtml(artist)}${year ? " &middot; " + year : ""} &middot; ${entries.length} matches</div>
    ${entries.length > 0 ? `<div class="meta" style="margin-top:4px">Best: <span class="score">${entries[0].sim.toFixed(4)}</span> &middot; Floor: ${entries[entries.length - 1].sim.toFixed(4)}</div>` : ""}
  </div></div>`;

  html += `<div class="entries-grid">`;
  for (const entry of entries) {
    const qqlSrc = "/img/hof/" + encodeURIComponent(dirName) + "/" + encodeURIComponent(entry.file);
    html += `<div class="entry-card">
      <div class="card-header">
        <span>${escHtml(entry.file.replace(/^sim-[\d.]+-/, "").replace(/\.png$/, ""))}</span>
        <span class="sim-score">${entry.sim.toFixed(4)}</span>
      </div>
      <div class="comparison">
        <div class="side">
          <img src="${escHtml(qqlSrc)}" alt="QQL generation" loading="lazy">
          <div class="label label-qql">QQL Generation</div>
        </div>
        <div class="divider"></div>
        <div class="side">
          ${refImgSrc ? `<img src="${escHtml(refImgSrc)}" alt="${escHtml(title)}" loading="lazy">` : `<div style="padding:40px;color:#666;text-align:center">Reference image not available</div>`}
          <div class="label label-ref">Reference</div>
        </div>
      </div>
    </div>`;
  }
  html += `</div>`;

  html += pageFoot();
  return html;
}

// --- HTTP server ---

function serveFile(res, filePath, contentType) {
  try {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Cache-Control": "public, max-age=3600",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500);
    res.end("Error");
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  // Index page
  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderIndex());
    return;
  }

  // Reference detail page: /ref/<dir-name>
  const refMatch = pathname.match(/^\/ref\/([^/]+)$/);
  if (refMatch) {
    const dirName = refMatch[1];
    if (fs.existsSync(path.join(HOF_DIR, dirName))) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(renderRefDetail(dirName));
    } else {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<h1>Reference not found</h1>");
    }
    return;
  }

  // Serve HOF images: /img/hof/<dir>/<file>
  const hofMatch = pathname.match(/^\/img\/hof\/([^/]+)\/(.+)$/);
  if (hofMatch) {
    const filePath = path.join(HOF_DIR, hofMatch[1], hofMatch[2]);
    serveFile(res, filePath, "image/png");
    return;
  }

  // Serve reference images: /img/ref/<filename>
  const refImgMatch = pathname.match(/^\/img\/ref\/(.+)$/);
  if (refImgMatch) {
    const filePath = path.join(REFS_DIR, refImgMatch[1]);
    const ext = path.extname(filePath).toLowerCase();
    const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
    serveFile(res, filePath, types[ext] || "image/jpeg");
    return;
  }

  // API endpoint for JSON data
  if (pathname === "/api/refs") {
    const rows = getAllRefs();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rows));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("  HOF Browser running at http://localhost:" + PORT);
  console.log("  Press Ctrl+C to stop");
  console.log("");
});
