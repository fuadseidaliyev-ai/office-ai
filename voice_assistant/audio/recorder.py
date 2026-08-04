"""Microphone capture with voice-activity detection (VAD).

Records a single spoken utterance: it waits for the user to start talking,
then keeps recording until it detects a stretch of silence, which marks the
end of the command.
"""

from __future__ import annotations

import collections
import queue

import numpy as np

SAMPLE_RATE = 16_000          # Whisper + webrtcvad both expect 16 kHz
FRAME_MS = 30                 # webrtcvad accepts 10/20/30 ms frames
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000


class Recorder:
    """Capture one utterance at a time from the default input device."""

    def __init__(self, aggressiveness: int = 2, silence_timeout: float = 1.0):
        import sounddevice as sd  # imported lazily so the module loads without audio deps
        import webrtcvad

        self._sd = sd
        self._vad = webrtcvad.Vad(aggressiveness)
        self._silence_frames = int(silence_timeout * 1000 / FRAME_MS)
        # ~300 ms of pre-speech padding so we don't clip the first word.
        self._pad_frames = int(300 / FRAME_MS)

    def _frames(self, q: "queue.Queue[bytes]"):
        while True:
            yield q.get()

    def listen(self) -> np.ndarray | None:
        """Block until one utterance is captured. Returns float32 mono audio,
        or None if nothing was said."""
        q: "queue.Queue[bytes]" = queue.Queue()

        def callback(indata, _frames, _time, status):  # noqa: ANN001
            if status:
                # Overflow/underflow — log to stderr but keep going.
                print(f"[audio] {status}", flush=True)
            q.put(bytes(indata))

        ring = collections.deque(maxlen=self._pad_frames)
        triggered = False
        voiced: list[bytes] = []
        num_silent = 0

        with self._sd.RawInputStream(
            samplerate=SAMPLE_RATE,
            blocksize=FRAME_SAMPLES,
            dtype="int16",
            channels=1,
            callback=callback,
        ):
            for frame in self._frames(q):
                if len(frame) != FRAME_SAMPLES * 2:
                    continue
                is_speech = self._vad.is_speech(frame, SAMPLE_RATE)

                if not triggered:
                    ring.append(frame)
                    if is_speech:
                        triggered = True
                        voiced.extend(ring)
                        ring.clear()
                else:
                    voiced.append(frame)
                    num_silent = num_silent + 1 if not is_speech else 0
                    if num_silent > self._silence_frames:
                        break

        if not voiced:
            return None

        pcm = b"".join(voiced)
        audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        return audio
