#!/data/data/com.termux/files/usr/bin/bash
# Jalankan Satu Hari sebagai server lokal.
set -e
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "Satu Hari berjalan di http://localhost:${PORT}"
echo "Tekan Ctrl+C untuk berhenti."
exec python3 -m http.server "$PORT" --bind 127.0.0.1
