#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PARENT_DIR="$( dirname "$SCRIPT_DIR" )"

echo "===================================================================="
echo "    LAUNCHING MANPOWER PORTAL & FORMFORGE PLATFORMS (LINUX)"
echo "===================================================================="
echo ""
echo "To access these applications from mobile phones or other computers"
echo "on your local network, enter your computer's IP address."
echo ""
read -p "Enter your IP address (default: localhost): " SERVER_IP
SERVER_IP=${SERVER_IP:-localhost}

echo ""
echo "===================================================================="
echo "[1/3] Starting MongoDB Service..."
if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start mongod || sudo systemctl start mongodb || true
elif command -v service >/dev/null 2>&1; then
    sudo service mongod start || sudo service mongodb start || true
fi

echo "[2/3] Configuring Manpower Frontend..."
echo "REACT_APP_BACKEND_URL=http://$SERVER_IP:8002" > "$PARENT_DIR/Manpower/frontend/.env"

echo "[3/3] Launching application services..."
echo ""

# Check for terminal tab launchers (gnome-terminal / konsole / x-terminal-emulator)
if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal \
      --tab --title="FormForge Backend (8001)" -- bash -c "cd '$PARENT_DIR/PDF Form/backend' && (source .venv/bin/activate 2>/dev/null || true) && python3 -m uvicorn server:app --reload --host 0.0.0.0 --port 8001; exec bash" \
      --tab --title="FormForge Frontend (3000)" -- bash -c "cd '$PARENT_DIR/PDF Form/frontend' && (yarn start || npm start); exec bash" \
      --tab --title="Manpower Backend (8002)" -- bash -c "cd '$PARENT_DIR/Manpower/backend' && (source .venv/bin/activate 2>/dev/null || true) && python3 -m uvicorn server:app --reload --host 0.0.0.0 --port 8002; exec bash" \
      --tab --title="Manpower Frontend" -- bash -c "cd '$PARENT_DIR/Manpower/frontend' && npm run dev; exec bash"
elif command -v konsole >/dev/null 2>&1; then
    konsole --new-tab --workdir "$PARENT_DIR/PDF Form/backend" -e bash -c "(source .venv/bin/activate 2>/dev/null || true) && python3 -m uvicorn server:app --reload --host 0.0.0.0 --port 8001; exec bash" &
    konsole --new-tab --workdir "$PARENT_DIR/PDF Form/frontend" -e bash -c "(yarn start || npm start); exec bash" &
    konsole --new-tab --workdir "$PARENT_DIR/Manpower/backend" -e bash -c "(source .venv/bin/activate 2>/dev/null || true) && python3 -m uvicorn server:app --reload --host 0.0.0.0 --port 8002; exec bash" &
    konsole --new-tab --workdir "$PARENT_DIR/Manpower/frontend" -e bash -c "npm run dev; exec bash" &
else
    echo "Terminal tab manager not found. Launching in background processes..."
    cd "$PARENT_DIR/PDF Form/backend" && (source .venv/bin/activate 2>/dev/null || true) && nohup python3 -m uvicorn server:app --reload --host 0.0.0.0 --port 8001 > /dev/null 2>&1 &
    cd "$PARENT_DIR/PDF Form/frontend" && nohup yarn start > /dev/null 2>&1 &
    cd "$PARENT_DIR/Manpower/backend" && (source .venv/bin/activate 2>/dev/null || true) && nohup python3 -m uvicorn server:app --reload --host 0.0.0.0 --port 8002 > /dev/null 2>&1 &
    cd "$PARENT_DIR/Manpower/frontend" && nohup npm run dev > /dev/null 2>&1 &
fi

echo ""
echo "===================================================================="
echo "                    ALL LINUX SERVICES LAUNCHED!"
echo "===================================================================="
echo ""
echo "  FormForge Website  : http://$SERVER_IP:3000"
echo "  FormForge API      : http://$SERVER_IP:8001/docs"
echo ""
echo "  Manpower Website   : http://$SERVER_IP:5173"
echo "  Manpower API      : http://$SERVER_IP:8002/docs"
echo ""
echo "===================================================================="
