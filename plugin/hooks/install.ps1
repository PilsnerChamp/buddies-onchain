# Install the buddy-onchain statusline badge into Claude Code settings.json.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File hooks\install.ps1
#   powershell -ExecutionPolicy Bypass -File hooks\install.ps1 -Force

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message, [int]$Code) {
    Write-Error -ErrorAction Continue -Message $Message
    exit $Code
}

function Get-StatusLineCommand($StatusLine) {
    if ($StatusLine -is [string]) {
        return $StatusLine
    }

    if ($null -ne $StatusLine -and $StatusLine.PSObject.Properties.Name -contains "command") {
        return [string]$StatusLine.command
    }

    return ""
}

function Test-BuddyStatusLineCommand([string]$Command) {
    return $Command.Contains("buddy-statusline.sh") -or $Command.Contains("buddy-statusline.ps1")
}

function Test-CurrentPlatformBinding([string]$Command) {
    return $Command.Contains("buddy-statusline.ps1")
}

# Config dir resolution: CLAUDE_CONFIG_DIR -> USERPROFILE\.claude -> $HOME\.claude.
$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) {
    $env:CLAUDE_CONFIG_DIR
} elseif ($env:USERPROFILE) {
    Join-Path $env:USERPROFILE ".claude"
} else {
    Join-Path $HOME ".claude"
}

$Settings = Join-Path $ClaudeDir "settings.json"
$StatuslinePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "buddy-statusline.ps1")).Path

try {
    if (-not (Test-Path -LiteralPath $ClaudeDir)) {
        New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null
    }

    if (Test-Path -LiteralPath $Settings) {
        $Item = Get-Item -LiteralPath $Settings -Force
        if ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            Fail "Refusing symlinked settings.json: $Settings" 2
        }
        if ($Item.Length -gt 65536) {
            Fail "settings.json is too large to patch safely: $Settings" 2
        }
    } else {
        Set-Content -LiteralPath $Settings -Value "{}" -NoNewline
    }

    $Raw = Get-Content -LiteralPath $Settings -Raw
    $SettingsObject = $Raw | ConvertFrom-Json
    $RawRoot = $Raw.Trim()
    if (-not ($RawRoot.StartsWith("{") -and $RawRoot.EndsWith("}")) -or $null -eq $SettingsObject) {
        Fail "settings.json must be a JSON object: $Settings" 2
    }
    if ($SettingsObject.PSObject.BaseObject -isnot [System.Management.Automation.PSCustomObject]) {
        Fail "settings.json must be a JSON object: $Settings" 2
    }

    $HasStatusLine = $SettingsObject.PSObject.Properties.Name -contains "statusLine"
    $Command = if ($HasStatusLine) {
        Get-StatusLineCommand $SettingsObject.statusLine
    } else {
        ""
    }

    if ($HasStatusLine -and (Test-CurrentPlatformBinding $Command)) {
        Write-Host "buddy-onchain statusline already installed"
        exit 0
    }

    $IsBuddyManaged = $HasStatusLine -and (Test-BuddyStatusLineCommand $Command)

    if ($HasStatusLine -and -not $IsBuddyManaged -and -not $Force) {
        Fail "Foreign statusline detected at $Settings; pass -Force to overwrite. Backup will be saved to $Settings.bak" 1
    }

    if ((Test-Path -LiteralPath $Settings) -and ($Force -or $IsBuddyManaged)) {
        Copy-Item -LiteralPath $Settings -Destination "$Settings.bak" -Force
    }

    $CommandText = "powershell -ExecutionPolicy Bypass -File `"$StatuslinePath`""
    if ($HasStatusLine) {
        $SettingsObject.PSObject.Properties.Remove("statusLine")
    }

    $SettingsObject | Add-Member -NotePropertyName "statusLine" -NotePropertyValue ([pscustomobject]@{
        type = "command"
        command = $CommandText
    })

    $Json = $SettingsObject | ConvertTo-Json -Depth 20
    Set-Content -LiteralPath $Settings -Value ($Json + "`n") -NoNewline
    Write-Host "buddy-onchain statusline installed at $Settings"
    exit 0
} catch {
    Fail "Failed to patch $Settings`: $($_.Exception.Message)" 2
}
