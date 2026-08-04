"""Text-to-speech using pyttsx3 (local, offline, cross-platform)."""

from __future__ import annotations

import re


class Speaker:
    def __init__(self, rate: int = 185):
        import pyttsx3

        self._engine = pyttsx3.init()
        self._engine.setProperty("rate", rate)

    @staticmethod
    def _clean(text: str) -> str:
        """Strip markdown/code so the voice reads naturally."""
        text = re.sub(r"```.*?```", " (code omitted) ", text, flags=re.DOTALL)
        text = re.sub(r"`([^`]*)`", r"\1", text)
        text = re.sub(r"[*_#>]", "", text)
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)  # links -> label
        return re.sub(r"\s+", " ", text).strip()

    def say(self, text: str) -> None:
        cleaned = self._clean(text)
        if not cleaned:
            return
        self._engine.say(cleaned)
        self._engine.runAndWait()

    def stop(self) -> None:
        try:
            self._engine.stop()
        except Exception:
            pass
