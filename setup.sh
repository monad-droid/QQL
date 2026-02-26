#!/bin/bash
# Setup script for QQL Art Hunter
# Installs root deps, clones qql-headless renderer, downloads references.
#
# Prerequisites (install first):
#   apt-get update && apt-get install -y \
#     build-essential pkg-config python3 git \
#     libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev

set -e

echo "=== QQL Art Hunter Setup ==="

# Step 1: Root project dependencies
echo "Installing root dependencies..."
npm install
echo "Root deps installed."
echo ""

# Step 2: Clone qql-headless (Node.js renderer)
if [ ! -d "qql-headless" ]; then
  echo "Cloning qql-headless..."
  git clone https://github.com/qql-art/qql-headless.git
else
  echo "qql-headless already exists, skipping clone."
fi

# qql-headless ships with canvas@2 which fails on Node 20+.
# Upgrade to canvas@3 before installing.
echo "Installing qql-headless dependencies (canvas@3)..."
cd qql-headless
npm install canvas@3 --save
cd ..
echo "qql-headless installed."
echo ""

# Step 3: Create working directories
mkdir -p renders results references hall-of-fame logs

# Step 4: Make scripts executable
chmod +x run.sh run-loop.sh download-references.sh

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Download reference images:"
echo "     TARGET=paintingwide ./download-references.sh references"
echo ""
echo "  2. Run the hunter:"
echo "     TARGET=paintingwide ./run-loop.sh"
