FROM node:22-slim

# System dependencies for node-canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
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
COPY generate.js score.js run.sh ./

# Optional: copy reference images for SSIM scoring
# COPY references/ ./references/

RUN chmod +x run.sh

# Output directories
RUN mkdir -p renders results

ENTRYPOINT ["./run.sh"]
