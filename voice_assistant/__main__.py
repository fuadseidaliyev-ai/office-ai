"""Entry point: `python -m voice_assistant [--text] [--speak]`."""

from __future__ import annotations

import argparse

import anyio

from .assistant import Assistant
from .config import Config


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="voice_assistant",
        description="A voice assistant with system access, built on the Claude Agent SDK.",
    )
    parser.add_argument(
        "--text",
        action="store_true",
        help="Type commands instead of speaking (no microphone or Whisper needed).",
    )
    parser.add_argument(
        "--speak",
        action="store_true",
        help="In --text mode, also speak the replies out loud.",
    )
    args = parser.parse_args()

    config = Config.load()
    config.validate()

    assistant = Assistant(config)
    try:
        if args.text:
            anyio.run(assistant.run_text, args.speak)
        else:
            anyio.run(assistant.run)
    except KeyboardInterrupt:
        print("\n👋 Stopped.")


if __name__ == "__main__":
    main()
