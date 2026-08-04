# One-command setup + launch for the voice assistant (Windows PowerShell).
# Usage:  powershell -ExecutionPolicy Bypass -File run.ps1
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Say($m) { Write-Host "`n$m" -ForegroundColor Cyan }

# 1. System audio libraries: not needed on Windows (bundled with the wheels).
Say "1/4  System audio libraries: nothing to install on Windows."

# 2. Python environment + dependencies
Say "2/4  Setting up the Python environment..."
if (-not (Test-Path ".venv")) { python -m venv .venv }
& .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip | Out-Null
pip install -r requirements.txt

# 3. API key
Say "3/4  Checking your Anthropic API key..."
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }
$line = Select-String -Path ".env" -Pattern '^ANTHROPIC_API_KEY=(.*)$'
$current = if ($line) { $line.Matches[0].Groups[1].Value } else { "" }
if ($current -eq "" -or $current -like "sk-ant-...*") {
    $key = Read-Host "🔑  Paste your Anthropic API key (from https://console.anthropic.com)"
    $content = Get-Content ".env" -Raw
    if ($content -match '(?m)^ANTHROPIC_API_KEY=.*$') {
        $content = [regex]::Replace($content, '(?m)^ANTHROPIC_API_KEY=.*$', "ANTHROPIC_API_KEY=$key")
    } else {
        $content += "`nANTHROPIC_API_KEY=$key`n"
    }
    Set-Content ".env" $content
    Write-Host "Saved to .env"
} else {
    Write-Host "API key already set."
}

# 4. Launch
Say "4/4  Starting the assistant - say <<privet jarvis>> 🎙️"
python -m voice_assistant
