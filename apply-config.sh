#!/bin/bash
# Apply config changes from /app/backend/.env and restart the backend.
# Usage:  bash /app/apply-config.sh
set -e
echo "Current config (/app/backend/.env):"
echo "------------------------------------"
cat /app/backend/.env
echo "------------------------------------"
echo ""
echo "Restarting backend to apply changes..."
sudo supervisorctl restart backend
sleep 2
echo ""
echo "Backend status:"
sudo supervisorctl status backend
echo ""
echo "Recent logs:"
tail -n 15 /var/log/supervisor/backend.err.log
echo ""
echo "Done. Login with the (possibly updated) credentials above."
