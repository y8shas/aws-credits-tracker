#!/usr/bin/env bash
# Builds dist/aws-credits-tracker-v<version>.zip from ./extension (ready for GitHub Releases / Chrome Web Store).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./extension/manifest.json').version")
mkdir -p dist
OUT="dist/aws-credits-tracker-v${VERSION}.zip"
rm -f "$OUT"
(cd extension && zip -r "../$OUT" . -x "*.DS_Store" >/dev/null)
echo "Built $OUT"
