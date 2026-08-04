#!/usr/bin/env bash
# One-command setup + launch for the voice assistant (macOS / Linux).
# Usage:  bash run.sh
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;36m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }

# ------------------------------------------------ 1. system audio libraries --
say "1/4  Installing system audio libraries (PortAudio, espeak-ng)…"
case "$(uname -s)" in
  Darwin)
    if command -v brew >/dev/null 2>&1; then
      brew list portaudio >/dev/null 2>&1 || brew install portaudio
      brew list espeak-ng >/dev/null 2>&1 || brew install espeak-ng
    else
      warn "Homebrew not found. Install it from https://brew.sh and re-run, or"
      warn "install PortAudio + espeak-ng yourself."
    fi ;;
  Linux)
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -qq || true
      sudo apt-get install -y portaudio19-dev espeak-ng
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y portaudio-devel espeak-ng
    elif command -v pacman >/dev/null 2>&1; then
      sudo pacman -S --noconfirm portaudio espeak-ng
    else
      warn "No known package manager found; install portaudio + espeak-ng manually."
    fi ;;
  *) warn "Unknown OS; skipping system libraries." ;;
esac

# ------------------------------------------------------ 2. python + deps -----
say "2/4  Setting up the Python environment…"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip >/dev/null
pip install -r requirements.txt

# --------------------------------------------------------- 3. API key --------
say "3/4  Checking your Anthropic API key…"
[ -f .env ] || cp .env.example .env
current_key="$(grep -E '^ANTHROPIC_API_KEY=' .env | cut -d= -f2- || true)"
case "$current_key" in
  ""|sk-ant-...*)
    printf '\n🔑  Paste your Anthropic API key (from https://console.anthropic.com), then press Enter:\n'
    read -r key
    python - "$key" <<'PY'
import sys, re, pathlib
key = sys.argv[1].strip()
p = pathlib.Path(".env"); t = p.read_text()
if re.search(r"^ANTHROPIC_API_KEY=.*$", t, flags=re.M):
    t = re.sub(r"^ANTHROPIC_API_KEY=.*$", "ANTHROPIC_API_KEY=" + key, t, flags=re.M)
else:
    t += "\nANTHROPIC_API_KEY=" + key + "\n"
p.write_text(t)
print("Saved to .env")
PY
    ;;
  *) echo "API key already set." ;;
esac

# ----------------------------------------------------------- 4. launch -------
say "4/4  Starting the assistant — say «привет джарвис» 🎙️"
exec python -m voice_assistant
