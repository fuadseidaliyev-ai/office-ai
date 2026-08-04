"""Extra in-process tools exposed to the agent on top of the built-in
Bash / Read / Write / Edit / Glob / Grep tools.

These are small, cross-platform conveniences that a voice assistant tends to
need. They run in the same Python process via an in-process MCP server, so
there is no subprocess overhead.
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from datetime import datetime

from claude_agent_sdk import create_sdk_mcp_server, tool


def _text(text: str) -> dict:
    return {"content": [{"type": "text", "text": text}]}


@tool("current_time", "Get the current local date and time.", {})
async def current_time(_args: dict) -> dict:
    now = datetime.now().astimezone()
    return _text(now.strftime("%A, %d %B %Y, %H:%M:%S %Z"))


@tool("system_info", "Report OS, machine and Python details of this computer.", {})
async def system_info(_args: dict) -> dict:
    info = {
        "os": f"{platform.system()} {platform.release()}",
        "machine": platform.machine(),
        "hostname": platform.node(),
        "python": platform.python_version(),
    }
    return _text("\n".join(f"{k}: {v}" for k, v in info.items()))


@tool(
    "open_path",
    "Open a file, folder or URL in the user's default application (like double-clicking it).",
    {"target": str},
)
async def open_path(args: dict) -> dict:
    target = args["target"]
    system = platform.system()
    try:
        if system == "Darwin":
            subprocess.Popen(["open", target])
        elif system == "Windows":
            subprocess.Popen(["cmd", "/c", "start", "", target], shell=False)
        else:  # Linux / BSD
            opener = shutil.which("xdg-open") or "xdg-open"
            subprocess.Popen([opener, target])
        return _text(f"Opened: {target}")
    except Exception as exc:  # noqa: BLE001
        return _text(f"Could not open {target}: {exc}")


@tool(
    "notify",
    "Show a desktop notification to the user.",
    {"title": str, "message": str},
)
async def notify(args: dict) -> dict:
    title, message = args["title"], args["message"]
    system = platform.system()
    try:
        if system == "Darwin":
            script = f'display notification "{message}" with title "{title}"'
            subprocess.Popen(["osascript", "-e", script])
        elif system == "Windows":
            ps = (
                "[reflection.assembly]::loadwithpartialname('System.Windows.Forms');"
                "[reflection.assembly]::loadwithpartialname('System.Drawing');"
                "$n=New-Object System.Windows.Forms.NotifyIcon;"
                "$n.Icon=[System.Drawing.SystemIcons]::Information;"
                "$n.Visible=$true;"
                f"$n.ShowBalloonTip(5000,'{title}','{message}',[System.Windows.Forms.ToolTipIcon]::Info)"
            )
            subprocess.Popen(["powershell", "-Command", ps])
        elif shutil.which("notify-send"):
            subprocess.Popen(["notify-send", title, message])
        else:
            print(f"[notify] {title}: {message}", file=sys.stderr)
        return _text("Notification sent.")
    except Exception as exc:  # noqa: BLE001
        return _text(f"Could not send notification: {exc}")


def build_tools_server():
    """Create the in-process MCP server that hosts the custom tools."""
    return create_sdk_mcp_server(
        name="system",
        version="1.0.0",
        tools=[current_time, system_info, open_path, notify],
    )


# Tool names as the agent must reference them in `allowed_tools`.
CUSTOM_TOOL_NAMES = [
    "mcp__system__current_time",
    "mcp__system__system_info",
    "mcp__system__open_path",
    "mcp__system__notify",
]
