# One-command setup + launch for the voice assistant (Windows PowerShell).
#
# From inside the repo:  powershell -ExecutionPolicy Bypass -File run.ps1
# From anywhere (bootstraps itself — clones the repo first):
#   iwr -useb https://raw.githubusercontent.com/fuadseidaliyev-ai/office-ai/claude/voice-assistant-agent-sdk-biae9n/run.ps1 | iex
$ErrorActionPreference = "Stop"
if ($PSScriptRoot) { Set-Location -Path $PSScriptRoot }

function Say($m) { Write-Host "`n$m" -ForegroundColor Cyan }

# 0. Bootstrap: when run outside the repo (e.g. piped via iwr), fetch it first.
$Branch = "claude/voice-assistant-agent-sdk-biae9n"
if (-not (Test-Path "voice_assistant\__main__.py")) {
    Say "0/4  Fetching the project..."
    if (-not (Test-Path "office-ai\.git")) {
        git clone --branch $Branch https://github.com/fuadseidaliyev-ai/office-ai.git office-ai
    }
    Set-Location "office-ai"
    git checkout $Branch 2>$null | Out-Null
}

# 1. System audio libraries: not needed on Windows (bundled with the wheels).
Say "1/4  System audio libraries: nothing to install on Windows."

# 2. Python environment + dependencies
Say "2/4  Setting up the Python environment..."
if (-not (Test-Path ".venv")) { python -m venv .venv }
& .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip | Out-Null
pip install -r requirements.txt

# 3. Authentication: Claude subscription login (default) or API key
Say "3/4  Setting up authentication..."
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }

# Locate a Claude CLI: system-wide, or the one bundled inside the SDK package.
$cli = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $cli) {
    $cli = python -c "import claude_agent_sdk, pathlib; p = pathlib.Path(claude_agent_sdk.__file__).parent / '_bundled' / 'claude.exe'; print(p if p.exists() else '')"
    if (-not $cli) { $cli = $null }
}
function Test-CliLogin {
    if (-not $cli) { return $false }
    try { return ((& $cli auth status 2>$null | ConvertFrom-Json).loggedIn -eq $true) }
    catch { return $false }
}

$line = Select-String -Path ".env" -Pattern '^ANTHROPIC_API_KEY=(.*)$'
$current = if ($line) { $line.Matches[0].Groups[1].Value } else { "" }
if ($current -like "sk-ant-...*") { $current = "" }

if ($current -ne "") {
    Write-Host "Using the API key from .env."
} elseif (Test-CliLogin) {
    Write-Host "Using your Claude account login (subscription plan limit) - no API key needed."
} else {
    Write-Host ""
    Write-Host "How should the assistant authenticate?"
    Write-Host "  1) Claude subscription (Pro/Max) - sign in once in the browser, uses your plan limit  [default]"
    Write-Host "  2) API key from console.anthropic.com - pay-per-use"
    $choice = Read-Host "Choose 1 or 2 and press Enter"
    if ($choice -eq "2") {
        $key = Read-Host "🔑  Paste your Anthropic API key"
        $content = Get-Content ".env" -Raw
        if ($content -match '(?m)^ANTHROPIC_API_KEY=.*$') {
            $content = [regex]::Replace($content, '(?m)^ANTHROPIC_API_KEY=.*$', "ANTHROPIC_API_KEY=$key")
        } else {
            $content += "`nANTHROPIC_API_KEY=$key`n"
        }
        Set-Content ".env" $content
        Write-Host "Saved to .env"
    } else {
        if (-not $cli) { Write-Host "Claude CLI not found after pip install - unexpected." -ForegroundColor Yellow; exit 1 }
        Write-Host "A browser window will open - sign in with your Claude account..."
        & $cli auth login
        if (-not (Test-CliLogin)) { Write-Host "Login did not complete; re-run this script." -ForegroundColor Yellow; exit 1 }
        Write-Host "Signed in - the assistant will use your subscription's usage limit."
    }
}

# 4. Launch
Say "4/4  Starting the assistant - say <<privet jarvis>> 🎙️"
python -m voice_assistant
