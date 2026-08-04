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
        )

    def validate(self) -> None:
        if not self.api_key:
            raise SystemExit(
                "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key."
            )
        if not self.workdir.exists():
            raise SystemExit(f"ASSISTANT_WORKDIR does not exist: {self.workdir}")
