#!/usr/bin/env bash
# Build and install edlaStagDebug on connected ADB device

set -euo pipefail

JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export JAVA_HOME

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

VARIANT="${1:-edlaStagDebug}"

echo "Building and installing $VARIANT..."
./gradlew "install${VARIANT^}" 2>&1
echo "Done: $VARIANT installed."
