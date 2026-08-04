"""Main loops.

Two ways to talk to the same agent:
- voice mode:  listen -> transcribe -> think -> speak   (needs a mic/speakers)
- text  mode:  type   ->            think -> print/speak (works anywhere)
"""

from __future__ import annotations

from .agent import VoiceAgent
from .config import Config

EXIT_PHRASES = {"exit", "quit", "stop listening", "goodbye", "выход", "стоп"}


def _is_exit(text: str) -> bool:
    return text.lower().strip(" .!?") in EXIT_PHRASES


class Assistant:
    def __init__(self, config: Config):
        self._config = config

    def _passes_wake_word(self, text: str) -> tuple[bool, str]:
        """If a wake word is configured, require it and strip it from the command."""
        wake = self._config.wake_word
        if not wake:
            return True, text
        lowered = text.lower()
        if wake in lowered:
            idx = lowered.find(wake) + len(wake)
            return True, text[idx:].strip(" ,.!?")
        return False, text

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

        print("🎙️  Voice assistant ready. Speak — say 'goodbye' to quit.")
        if self._config.wake_word:
            print(f"    (wake word: '{self._config.wake_word}')")

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

                triggered, command = self._passes_wake_word(text)
                if not triggered or not command:
                    continue

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
