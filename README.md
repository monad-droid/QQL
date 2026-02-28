# QQL Art Hunter

Generates QQL art and scores it against 800+ classical paintings using DINOv3 image similarity. Maintains per-painting top-50 leaderboards in the hall of fame.

## Fresh Server Setup

### 1. System dependencies

```bash
apt-get update && apt-get install -y \
  build-essential pkg-config python3 git \
  libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev
```

### 2. Node.js (v18+ required)

If not already installed:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### 3. Clone the repo

```bash
git clone https://github.com/monad-droid/QQL.git
cd QQL
```

### 4. Install dependencies

```bash
# Root project deps (canvas, @huggingface/transformers)
npm install

# QQL renderer (separate repo, gitignored)
./setup.sh
```

### 5. Download reference images (~819 paintings)

```bash
TARGET=paintingwide ./download-references.sh references
```

This queries Wikipedia/Wikimedia Commons APIs. Takes a few minutes. Skips already-downloaded files on re-run.

### 6. Run

Single batch (500 images, keep top 20 in results/):
```bash
TARGET=paintingwide ./run.sh 500 20
```

Continuous mode (runs forever, builds hall of fame):
```bash
TARGET=paintingwide ./run-loop.sh
```

Optional args: `./run-loop.sh [batch-size] [top-n]`

Stop with Ctrl+C. Results persist across restarts.

## How it works

1. **Generate** — Renders QQL art at 256x256px using random seeds (6 parallel workers)
2. **Heuristic score** — Target-specific pixel analysis (color, blobs, etc.)
3. **DINOv3 score** — Encodes each image with DINOv3 ViT-S/16 and compares against all 819 reference painting embeddings via cosine similarity
4. **Hall of fame** — Each reference painting gets its own top-50 leaderboard. If a generation beats any painting's floor score, it gets saved and the worst gets pruned.

## Output structure

```
hall-of-fame/
  starry-night/           # Top 50 for Starry Night
    sim-0.3500-batch3-...png
    sim-0.3400-batch1-...png
    ...
  mona-lisa/              # Top 50 for Mona Lisa
    sim-0.3200-batch5-...png
    ...
  _stats.json             # Global stats + per-reference summary
results/                  # Current batch top-N (overwritten each batch)
renders/                  # Temp: current batch renders (cleared each batch)
references/               # The 819 reference painting images
logs/                     # Per-batch log files
```

## Available targets

Set via `TARGET` env var:

| Target | Description |
|--------|-------------|
| `paintingwide` | 800+ classical paintings (the main one) |
| `pepe` | Pepe the frog |
| `monalisa` | Mona Lisa |
| `starrynight` | Starry Night |
| `alien` | Alien face |
| `shrek` | Shrek |
| `yoda` | Yoda |
| `wave` | Ocean wave |

## DINOv3 model

The DINOv3 model (~350MB) downloads automatically on first run. Subsequent runs use the cached version.

To pre-download:
```bash
node -e "import('@huggingface/transformers').then(t => \
  Promise.all([ \
    t.AutoProcessor.from_pretrained('onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX'), \
    t.AutoModel.from_pretrained('onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX'), \
  ]).then(() => console.log('DINOv3 model cached.')))"
```

## Docker (alternative)

```bash
docker build -t qql-hunter .
docker run -v $(pwd)/hall-of-fame:/app/hall-of-fame \
           -v $(pwd)/references:/app/references \
           -e TARGET=paintingwide \
           qql-hunter
```
