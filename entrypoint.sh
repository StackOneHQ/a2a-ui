#!/bin/sh
set -e

if [ "$1" = "start" ] || [ -z "$1" ]; then
  echo "Running: npm start"
  exec npm start
fi

# Allow arbitrary commands (debug shells etc.)
exec "$@"
