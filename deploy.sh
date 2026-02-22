#!/bin/bash
# QQL Pepe Hunter - Cloud Deploy Helper
#
# SINGLE BATCH (one-shot):
#   ./deploy.sh local 1000            Run locally via Docker
#   ./deploy.sh remote user@ip 1000   Deploy to remote, run once, pull results
#
# 24/7 CONTINUOUS MODE:
#   ./deploy.sh daemon                Run locally in background (docker compose)
#   ./deploy.sh daemon-remote user@ip Deploy to remote server, run 24/7
#
# MANAGEMENT:
#   ./deploy.sh status                Check local daemon status + stats
#   ./deploy.sh status-remote user@ip Check remote daemon status + stats
#   ./deploy.sh pull user@ip          Download hall-of-fame from remote
#   ./deploy.sh stop                  Stop local daemon
#   ./deploy.sh stop-remote user@ip   Stop remote daemon
#   ./deploy.sh logs                  Tail local daemon logs
#   ./deploy.sh build                 Just build the Docker image

set -e

MODE=${1:-help}
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

run_daemon() {
  echo ">>> Starting 24/7 continuous mode..."
  mkdir -p hall-of-fame results logs references
  docker compose up -d --build
  echo ""
  echo ">>> Hunter is running in background!"
  echo ""
  echo "  Watch logs:      docker compose logs -f"
  echo "  Check stats:     cat hall-of-fame/_stats.json"
  echo "  View best:       ls -la hall-of-fame/*.png"
  echo "  Stop:            docker compose down"
  echo "  Or:              ./deploy.sh stop"
}

run_daemon_remote() {
  local server=$1

  echo ">>> Deploying 24/7 mode to $server"

  # Push image
  echo ">>> Building and exporting Docker image..."
  build_image
  docker save "$IMAGE_NAME" | gzip > /tmp/qql-image.tar.gz
  echo ">>> Uploading to $server ($(du -h /tmp/qql-image.tar.gz | cut -f1))..."
  scp /tmp/qql-image.tar.gz "$server":/tmp/
  rm /tmp/qql-image.tar.gz

  # Push compose file and scripts
  echo ">>> Uploading config files..."
  ssh "$server" "mkdir -p ~/qql-hunter/{hall-of-fame,results,logs,references}"
  scp docker-compose.yml run-loop.sh "$server":~/qql-hunter/

  # Load image and start
  echo ">>> Starting on server..."
  ssh "$server" "
    docker load < /tmp/qql-image.tar.gz && rm /tmp/qql-image.tar.gz
    cd ~/qql-hunter
    docker compose up -d
  "

  echo ""
  echo ">>> Hunter is running 24/7 on $server!"
  echo ""
  echo "  Watch logs:       ssh $server 'cd ~/qql-hunter && docker compose logs -f'"
  echo "  Check stats:      ssh $server 'cat ~/qql-hunter/hall-of-fame/_stats.json'"
  echo "  Pull results:     ./deploy.sh pull $server"
  echo "  Stop:             ./deploy.sh stop-remote $server"
}

show_status() {
  echo ">>> Local daemon status:"
  docker compose ps 2>/dev/null || echo "  Not running."
  echo ""
  if [ -f "hall-of-fame/_stats.json" ]; then
    echo ">>> Stats:"
    node -e "
      const s = require('./hall-of-fame/_stats.json');
      console.log('  Batches:        ' + s.totalBatches);
      console.log('  Total images:   ' + s.totalImages);
      console.log('  Hall-of-fame:   ' + s.totalHits + ' hits');
      console.log('  Best score:     ' + (s.bestSimilarity || 'N/A'));
      console.log('  Best file:      ' + (s.bestFile || 'N/A'));
      console.log('  Running since:  ' + (s.startedAt || 'N/A'));
      console.log('  Last batch:     ' + (s.lastBatchAt || 'N/A'));
    " 2>/dev/null || echo "  No stats yet."
  else
    echo ">>> No stats yet (hasn't completed first batch)."
  fi
  echo ""
  HOF_COUNT=$(ls hall-of-fame/*.png 2>/dev/null | wc -l)
  echo ">>> Hall-of-fame images: $HOF_COUNT"
}

show_status_remote() {
  local server=$1
  echo ">>> Remote daemon status on $server:"
  ssh "$server" "cd ~/qql-hunter 2>/dev/null && docker compose ps" 2>/dev/null || echo "  Not running."
  echo ""
  echo ">>> Remote stats:"
  ssh "$server" "cat ~/qql-hunter/hall-of-fame/_stats.json 2>/dev/null" || echo "  No stats yet."
  echo ""
  echo ">>> Hall-of-fame count:"
  ssh "$server" "ls ~/qql-hunter/hall-of-fame/*.png 2>/dev/null | wc -l"
}

pull_results() {
  local server=$1
  echo ">>> Pulling hall-of-fame from $server..."
  mkdir -p hall-of-fame
  scp -r "$server":~/qql-hunter/hall-of-fame/* ./hall-of-fame/
  echo ">>> Downloaded to ./hall-of-fame/"
  ls -la hall-of-fame/*.png 2>/dev/null | wc -l
  echo " images pulled."
}

case "$MODE" in
  local)
    COUNT=${2:-500}
    TOP_N=${3:-20}
    build_image
    run_local "$COUNT" "$TOP_N"
    ;;
  remote)
    SERVER=$2
    COUNT=${3:-500}
    TOP_N=${4:-20}
    if [ -z "$SERVER" ]; then
      echo "Usage: ./deploy.sh remote user@ip [count] [top-n]"
      exit 1
    fi
    build_image
    run_remote "$SERVER" "$COUNT" "$TOP_N"
    ;;
  daemon)
    run_daemon
    ;;
  daemon-remote)
    SERVER=$2
    if [ -z "$SERVER" ]; then
      echo "Usage: ./deploy.sh daemon-remote user@ip"
      exit 1
    fi
    run_daemon_remote "$SERVER"
    ;;
  status)
    show_status
    ;;
  status-remote)
    SERVER=$2
    if [ -z "$SERVER" ]; then
      echo "Usage: ./deploy.sh status-remote user@ip"
      exit 1
    fi
    show_status_remote "$SERVER"
    ;;
  pull)
    SERVER=$2
    if [ -z "$SERVER" ]; then
      echo "Usage: ./deploy.sh pull user@ip"
      exit 1
    fi
    pull_results "$SERVER"
    ;;
  stop)
    echo ">>> Stopping local daemon..."
    docker compose down
    ;;
  stop-remote)
    SERVER=$2
    if [ -z "$SERVER" ]; then
      echo "Usage: ./deploy.sh stop-remote user@ip"
      exit 1
    fi
    echo ">>> Stopping daemon on $SERVER..."
    ssh "$SERVER" "cd ~/qql-hunter && docker compose down"
    ;;
  logs)
    docker compose logs -f
    ;;
  build)
    build_image
    ;;
  *)
    echo "QQL Pepe Hunter - Cloud Deploy"
    echo ""
    echo "SINGLE BATCH (one-shot):"
    echo "  ./deploy.sh local [count] [top-n]       Run locally via Docker"
    echo "  ./deploy.sh remote user@ip [count]       Deploy to remote, run once"
    echo ""
    echo "24/7 CONTINUOUS MODE:"
    echo "  ./deploy.sh daemon                       Run locally in background"
    echo "  ./deploy.sh daemon-remote user@ip        Deploy to remote, run 24/7"
    echo ""
    echo "MANAGEMENT:"
    echo "  ./deploy.sh status                       Local daemon status + stats"
    echo "  ./deploy.sh status-remote user@ip        Remote daemon status"
    echo "  ./deploy.sh pull user@ip                 Download hall-of-fame results"
    echo "  ./deploy.sh stop                         Stop local daemon"
    echo "  ./deploy.sh stop-remote user@ip          Stop remote daemon"
    echo "  ./deploy.sh logs                         Tail local daemon logs"
    echo "  ./deploy.sh build                        Just build the image"
    echo ""
    echo "CLOUD SETUP (cheapest options):"
    echo ""
    echo "  Hetzner (best value - €4.5/mo for 2 vCPU, 4GB):"
    echo "    hcloud server create --name pepe --type cpx21 --image docker-ce"
    echo "    ./deploy.sh daemon-remote root@<ip>"
    echo ""
    echo "  DigitalOcean (\$12/mo for 2 vCPU, 2GB):"
    echo "    doctl compute droplet create pepe --size s-2vcpu-2gb --image docker-20-04"
    echo "    ./deploy.sh daemon-remote root@<ip>"
    echo ""
    echo "  AWS Spot (cheapest for big batches - ~\$0.06/hr for 4 vCPU):"
    echo "    aws ec2 run-instances --instance-type c5.xlarge \\"
    echo "      --instance-market-options '{\"MarketType\":\"spot\"}' \\"
    echo "      --image-id ami-xxxxx --key-name your-key"
    echo "    ./deploy.sh daemon-remote ubuntu@<ip>"
    echo ""
    echo "  Any VPS with Docker + SSH:"
    echo "    ./deploy.sh daemon-remote user@your-server"
    ;;
esac
