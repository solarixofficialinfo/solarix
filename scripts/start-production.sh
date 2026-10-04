#!/usr/bin/env bash
# ==============================================================================
# SOLARIX PRODUCTION RUNTIME ENTRYPOINT
# Automatically launches:
# 1. WhatsApp Evolution Gateway (port 8080 / 8085 dual-listen)
# 2. Solarix FastAPI Backend Server (port $PORT / 8000)
# ==============================================================================
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[Solarix Host] Initializing Solarix Production Environment..."

# 1. Start WhatsApp Evolution Gateway in background if Node is available
if command -v node >/dev/null 2>&1; then
  if [ -f "whatsapp_engine/server.js" ]; then
    echo "[Solarix Host] Starting WhatsApp Evolution Gateway (ports 8080 & 8085)..."
    (cd whatsapp_engine && node server.js) &
    WHATSAPP_PID=$!
    echo "[Solarix Host] WhatsApp Evolution Gateway process spawned (PID: $WHATSAPP_PID)."
  fi
else
  echo "[Solarix Host] Note: 'node' binary not in PATH. Gateway will be checked by backend lifespan."
fi

# Clean up background process on exit
trap 'if [ -n "$WHATSAPP_PID" ]; then kill -TERM "$WHATSAPP_PID" 2>/dev/null || true; fi' EXIT INT TERM

# 2. Start FastAPI server
PORT="${PORT:-8000}"
echo "[Solarix Host] Launching Solarix Backend API on port $PORT..."
exec python3 -m uvicorn server:app --host 0.0.0.0 --port "$PORT" --app-dir backend
