"""Tests that the agent wires tools and the safety hook correctly."""

from __future__ import annotations

from pathlib import Path

from voice_assistant.agent import VoiceAgent
from voice_assistant.config import Config


def _config(tmp_path: Path, **overrides) -> Config:
    base = dict(
        api_key="test",
        model="claude-sonnet-5",
        permission_mode="acceptEdits",
        workdir=tmp_path,
        wake_word="",
        whisper_model="base",
        whisper_device="cpu",
        stt_language=None,
        vad_aggressiveness=2,
        silence_timeout=1.0,
        tts_rate=185,
        confine_writes=True,
        allow_shell=True,
    )
    base.update(overrides)
    return Config(**base)


def test_bash_present_when_shell_allowed(tmp_path):
    opts = VoiceAgent(_config(tmp_path, allow_shell=True))._build_options()
    assert "Bash" in opts.allowed_tools


def test_bash_dropped_when_shell_disallowed(tmp_path):
    opts = VoiceAgent(_config(tmp_path, allow_shell=False))._build_options()
    assert "Bash" not in opts.allowed_tools
    # the other built-ins survive
    assert "Read" in opts.allowed_tools
    assert "Write" in opts.allowed_tools


def test_custom_tools_are_allowed(tmp_path):
    opts = VoiceAgent(_config(tmp_path))._build_options()
    assert "mcp__system__current_time" in opts.allowed_tools
    assert "mcp__system__open_path" in opts.allowed_tools


def test_pretooluse_hook_registered(tmp_path):
    opts = VoiceAgent(_config(tmp_path))._build_options()
    assert opts.hooks is not None
    assert "PreToolUse" in opts.hooks
    matchers = opts.hooks["PreToolUse"]
    assert matchers and matchers[0].hooks, "expected a hook callback registered"


def test_workdir_and_mode_passed_through(tmp_path):
    opts = VoiceAgent(_config(tmp_path, permission_mode="plan"))._build_options()
    assert opts.cwd == str(tmp_path)
    assert opts.permission_mode == "plan"
