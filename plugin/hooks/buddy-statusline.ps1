# buddy-onchain statusline badge for Claude Code on Windows.
#
# Reads only the cached buddy state. It never calls the chain or plugin SDK.
# Missing, malformed, oversized, or reparse-point state silently renders
# nothing.
#
# One write: it touches the badge heartbeat so `/buddy-onchain` can tell the
# badge participates in the live status bar (the rendered bar itself is TUI
# chrome nothing can read back). Touched before any state validation —
# heartbeat means "this script runs in the statusline loop", not "badge
# visible". Best-effort; a reparse-point or non-file heartbeat is never
# touched.

# Config dir resolution: CLAUDE_CONFIG_DIR -> USERPROFILE\.claude -> $HOME\.claude.
$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) {
    $env:CLAUDE_CONFIG_DIR
} elseif ($env:USERPROFILE) {
    Join-Path $env:USERPROFILE ".claude"
} else {
    Join-Path $HOME ".claude"
}

$State = Join-Path $ClaudeDir "plugins\buddy-onchain\.buddy-state"
$Heartbeat = Join-Path $ClaudeDir "plugins\buddy-onchain\.badge-heartbeat"

# Every cmdlet in this block needs -ErrorAction Stop: try/catch only swallows
# TERMINATING errors, and a non-terminating failure (e.g. unwritable config
# dir) would print to stderr from the statusline — contract violation.
try {
    $HeartbeatDir = Split-Path -Parent $Heartbeat
    if (-not (Test-Path -LiteralPath $HeartbeatDir -ErrorAction Stop)) {
        New-Item -ItemType Directory -Path $HeartbeatDir -Force -ErrorAction Stop | Out-Null
    }
    # Refuse reparse points AND existing non-files (a directory would take
    # the mtime write but never satisfy the reader).
    $HeartbeatRefused = $false
    if (Test-Path -LiteralPath $Heartbeat -ErrorAction Stop) {
        $HeartbeatItem = Get-Item -LiteralPath $Heartbeat -Force -ErrorAction Stop
        $HeartbeatRefused = [bool]($HeartbeatItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or
            $HeartbeatItem.PSIsContainer
    }
    if (-not $HeartbeatRefused) {
        if (Test-Path -LiteralPath $Heartbeat -ErrorAction Stop) {
            (Get-Item -LiteralPath $Heartbeat -Force -ErrorAction Stop).LastWriteTimeUtc = [DateTime]::UtcNow
        } else {
            New-Item -ItemType File -Path $Heartbeat -Force -ErrorAction Stop | Out-Null
        }
    }
} catch {
    # Heartbeat is best-effort; badge rendering must not depend on it.
}

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
