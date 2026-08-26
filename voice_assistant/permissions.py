"""A safety guard that blocks dangerous operations before they run.

It is wired in as a **PreToolUse hook**, which fires on *every* tool call in
*every* permission mode — including ``bypassPermissions``. (A ``can_use_tool``
callback would be skipped under ``bypassPermissions``, so it can't be the
backstop we want here.)

The guard does two things:

1. Refuses shell commands that match known-catastrophic patterns
   (wiping the disk, fork bombs, formatting drives, shutting the machine down,
   piping the internet straight into a shell, privilege escalation, …).
2. Optionally confines file writes/edits to the configured working directory,
   so the assistant can't modify files elsewhere on the system.

Read-only tools (Read/Glob/Grep) and everything else are allowed through.

Honesty about the limits: a shell is powerful, and regex-matching Bash is
best-effort, not a security boundary. The write-confinement heuristics catch
the obvious escapes (``>``, ``tee``, ``dd of=``) but not every one (e.g.
``python -c 'open("/etc/x","w")'``). For a hard guarantee, set
``ASSISTANT_ALLOW_SHELL=false`` to drop the Bash tool entirely, and/or run the
assistant as a dedicated low-privilege user or inside a container.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

# Patterns that should never run, with a human-readable reason.
DANGEROUS_COMMANDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\brm\s+(-[a-z]*\s+)*-?[rf][rf]?\b.*(\s|^)(/|~|\$HOME|/\*|\.\s*$)"),
     "recursive delete of a root/home path"),
    (re.compile(r":\s*\(\s*\)\s*\{.*\|.*&\s*\}"), "fork bomb"),
    (re.compile(r"\bmkfs(\.\w+)?\b"), "formatting a filesystem"),
    (re.compile(r"\bdd\b.*\bof=/dev/"), "raw write to a block device"),
    (re.compile(r">\s*/dev/(sd|nvme|hd|mmcblk|disk)"), "overwriting a block device"),
    (re.compile(r"\b(shutdown|reboot|halt|poweroff)\b"), "powering the machine off"),
    (re.compile(r"\binit\s+[06]\b"), "changing runlevel (shutdown/reboot)"),
    (re.compile(r"\b(chmod|chown)\s+-[a-z]*R[a-z]*\s+.*\s/(?:\s|$)"),
     "recursive permission change on /"),
    (re.compile(r"(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b"),
     "piping a download straight into a shell"),
    (re.compile(r"\bsudo\b"), "privilege escalation with sudo"),
    (re.compile(r">\s*/(etc|boot|sys|proc)/"), "writing into a system directory"),
    (re.compile(r"\b(fdisk|parted|wipefs)\b"), "partitioning/wiping a disk"),
]

# Tools that write to disk, and where the target path lives in their input.
WRITE_TOOLS = {
    "Write": "file_path",
    "Edit": "file_path",
    "MultiEdit": "file_path",
    "NotebookEdit": "notebook_path",
}

# Character devices it's fine to "write" to (redirects like 2>/dev/null).
_DEV_WHITELIST = {"/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty", "/dev/fd"}


def _bash_write_targets(command: str) -> list[str]:
    """Best-effort extraction of paths a shell command writes to.

    Covers the common cases (``> file``, ``>> file``, ``tee file``,
    ``dd of=file``). This is a heuristic, not a sandbox — see the module docs.
    """
    targets: list[str] = []
    # Output redirections: >, >>, 1>, 2>>, ... (ignore fd dups like >&1).
    for m in re.finditer(r"\d*>>?\s*(?!&)(\"?)([^\s\"';|&<>]+)\1", command):
        if m.group(2):
            targets.append(m.group(2))
    # tee [-a] FILE...
    for m in re.finditer(r"\btee\b((?:\s+-\w+)*)\s+(.+?)(?:[|;<>]|&&|$)", command):
        targets.extend(
            t for t in m.group(2).split() if t and not t.startswith("-")
        )
    # dd of=FILE
    targets.extend(re.findall(r"\bof=([^\s;|&]+)", command))
    return targets


class PermissionGuard:
    def __init__(self, workdir: Path, confine_writes: bool = True):
        self._workdir = workdir.resolve()
        self._confine_writes = confine_writes

    def _within_workdir(self, path_str: str) -> bool:
        p = Path(path_str)
        if not p.is_absolute():
            p = self._workdir / p
        try:
            resolved = p.resolve()
        except Exception:
            return False
        return resolved == self._workdir or self._workdir in resolved.parents

    def check(self, tool_name: str, tool_input: dict[str, Any]) -> str | None:
        """Return a denial reason if the call is unsafe, else None."""
        if tool_name == "Bash":
            command = str(tool_input.get("command", ""))
            for pattern, reason in DANGEROUS_COMMANDS:
                if pattern.search(command):
                    return f"{reason}"
            # Best-effort: catch shell writes that escape the working directory.
            if self._confine_writes:
                for target in _bash_write_targets(command):
                    if target in _DEV_WHITELIST:
                        continue
                    if not self._within_workdir(target):
                        return (
                            f"shell command writes to '{target}', outside the "
                            f"working directory ({self._workdir})"
                        )

        if self._confine_writes and tool_name in WRITE_TOOLS:
            target = tool_input.get(WRITE_TOOLS[tool_name], "")
            if target and not self._within_workdir(str(target)):
                return (
                    f"writing outside the working directory ({self._workdir}) "
                    "is not allowed"
                )
        return None

    async def pre_tool_use_hook(
        self,
        input_data: dict[str, Any],
        tool_use_id: str | None,  # noqa: ARG002
        context: Any,  # noqa: ARG002
    ) -> dict[str, Any]:
        """PreToolUse hook: deny unsafe calls, allow everything else."""
        reason = self.check(
            input_data.get("tool_name", ""),
            input_data.get("tool_input", {}) or {},
        )
        if reason:
            return {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": f"Blocked for safety: {reason}.",
                }
            }
        return {}
