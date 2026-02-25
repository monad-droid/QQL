FROM node:18-slim

# System dependencies for node-canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    python3 \
    git \
    libcairo2-dev \
    libjpeg62-turbo-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package files and install
COPY package.json package-lock.json ./
RUN npm ci

# Clone and install qql-headless
RUN git clone https://github.com/qql-art/qql-headless.git \
  && cd qql-headless && npm install

# Copy application code
COPY generate.js score.js dino-score.js run.sh run-loop.sh download-references.sh ./
COPY targets/ ./targets/

# Create directories (references may be empty but must exist for COPY)
RUN mkdir -p renders results references hall-of-fame logs

# Copy reference images for CLIP comparison (if any exist)
COPY references/ ./references/

RUN chmod +x run.sh run-loop.sh download-references.sh

# Pre-download DINOv3 model so first run doesn't wait for download
RUN node -e "import('@huggingface/transformers').then(t => \
  Promise.all([ \
    t.AutoProcessor.from_pretrained('onnx-community/dinov3-vitl16-pretrain-lvd1689m-ONNX'), \
    t.AutoModel.from_pretrained('onnx-community/dinov3-vitl16-pretrain-lvd1689m-ONNX'), \
  ]).then(() => console.log('DINOv3 model cached.')))"

ENTRYPOINT ["./run.sh"]
