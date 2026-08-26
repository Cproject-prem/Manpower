#!/bin/bash
# Git Pull / Sync Utility for Manpower

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo "==================================================="
echo "       Git Pull / Sync Utility (Manpower)"
echo "==================================================="
echo ""
echo "---> Pulling Manpower..."
cd "$SCRIPT_DIR" || exit 1
git pull origin main

echo ""
echo "==================================================="
echo "Git Pull completed!"
echo "==================================================="
