#!/usr/bin/env bash
# Runs capture.mjs with Windows Chrome/Node. Usage: ./run.sh <base-url> [wait-ms]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UNC="\\\\wsl.localhost\\${WSL_DISTRO_NAME:-Ubuntu}${ROOT//\//\\}"
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { \$_.CommandLine -like '*tabularis-shot*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1 || true
powershell.exe -NoProfile -Command "\$env:SHOT_WAIT='${2:-6000}'; Set-Location C:\; node '$UNC\\scripts\\screenshots\\capture.mjs' 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' '$1' '$UNC\\assets\\screenshots'"
