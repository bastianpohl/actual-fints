#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="actual-fints-api"
SERVICE_WAS_ACTIVE=0

echo "Checking status of ${SERVICE_NAME}..."

if systemctl is-active --quiet "${SERVICE_NAME}"; then
   SERVICE_WAS_ACTIVE=1
   echo "Stopping ${SERVICE_NAME}..."
   systemctl stop "${SERVICE_NAME}"
else
   echo "${SERVICE_NAME} is not running; skipping stop."
fi

echo "Pulling latest changes (git pull --ff-only)..."
git pull --ff-only

if [[ "${SERVICE_WAS_ACTIVE}" -eq 1 ]]; then
   echo "Restarting ${SERVICE_NAME}..."
   systemctl start "${SERVICE_NAME}"
   echo "${SERVICE_NAME} restarted successfully."
else
   echo "${SERVICE_NAME} was not running before deploy; leaving it stopped."
fi
