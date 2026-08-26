#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "===================================================================="
echo "    BUILDING & LAUNCHING MANPOWER PORTAL (DOCKER COMPOSE)"
echo "===================================================================="
echo ""

docker compose up -d --build

echo ""
echo "===================================================================="
echo "                 DOCKER CONTAINERS LAUNCHED!"
echo "===================================================================="
echo "  Manpower Portal Web UI  : http://localhost:3001"
echo "  Backend FastAPI Swagger : http://localhost:8002/docs"
echo "  MongoDB Database Port  : 27017"
echo "===================================================================="
