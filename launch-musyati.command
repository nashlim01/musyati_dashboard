#!/bin/bash
# Musyati Tracking Monitor — one-click launcher.
# Double-click this file in Finder to start the dashboard like an app.
# It serves the UI + API on a single local port and opens your browser.

set -e
PORT=4000
URL="http://localhost:$PORT"

# always run from this script's own folder, wherever it was double-clicked from
cd "$(dirname "$0")"

clear
echo "==================================================="
echo "   Musyati Tracking Monitor"
echo "==================================================="
echo ""

# locate node / npm even when launched from Finder (which has a minimal PATH)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH"
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: Node.js / npm not found."
  echo "Install Node from https://nodejs.org then double-click this file again."
  echo ""
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

# if it's already running, just open the browser and stop
if curl -s -m 2 "$URL/api/health" >/dev/null 2>&1; then
  echo "Already running — opening dashboard..."
  open "$URL"
  echo ""
  read -n 1 -s -r -p "Dashboard is open in your browser. Press any key to close this window..."
  exit 0
fi

# first run (or after an update): install dependencies
if [ ! -d node_modules ]; then
  echo "First-time setup — installing components (one-time, a minute or two)..."
  npm install
  echo ""
fi

# build the UI if it hasn't been built yet
if [ ! -f client/dist/index.html ]; then
  echo "Preparing the dashboard..."
  npm run build
  echo ""
fi

echo "Starting the dashboard server..."
echo ""

# launch the server in the background, wait until it answers, then open browser
npm run start &
SERVER_PID=$!

for i in $(seq 1 30); do
  if curl -s -m 2 "$URL/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

open "$URL"

echo "==================================================="
echo "   Musyati Tracking Monitor is running"
echo "   $URL"
echo "==================================================="
echo ""
echo "Your data is saved in:  server/data/musyati-data.xlsx"
echo ""
echo ">>> Keep this window open while you use the dashboard. <<<"
echo ">>> Close this window (or press Ctrl-C) to shut it down. <<<"
echo ""

# keep the window alive tied to the server; Ctrl-C or closing stops everything
trap "kill $SERVER_PID 2>/dev/null" EXIT
wait $SERVER_PID
