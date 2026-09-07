#!/bin/bash
# Linux/macOS 入口；Windows 可直接執行 python build.py。
set -e
cd "$(dirname "$0")"
exec python3 build.py "$@"
