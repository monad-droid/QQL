#!/bin/bash
# Setup script for QQL Pepe Hunter
# Clones required dependencies and installs them

set -e

echo "=== QQL Pepe Hunter Setup ==="

# Clone qql-headless (Node.js renderer)
if [ ! -d "qql-headless" ]; then
  echo "Cloning qql-headless..."
  git clone https://github.com/qql-art/qql-headless.git
  cd qql-headless
  npm install
  cd ..
  echo "qql-headless installed."
else
  echo "qql-headless already exists, skipping."
fi

# Clone qqlrs (fast Rust renderer, optional)
if [ ! -d "qqlrs" ]; then
  echo "Cloning qqlrs (Rust renderer)..."
  git clone https://github.com/qql-art/qqlrs.git
  echo "To build: cd qqlrs && cargo build --release"
else
  echo "qqlrs already exists, skipping."
fi

echo ""
echo "Setup complete. Run the pipeline with:"
echo "  node generate.js <address> <count>"
