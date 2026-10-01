#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../cli"
npm install
npm run build
