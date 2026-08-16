#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  Campus AI — one-click launcher (macOS / Linux)
#  Starts the backend (FastAPI) + the app (Expo web).
#  Usage:  ./START_CAMPUS_AI.sh        (Ctrl-C stops both)
# ════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

echo ""
echo " ============================================"
echo "   Campus AI - starting everything..."
echo " ============================================"
echo ""

# ── 1. Backend deps (first run only) ─────────────────────────────
if [ ! -f backend/.deps_installed ]; then
  echo " [1/4] Installing backend dependencies (first run only)..."
  pip3 install -r backend/requirements.txt -q
  touch backend/.deps_installed
else
  echo " [1/4] Backend dependencies OK"
fi

# ── 2. Frontend deps (first run only) ────────────────────────────
if [ ! -d Frontend/node_modules ]; then
  echo " [2/4] Installing app dependencies (first run only, ~2 min)..."
  (cd Frontend && npm install --legacy-peer-deps --no-audit --no-fund)
else
  echo " [2/4] App dependencies OK"
fi

# ── 3. Backend ────────────────────────────────────────────────────
echo " [3/4] Starting Campus AI backend on http://localhost:8000 ..."
(cd backend && python3 -m uvicorn API:app --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

# ── 4. App (Expo web) ────────────────────────────────────────────
echo " [4/4] Starting the app on http://localhost:19006 ..."
sleep 2
(cd Frontend && npx expo start --web --port 19006) &
APP_PID=$!

trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID $APP_PID 2>/dev/null" INT TERM

echo ""
echo " ============================================"
echo "   All started!"
echo "   App:      http://localhost:19006"
echo "   Backend:  http://localhost:8000/health"
echo "   API docs: http://localhost:8000/docs"
echo ""
echo "   (Optional) Admin dashboard:"
echo "      cd dashboard && npm install && npm run dev"
echo ""
echo "   Press Ctrl-C to stop everything."
echo " ============================================"
wait
