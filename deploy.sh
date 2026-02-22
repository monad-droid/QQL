#!/bin/bash
# QQL Pepe Hunter - Cloud Deploy Helper
#
# Builds the Docker image and runs it, or deploys to a remote server.
#
# LOCAL (just Docker):
#   ./deploy.sh local 1000
#
# REMOTE (any server with Docker + SSH access):
#   ./deploy.sh remote user@ip 1000
#
# The remote option will:
#   1. Build the image locally
#   2. Push it to the server
#   3. Run it there
#   4. Pull results back when done

set -e

MODE=${1:-local}
COUNT=${3:-500}
TOP_N=${4:-20}
IMAGE_NAME="qql-pepe-hunter"

build_image() {
  echo ">>> Building Docker image..."
  docker build -t "$IMAGE_NAME" .
  echo ">>> Image built: $IMAGE_NAME"
}

run_local() {
  local count=${1:-500}
  local top_n=${2:-20}
  echo ">>> Running locally: $count images, top $top_n"
  mkdir -p results
  docker run --rm \
    -v "$(pwd)/results:/app/results" \
    -v "$(pwd)/references:/app/references" 2>/dev/null \
    "$IMAGE_NAME" "$count" "$top_n" \
    || docker run --rm \
    -v "$(pwd)/results:/app/results" \
    "$IMAGE_NAME" "$count" "$top_n"
  echo ""
  echo ">>> Results saved to ./results/"
}

run_remote() {
  local server=$1
  local count=${2:-500}
  local top_n=${3:-20}

  echo ">>> Deploying to $server"

  # Save image as tarball, push to server
  echo ">>> Exporting Docker image..."
  docker save "$IMAGE_NAME" | gzip > /tmp/qql-image.tar.gz
  echo ">>> Uploading to $server ($(du -h /tmp/qql-image.tar.gz | cut -f1))..."
  scp /tmp/qql-image.tar.gz "$server":/tmp/
  rm /tmp/qql-image.tar.gz

  # Load and run on server
  echo ">>> Loading image on server..."
  ssh "$server" "docker load < /tmp/qql-image.tar.gz && rm /tmp/qql-image.tar.gz"

  echo ">>> Running pipeline on server ($count images, top $top_n)..."
  ssh "$server" "mkdir -p ~/qql-results && docker run --rm -v ~/qql-results:/app/results $IMAGE_NAME $count $top_n"

  # Pull results back
  echo ">>> Downloading results..."
  mkdir -p results
  scp -r "$server":~/qql-results/* ./results/

  echo ""
  echo ">>> Done! Results in ./results/"
  ls -la results/*.png 2>/dev/null | head -10
}

case "$MODE" in
  local)
    build_image
    run_local "$COUNT" "$TOP_N"
    ;;
  remote)
    SERVER=$2
    if [ -z "$SERVER" ]; then
      echo "Usage: ./deploy.sh remote user@ip [count] [top-n]"
      exit 1
    fi
    build_image
    run_remote "$SERVER" "$COUNT" "$TOP_N"
    ;;
  build)
    build_image
    ;;
  *)
    echo "QQL Pepe Hunter - Cloud Deploy"
    echo ""
    echo "Usage:"
    echo "  ./deploy.sh local [count] [top-n]     Run locally via Docker"
    echo "  ./deploy.sh remote user@ip [count]     Deploy to remote server"
    echo "  ./deploy.sh build                      Just build the image"
    echo ""
    echo "Quick cloud setup (cheapest options):"
    echo ""
    echo "  Hetzner (€4.5/mo for 2 vCPU, 4GB):"
    echo "    hcloud server create --name pepe --type cpx21 --image docker-ce"
    echo "    ./deploy.sh remote root@<ip> 1000"
    echo ""
    echo "  DigitalOcean (\$12/mo for 2 vCPU, 2GB):"
    echo "    doctl compute droplet create pepe --size s-2vcpu-2gb --image docker-20-04"
    echo "    ./deploy.sh remote root@<ip> 1000"
    echo ""
    echo "  AWS Spot (cheapest for big batches):"
    echo "    # Use c5.xlarge spot (~\$0.06/hr for 4 vCPU, 8GB)"
    echo "    aws ec2 run-instances --instance-type c5.xlarge \\"
    echo "      --instance-market-options '{\"MarketType\":\"spot\"}' \\"
    echo "      --image-id ami-xxxxx --key-name your-key"
    echo "    ./deploy.sh remote ubuntu@<ip> 5000"
    echo ""
    echo "  Any VPS with Docker + SSH:"
    echo "    ./deploy.sh remote user@your-server 1000"
    ;;
esac
