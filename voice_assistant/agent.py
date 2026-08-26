"""Thin wrapper around the Claude Agent SDK.

This is where the assistant gets *access to your system*: it enables the
SDK's built-in Bash / Read / Write / Edit / Glob / Grep tools plus our custom
system tools, and keeps a single multi-turn session so the assistant remembers
the conversation.
"""

from __future__ import annotations

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    HookMatcher,
    ResultMessage,
    TextBlock,
)

from .config import Config
from .permissions import PermissionGuard
from .tools import CUSTOM_TOOL_NAMES, build_tools_server

# Built-in tools that grant real access to the machine.
BUILTIN_TOOLS = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch"]

SYSTEM_PROMPT = """You are a hands-free voice assistant with full access to the \
user's computer through your tools. You are spoken to and you answer out loud, \
so keep replies short, natural and conversational — a sentence or two, no \
markdown, no bullet lists, no code blocks read aloud.

When the user asks you to *do* something on the machine (open apps, manage \
files, run commands, check things), use your tools to actually do it, then \
confirm briefly what you did. When asked a question, answer directly. If a \
request is ambiguous or destructive, ask one short clarifying question before \
acting. Never read long file contents or command output aloud verbatim — \
summarize the result in one breath."""


class VoiceAgent:
    """Owns one long-lived ClaudeSDKClient session."""

    def __init__(self, config: Config):
        self._config = config
        self._client: ClaudeSDKClient | None = None

    def _build_options(self) -> ClaudeAgentOptions:
        guard = PermissionGuard(
            self._config.workdir,
            confine_writes=self._config.confine_writes,
        )
        # A hard boundary: dropping Bash removes the biggest way to escape the
        # write-confinement heuristics (shell redirects, cp, python -c, ...).
        tools = list(BUILTIN_TOOLS)
        if not self._config.allow_shell:
            tools.remove("Bash")
        return ClaudeAgentOptions(
            system_prompt={
                "type": "preset",
                "preset": "claude_code",
                "append": SYSTEM_PROMPT,
            },
            allowed_tools=tools + CUSTOM_TOOL_NAMES,
            permission_mode=self._config.permission_mode,
            model=self._config.model,
            cwd=str(self._config.workdir),
            mcp_servers={"system": build_tools_server()},
            # PreToolUse fires in every permission mode (incl. bypassPermissions),
            # so the guard is a real backstop, not just an ask-first prompt.
            hooks={
                "PreToolUse": [HookMatcher(hooks=[guard.pre_tool_use_hook])],
            },
        )

    async def __aenter__(self) -> "VoiceAgent":
        self._client = ClaudeSDKClient(options=self._build_options())
        await self._client.__aenter__()
        return self

    async def __aexit__(self, *exc) -> None:
        if self._client is not None:
            await self._client.__aexit__(*exc)
            self._client = None

    async def ask(self, text: str) -> str:
        """Send one utterance, run the agent loop, return the spoken reply."""
        assert self._client is not None, "VoiceAgent must be used as a context manager"

        await self._client.query(text)

        spoken: list[str] = []
        async for message in self._client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock) and block.text.strip():
                        spoken.append(block.text.strip())
            elif isinstance(message, ResultMessage):
                break

        return "\n".join(spoken).strip()
