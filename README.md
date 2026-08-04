# 🎙️ Office AI — Voice Assistant

A hands-free voice assistant that can actually **operate your computer**. You
speak; it listens, thinks, runs real tools on your machine (files, shell
commands, the web), and answers out loud.

The "brain" is the **[Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview)** —
the same agent loop that powers Claude Code. That's what gives the assistant
system access: the SDK's built-in `Bash`, `Read`, `Write`, `Edit`, `Glob`,
`Grep`, `WebFetch` and `WebSearch` tools, plus a few custom ones defined here.

```
   🎤 mic ──► VAD ──► Whisper (STT) ──► Claude Agent SDK ──► pyttsx3 (TTS) ──► 🔊
              │         (local)          │   tools:                (local)
       end-of-speech                     │   Bash / Read / Write / Edit
       detection                         │   Glob / Grep / WebFetch / WebSearch
                                         │   current_time / system_info
                                         │   open_path / notify
```

Everything except the Claude API call runs **locally and offline** — your voice
never leaves the machine for transcription or speech.

## What it can do

- *"What time is it and what's my disk usage?"* → answers out loud.
- *"Open my Downloads folder."* → launches the file manager.
- *"Create a file called notes.txt on my desktop with today's todo list."*
- *"Find every TODO in my project and summarize them."*
- *"Search the web for the weather in Baku and tell me if I need a jacket."*

## Requirements

- Python 3.10+
- An **`ANTHROPIC_API_KEY`** (from the [Anthropic Console](https://console.anthropic.com/))
- A working microphone and speakers
- System audio libraries for `sounddevice` (PortAudio):
  - **macOS:** `brew install portaudio`
  - **Debian/Ubuntu:** `sudo apt-get install portaudio19-dev`
  - **Windows:** bundled with the `sounddevice` wheel — nothing extra
- `pyttsx3` voice backend:
  - **macOS:** built-in (NSSpeechSynthesizer)
  - **Linux:** `sudo apt-get install espeak-ng` (use `espeak-ng`, not the older `espeak`, which breaks pyttsx3's voice setup)
  - **Windows:** built-in (SAPI5)

## Install

```bash
git clone <this-repo> office-ai && cd office-ai
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env        # then edit .env and add your ANTHROPIC_API_KEY
```

## Run

```bash
python -m voice_assistant
```

Start talking. Say **"goodbye"** (or `Ctrl-C`) to quit. The first run downloads
the Whisper model, so give it a moment.

### Text mode (no microphone needed)

To try it without audio — or on a machine with no mic/speakers — type your
commands instead of speaking:

```bash
python -m voice_assistant --text          # type commands, printed replies
python -m voice_assistant --text --speak  # type commands, spoken replies
```

Same agent, same system access — only the input/output changes. Type `exit` to
quit.

## Configuration

All settings live in `.env` (see `.env.example` for the full list). The ones you'll
most likely touch:

| Variable | What it does | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Your API key (required) | — |
| `ASSISTANT_MODEL` | Claude model to use | `claude-sonnet-5` |
| `ASSISTANT_PERMISSION_MODE` | How much it can do without asking | `acceptEdits` |
| `ASSISTANT_WORKDIR` | Directory it operates in | your home dir |
| `WAKE_WORD` | Only act after this word (e.g. `computer`) | *(off)* |
| `WHISPER_MODEL` | STT accuracy vs. speed (`tiny`…`large-v3`) | `base` |
| `STT_LANGUAGE` | Language hint (`en`, `ru`, …) | auto-detect |
| `SILENCE_TIMEOUT` | Seconds of silence that end a command | `1.0` |

## Safety / permissions

This assistant can run shell commands and modify files on your computer. The
`ASSISTANT_PERMISSION_MODE` setting controls how much freedom it has:

| Mode | Behavior |
| --- | --- |
| `plan` | Read-only. Plans but never changes anything. Safest for trying it out. |
| `default` | Asks before edits and commands. |
| `acceptEdits` | Auto-accepts file edits; still guarded on other tools. *(default)* |
| `bypassPermissions` | Runs everything without asking. Convenient, but only use it in a directory you trust it in. |

Recommendations:

- Point **`ASSISTANT_WORKDIR`** at a specific project folder to scope what it
  touches, rather than leaving it at your whole home directory.
- Start in `plan` mode to get a feel for how it interprets your requests.
- For tighter control, add a `can_use_tool` permission callback in
  `voice_assistant/agent.py` — the SDK supports allow/deny decisions per tool
  call (e.g. block any `Bash` command containing `rm -rf`).

## Project layout

```
voice_assistant/
├── __main__.py        # entry point (python -m voice_assistant)
├── config.py          # settings loaded from .env
├── assistant.py       # the listen → transcribe → think → speak loop
├── agent.py           # Claude Agent SDK session + system access
├── tools.py           # custom tools (current_time, system_info, open_path, notify)
└── audio/
    ├── recorder.py    # mic capture + voice-activity detection
    ├── stt.py         # faster-whisper transcription
    └── tts.py         # pyttsx3 speech synthesis
```

## How the system access works

`agent.py` opens a single long-lived `ClaudeSDKClient` session (so the
assistant remembers the conversation) and hands it:

- the built-in system tools via `allowed_tools`,
- our custom tools via an in-process MCP server (`create_sdk_mcp_server`),
- a `permission_mode` and `cwd` that bound what it can do and where.

Each spoken command becomes a `client.query(...)`; the agent loop may call
several tools before producing its final spoken answer, which we stream back
out through text-to-speech.

## Extending it

Add a new capability by writing a tool in `voice_assistant/tools.py`:

```python
@tool("play_music", "Start playing music.", {"genre": str})
async def play_music(args: dict) -> dict:
    ...  # do the thing
    return {"content": [{"type": "text", "text": "Playing jazz."}]}
```

then add `"mcp__system__play_music"` to `CUSTOM_TOOL_NAMES`. That's it — the
assistant can now call it by voice.
