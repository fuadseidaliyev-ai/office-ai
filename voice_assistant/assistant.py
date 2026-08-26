"""Main loops.

Two ways to talk to the same agent:
- voice mode:  listen -> transcribe -> think -> speak   (needs a mic/speakers)
- text  mode:  type   ->            think -> print/speak (works anywhere)
"""

from __future__ import annotations

from .agent import VoiceAgent
from .config import Config
from .wake import WakeDetector

EXIT_PHRASES = {"exit", "quit", "stop listening", "goodbye", "выход", "стоп"}

# Spoken when woken by the wake word alone, before the command is given.
WAKE_ACK = "Да, слушаю."


def _is_exit(text: str) -> bool:
    return text.lower().strip(" .!?") in EXIT_PHRASES


class Assistant:
    def __init__(self, config: Config):
        self._config = config

    # ---------------------------------------------------------------- voice --
    async def run(self) -> None:
        # Audio deps are imported/instantiated lazily so text mode never needs them.
        from .audio import Recorder, Speaker, Transcriber

        recorder = Recorder(
            aggressiveness=self._config.vad_aggressiveness,
            silence_timeout=self._config.silence_timeout,
        )
        stt = Transcriber(
            model=self._config.whisper_model,
            device=self._config.whisper_device,
            language=self._config.stt_language,
        )
        tts = Speaker(rate=self._config.tts_rate)

        detector = (
            WakeDetector(self._config.wake_word) if self._config.wake_word else None
        )
        awaiting_command = False  # True after the wake word, waiting for the command

        print("🎙️  Voice assistant ready. Say 'goodbye' to quit.")
        if detector:
            print(f"    Sleeping — say '{self._config.wake_word}' to wake me.")

        async with VoiceAgent(self._config) as agent:
            while True:
                audio = recorder.listen()
                if audio is None:
                    continue

                text = stt.transcribe(audio)
                if not text:
                    continue
                print(f"👤 {text}")

                if _is_exit(text):
                    tts.say("Goodbye.")
                    break

                # Wake-word gating.
                if detector and not awaiting_command:
                    woken, remainder = detector.detect(text)
                    if not woken:
                        continue  # stay dormant
                    if not remainder:
                        # Just the wake word — acknowledge and wait for the command.
                        print("🤖 (awake) Да, слушаю.")
                        tts.say(WAKE_ACK)
                        awaiting_command = True
                        continue
                    command = remainder
                else:
                    command = text

                awaiting_command = False  # consume the activation

                try:
                    reply = await agent.ask(command)
                except Exception as exc:  # noqa: BLE001
                    print(f"[agent error] {exc}")
                    tts.say("Sorry, something went wrong.")
                    continue

                if reply:
                    print(f"🤖 {reply}")
                    tts.say(reply)

    # ----------------------------------------------------------------- text --
    async def run_text(self, speak: bool = False) -> None:
        """Keyboard-driven loop. No mic or Whisper needed. Optionally speak replies."""
        tts = None
        if speak:
            from .audio import Speaker

            tts = Speaker(rate=self._config.tts_rate)

        print("⌨️  Text assistant ready. Type a command — 'exit' to quit.")

        async with VoiceAgent(self._config) as agent:
            while True:
                try:
                    text = input("👤 ").strip()
                except (EOFError, KeyboardInterrupt):
                    print()
                    break
                if not text:
                    continue
                if _is_exit(text):
                    break

                try:
                    reply = await agent.ask(text)
                except Exception as exc:  # noqa: BLE001
                    print(f"[agent error] {exc}")
                    continue

                if reply:
                    print(f"🤖 {reply}")
                    if tts is not None:
                        tts.say(reply)
