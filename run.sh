#!/usr/bin/env bash
# One-command setup + launch for the voice assistant (macOS / Linux).
#
# From inside the repo:   bash run.sh
# From anywhere (bootstraps itself — clones the repo first):
#   curl -fsSL https://raw.githubusercontent.com/fuadseidaliyev-ai/office-ai/claude/voice-assistant-agent-sdk-biae9n/run.sh | bash
set -euo pipefail
cd "$(dirname "$0")" 2>/dev/null || true

say() { printf '\n\033[1;36m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }

# ------------------------------------------------ 0. bootstrap (if needed) ---
# When piped via curl (or run outside the repo), fetch the project first.
REPO_URL="${OFFICE_AI_REPO:-https://github.com/fuadseidaliyev-ai/office-ai.git}"
BRANCH="${OFFICE_AI_BRANCH:-claude/voice-assistant-agent-sdk-biae9n}"
if [ ! -f voice_assistant/__main__.py ]; then
  say "0/4  Fetching the project…"
  if [ -d office-ai/.git ]; then
    cd office-ai
  else
    git clone --branch "$BRANCH" "$REPO_URL" office-ai
    cd office-ai
  fi
  git checkout "$BRANCH" >/dev/null 2>&1 || true
fi

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

# ----------------------------------------------------- 3. authentication -----
say "3/4  Setting up authentication…"
[ -f .env ] || cp .env.example .env

# Locate a Claude CLI: system-wide, or the one bundled inside the SDK package.
CLI="$(command -v claude || true)"
if [ -z "$CLI" ]; then
  CLI="$(python -c "import claude_agent_sdk, pathlib; p = pathlib.Path(claude_agent_sdk.__file__).parent / '_bundled' / 'claude'; print(p if p.exists() else '')" 2>/dev/null || true)"
fi

cli_logged_in() {
  [ -n "$CLI" ] && "$CLI" auth status 2>/dev/null | grep -q '"loggedIn": *true'
}

current_key="$(grep -E '^ANTHROPIC_API_KEY=' .env | cut -d= -f2- || true)"
case "$current_key" in ""|sk-ant-...*) current_key="";; esac

if [ -n "$current_key" ]; then
  echo "Using the API key from .env."
elif cli_logged_in; then
  echo "Using your Claude account login (subscription plan limit) — no API key needed."
else
  printf '\nHow should the assistant authenticate?\n'
  printf '  1) Claude subscription (Pro/Max) — sign in once in the browser, uses your plan limit  [default]\n'
  printf '  2) API key from console.anthropic.com — pay-per-use\n'
  printf 'Choose 1 or 2 and press Enter: '
  if [ -t 0 ]; then read -r choice; else read -r choice < /dev/tty; fi
  if [ "${choice:-1}" = "2" ]; then
    printf '\n🔑  Paste your Anthropic API key, then press Enter:\n'
    if [ -t 0 ]; then read -r key; else read -r key < /dev/tty; fi
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
  else
    if [ -z "$CLI" ]; then
      warn "Claude CLI not found — this should not happen after pip install; falling back to API key."
      exit 1
    fi
    echo "A browser window will open — sign in with your Claude account…"
    if [ -t 0 ]; then "$CLI" auth login; else "$CLI" auth login < /dev/tty; fi
    cli_logged_in || { warn "Login did not complete; re-run this script to try again."; exit 1; }
    echo "Signed in — the assistant will use your subscription's usage limit."
  fi
fi

# ----------------------------------------------------------- 4. launch -------
say "4/4  Starting the assistant — say «привет джарвис» 🎙️"
exec python -m voice_assistant
