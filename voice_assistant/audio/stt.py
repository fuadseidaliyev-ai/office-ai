"""Speech-to-text using faster-whisper (local, offline)."""

from __future__ import annotations

import numpy as np


class Transcriber:
    def __init__(self, model: str = "base", device: str = "cpu", language: str | None = None):
        from faster_whisper import WhisperModel

        compute_type = "int8" if device == "cpu" else "float16"
        self._model = WhisperModel(model, device=device, compute_type=compute_type)
        self._language = language

    def transcribe(self, audio: np.ndarray) -> str:
        """Turn 16 kHz float32 mono audio into text."""
        segments, _info = self._model.transcribe(
            audio,
            language=self._language,
            vad_filter=True,
            beam_size=5,
        )
        return " ".join(seg.text.strip() for seg in segments).strip()
