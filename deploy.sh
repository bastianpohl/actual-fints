#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="actual-fints-api"
SERVICE_WAS_ACTIVE=0

echo "Pulling latest changes (git pull --ff-only)..."
git pull --ff-only

if [[ "${SERVICE_WAS_ACTIVE}" -eq 1 ]]; then
   echo "Restarting ${SERVICE_NAME}..."
   systemctl start "${SERVICE_NAME}"
   echo "${SERVICE_NAME} restarted successfully."
else
   echo "${SERVICE_NAME} was not running before deploy; leaving it stopped."
fi
