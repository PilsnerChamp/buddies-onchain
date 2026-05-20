# Remove the buddy-onchain statusline badge from Claude Code settings.json.
#
# Only statusLine commands containing a buddy-statusline script are removed.
# Foreign statuslines are left untouched.

param()

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

# Config dir resolution: CLAUDE_CONFIG_DIR -> USERPROFILE\.claude -> $HOME\.claude.
$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) {
    $env:CLAUDE_CONFIG_DIR
} elseif ($env:USERPROFILE) {
    Join-Path $env:USERPROFILE ".claude"
} else {
    Join-Path $HOME ".claude"
}

$Settings = Join-Path $ClaudeDir "settings.json"

try {
    if (-not (Test-Path -LiteralPath $Settings)) {
        Write-Host "buddy-onchain statusline not installed"
        exit 0
    }

    $Item = Get-Item -LiteralPath $Settings -Force
    if ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Fail "Refusing symlinked settings.json: $Settings" 2
    }
    if ($Item.Length -gt 65536) {
        Fail "settings.json is too large to patch safely: $Settings" 2
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

    if ($HasStatusLine -and (Test-BuddyStatusLineCommand $Command)) {
        $SettingsObject.PSObject.Properties.Remove("statusLine")
        $Json = $SettingsObject | ConvertTo-Json -Depth 20
        Set-Content -LiteralPath $Settings -Value ($Json + "`n") -NoNewline
        Write-Host "buddy-onchain statusline removed"
        exit 0
    }

    Write-Host "buddy-onchain statusline not installed"
    exit 0
} catch {
    Fail "Failed to patch $Settings`: $($_.Exception.Message)" 2
}
