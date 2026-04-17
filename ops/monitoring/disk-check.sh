#!/usr/bin/env bash
# Warn when root filesystem usage exceeds the threshold.
#
# Install as /etc/update-motd.d/99-disk-check on the droplet so the warning
# appears at every SSH login.  Can also be called directly for testing:
#
#   bash ops/monitoring/disk-check.sh          # uses default threshold (80)
#   bash ops/monitoring/disk-check.sh 50       # test with a lower threshold
#
# Exit 0 → below threshold (silent).
# Exit 1 → at or above threshold (prints warning).

set -euo pipefail

THRESHOLD="${1:-80}"
USAGE=$(df / | awk 'NR==2 {gsub(/%/, ""); print $5}')

if [ "$USAGE" -ge "$THRESHOLD" ]; then
  echo "WARNING: Disk usage is ${USAGE}% (threshold: ${THRESHOLD}%). Free up space on /."
  exit 1
fi
