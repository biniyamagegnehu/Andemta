#!/usr/bin/env bash
# Start Redis server inside WSL2 Ubuntu for Andemta development

echo "Checking Redis service in WSL2..."
if service redis-server status | grep -q "running"; then
  echo "Redis server is already running on port 6379."
else
  echo "Starting Redis server..."
  sudo service redis-server start
  echo "Redis server started."
fi

redis-cli ping || echo "Warning: Redis CLI ping failed. Please verify redis-server installation."

