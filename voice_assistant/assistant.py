"""Main loop: listen -> transcribe -> think (agent) -> speak. Repeat."""

from __future__ import annotations

from .agent import VoiceAgent
from .audio import Recorder, Speaker, Transcriber
from .config import Config

EXIT_PHRASES = {"exit", "quit", "stop listening", "goodbye", "выход", "стоп"}


class Assistant:
    def __init__(self, config: Config):
        self._config = config
        self._recorder = Recorder(
            aggressiveness=config.vad_aggressiveness,
            silence_timeout=config.silence_timeout,
        )
        self._stt = Transcriber(
            model=config.whisper_model,
            device=config.whisper_device,
            language=config.stt_language,
        )
        self._tts = Speaker(rate=config.tts_rate)

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

    async def run(self) -> None:
        print("🎙️  Voice assistant ready. Speak — say 'goodbye' to quit.")
        if self._config.wake_word:
            print(f"    (wake word: '{self._config.wake_word}')")

        async with VoiceAgent(self._config) as agent:
            while True:
                audio = self._recorder.listen()
                if audio is None:
                    continue

                text = self._stt.transcribe(audio)
                if not text:
                    continue
                print(f"👤 {text}")

                if text.lower().strip(" .!?") in EXIT_PHRASES:
                    self._tts.say("Goodbye.")
                    break

                triggered, command = self._passes_wake_word(text)
                if not triggered:
                    continue
                if not command:
                    continue

                try:
                    reply = await agent.ask(command)
                except Exception as exc:  # noqa: BLE001
                    print(f"[agent error] {exc}")
                    self._tts.say("Sorry, something went wrong.")
                    continue

                if reply:
                    print(f"🤖 {reply}")
                    self._tts.say(reply)
