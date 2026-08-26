#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "===================================================================="
echo "     STOPPING MANPOWER PORTAL DOCKER CONTAINERS"
echo "===================================================================="
echo ""

docker compose down

echo ""
echo "===================================================================="
echo "                ALL DOCKER CONTAINERS STOPPED!"
echo "===================================================================="
