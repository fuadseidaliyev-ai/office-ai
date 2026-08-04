"""Entry point: `python -m voice_assistant`."""

from __future__ import annotations

import anyio

from .assistant import Assistant
from .config import Config


def main() -> None:
    config = Config.load()
    config.validate()
    try:
        anyio.run(Assistant(config).run)
    except KeyboardInterrupt:
        print("\n👋 Stopped.")


if __name__ == "__main__":
    main()
