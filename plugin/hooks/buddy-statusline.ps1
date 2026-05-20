# buddy-onchain statusline badge for Claude Code on Windows.
#
# Reads only the cached buddy state. It never calls the chain or plugin SDK.
# Missing, malformed, oversized, or reparse-point state silently renders
# nothing.

# Config dir resolution: CLAUDE_CONFIG_DIR -> USERPROFILE\.claude -> $HOME\.claude.
$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) {
    $env:CLAUDE_CONFIG_DIR
} elseif ($env:USERPROFILE) {
    Join-Path $env:USERPROFILE ".claude"
} else {
    Join-Path $HOME ".claude"
}

$State = Join-Path $ClaudeDir "plugins\buddy-onchain\.buddy-state"

try {
    if (-not (Test-Path -LiteralPath $State -PathType Leaf)) { exit 0 }

    $Item = Get-Item -LiteralPath $State -Force -ErrorAction Stop
    if ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { exit 0 }
    if ($Item.Length -gt 8192) { exit 0 }

    $Stream = [System.IO.File]::OpenRead($State)
    try {
        $Buffer = New-Object byte[] 8192
        $Count = $Stream.Read($Buffer, 0, 8192)
    } finally {
        $Stream.Close()
    }

    $Text = [System.Text.Encoding]::UTF8.GetString($Buffer, 0, $Count)
    $Text = [regex]::Replace($Text, '[\x00-\x1F]', '')
} catch {
    exit 0
}

if (-not ($Text.StartsWith('{') -and $Text.EndsWith('}'))) { exit 0 }

$ModeMatch = [regex]::Match($Text, '"mode"\s*:\s*"([^"]*)"')
$HatchMatch = [regex]::Match($Text, '"hatch"\s*:\s*"([^"]*)"')
if (-not ($ModeMatch.Success -and $HatchMatch.Success)) { exit 0 }

$Mode = $ModeMatch.Groups[1].Value
$Hatch = $HatchMatch.Groups[1].Value

$ValidMode = @('off', 'lite', 'full')
$ValidHatch = @('unknown', 'cold', 'warm')
if (-not ($ValidMode -contains $Mode)) { exit 0 }
if (-not ($ValidHatch -contains $Hatch)) { exit 0 }

$EnvMode = ""
if ($env:BUDDY_MODE) {
    $EnvMode = ([regex]::Replace($env:BUDDY_MODE, '[\x00-\x1F]', '')).ToLowerInvariant()
}

$EffectiveMode = if ($ValidMode -contains $EnvMode) {
    $EnvMode
} else {
    $Mode
}

$Eyes = if ($Hatch -eq 'warm') {
    '@,@'
} elseif ($Hatch -eq 'cold' -or $Hatch -eq 'unknown') {
    '-,-'
} else {
    exit 0
}

$Esc = [char]27
[Console]::Write("${Esc}[34m[${Eyes}:${EffectiveMode}]${Esc}[0m")
