"""Wake-word detection: keep the assistant dormant until it hears its name.

Speech-to-text rarely spells a name the same way twice, so matching is
tolerant of the common ways "Джарвис" / "Jarvis" get transcribed. Detection is
name-based: whatever the last word of the configured wake phrase is, that name
(plus known Jarvis variants) is what activates the assistant.
"""

from __future__ import annotations

import re

# Common ways Whisper transcribes the name, across Russian and English audio.
_JARVIS_VARIANTS = {
    "джарвис", "жарвис", "джарвес", "джарвиз", "джервис",
    "дарвис", "джарвіс", "jarvis", "jervis",
}


def _normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


class WakeDetector:
    """Detects the wake name in an utterance and returns any trailing command."""

    def __init__(self, wake_word: str):
        norm = _normalize(wake_word)
        self.name = norm.split()[-1] if norm else ""
        variants = set(_JARVIS_VARIANTS)
        if self.name:
            variants.add(self.name)
        alternation = "|".join(
            re.escape(v) for v in sorted(variants, key=len, reverse=True)
        )
        self._re = re.compile(rf"\b(?:{alternation})\b")

    def detect(self, text: str) -> tuple[bool, str]:
        """Return (woken, command). `command` is whatever was said after the
        name, e.g. "привет джарвис открой папку" -> (True, "открой папку")."""
        norm = _normalize(text)
        match = self._re.search(norm)
        if not match:
            return False, ""
        return True, norm[match.end():].strip()
