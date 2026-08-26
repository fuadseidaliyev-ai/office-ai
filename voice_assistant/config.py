"""Central configuration, loaded from environment / .env file."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # dotenv is optional at runtime
    pass


def _get(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Config:
    # Agent
    api_key: str
    model: str
    permission_mode: str
    workdir: Path

    # Interaction
    wake_word: str

    # STT
    whisper_model: str
    whisper_device: str
    stt_language: str | None

    # Mic / VAD
    vad_aggressiveness: int
    silence_timeout: float

    # TTS
    tts_rate: int

    # Safety
    confine_writes: bool
    allow_shell: bool

    @classmethod
    def load(cls) -> "Config":
        workdir = _get("ASSISTANT_WORKDIR") or str(Path.home())
        language = _get("STT_LANGUAGE") or None
        return cls(
            api_key=_get("ANTHROPIC_API_KEY"),
            model=_get("ASSISTANT_MODEL", "claude-sonnet-5"),
            permission_mode=_get("ASSISTANT_PERMISSION_MODE", "acceptEdits"),
            workdir=Path(workdir).expanduser(),
            wake_word=_get("WAKE_WORD").lower(),
            whisper_model=_get("WHISPER_MODEL", "base"),
            whisper_device=_get("WHISPER_DEVICE", "cpu"),
            stt_language=language,
            vad_aggressiveness=int(_get("VAD_AGGRESSIVENESS", "2")),
            silence_timeout=float(_get("SILENCE_TIMEOUT", "1.0")),
            tts_rate=int(_get("TTS_RATE", "185")),
            confine_writes=_get("ASSISTANT_CONFINE_WRITES", "true").lower()
            not in {"0", "false", "no", "off"},
            allow_shell=_get("ASSISTANT_ALLOW_SHELL", "true").lower()
            not in {"0", "false", "no", "off"},
        )

    def validate(self) -> None:
        if not self.api_key and not _claude_cli_logged_in():
            raise SystemExit(
                "No authentication found. Pick one:\n"
                "  1) Claude subscription (Pro/Max) — run `claude auth login` once\n"
                "     (uses your plan's usage limit, no API key needed), or\n"
                "  2) API key — put ANTHROPIC_API_KEY=sk-ant-... in .env\n"
                "     (from https://console.anthropic.com, billed per use)."
            )
        if not self.workdir.exists():
            raise SystemExit(f"ASSISTANT_WORKDIR does not exist: {self.workdir}")


def _claude_cli_logged_in() -> bool:
    """True if the Claude Code CLI has a signed-in account (subscription auth).

    The Agent SDK runs on top of that CLI, so a CLI login means the assistant
    can work with no API key, using the account's plan limits.
    """
    import json
    import shutil
    import subprocess

    if not shutil.which("claude"):
        return False
    try:
        out = subprocess.run(
            ["claude", "auth", "status"],
            capture_output=True, text=True, timeout=15,
        )
        return bool(json.loads(out.stdout or "{}").get("loggedIn"))
    except Exception:
        # Older CLIs lack `auth status`; fall back to the credentials file.
        return (Path.home() / ".claude" / ".credentials.json").exists()
