#!/bin/bash
# ╔══════════════════════════════════════╗
# ║  Bitflow – setup & build script      ║
# ╚══════════════════════════════════════╝
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ██████╗ ██╗████████╗███████╗██╗      ██████╗ ██╗    ██╗"
echo "  ██╔══██╗██║╚══██╔══╝██╔════╝██║     ██╔═══██╗██║    ██║"
echo "  ██████╔╝██║   ██║   █████╗  ██║     ██║   ██║██║ █╗ ██║"
echo "  ██╔══██╗██║   ██║   ██╔══╝  ██║     ██║   ██║██║███╗██║"
echo "  ██████╔╝██║   ██║   ██║     ███████╗╚██████╔╝╚███╔███╔╝"
echo "  ╚═════╝ ╚═╝   ╚═╝   ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ "
echo ""
echo "  Modern Torrent Client — Build Script"
echo "  ───────────────────────────────────────"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "  ✗ Node.js not found. Install from https://nodejs.org (v18+)"
  read -p "  Press Enter to exit..." && exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "  ✗ Node.js v18+ required. Current: $(node -v)"
  read -p "  Press Enter to exit..." && exit 1
fi

echo "  ✓ Node.js $(node -v)"

# Install dependencies
echo ""
echo "  → Installing dependencies (this may take a minute)..."
npm install 2>&1 | grep -E "added|warn|error" | head -20
echo "  ✓ Dependencies installed"

# Choose what to do
echo ""
echo "  What would you like to do?"
echo "  [1] Launch app now (dev mode)"
echo "  [2] Build .dmg installer (release)"
echo "  [3] Both"
echo ""
read -p "  Enter choice [1-3]: " CHOICE

case "$CHOICE" in
  1)
    echo ""
    echo "  → Launching Bitflow..."
    npx electron .
    ;;
  2)
    echo ""
    echo "  → Building .dmg (arm64 + x64)..."
    npm run dist
    echo ""
    echo "  ✓ Build complete! Find your .dmg in dist/"
    open dist/
    ;;
  3)
    echo ""
    echo "  → Launching Bitflow in dev mode..."
    npx electron . &
    sleep 3
    echo "  → Building .dmg..."
    npm run dist
    echo "  ✓ .dmg saved to dist/"
    open dist/
    ;;
  *)
    echo "  Invalid choice. Run this script again."
    ;;
esac

read -p "  Press Enter to close..."
