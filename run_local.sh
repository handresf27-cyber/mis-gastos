#!/bin/bash
# Levanta la app localmente en tu Mac.
# Uso:  ./run_local.sh
set -e

cd "$(dirname "$0")/backend"

if [ ! -d ".venv" ]; then
  echo "==> Creando entorno virtual de Python..."
  python3 -m venv .venv
fi
source .venv/bin/activate

echo "==> Instalando dependencias..."
pip install -q -r requirements.txt

if [ ! -f ".env" ]; then
  echo "==> Creando .env a partir del ejemplo..."
  cp .env.example .env
fi

echo ""
echo "============================================"
echo "  App corriendo en:  http://127.0.0.1:8000"
echo "  API docs en:       http://127.0.0.1:8000/docs"
echo "  (Ctrl+C para detener)"
echo "============================================"
echo ""

uvicorn app.main:app --reload --port 8000
