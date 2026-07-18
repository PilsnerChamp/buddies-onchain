# buddy-onchain statusline badge for Claude Code on Windows.
#
# Reads only the cached buddy state. It never calls the chain or plugin SDK.
# Missing, malformed, oversized, or reparse-point state silently renders
# nothing.
#
# Heartbeat writes: it touches the global badge heartbeat AND a per-project
# one (project dir parsed from the statusline stdin payload) so
# `/buddy-onchain` and SessionStart can tell the badge participates in the
# live status bar — globally and in this specific project (the rendered bar
# itself is TUI chrome nothing can read back). Touched before any state
# validation — heartbeat means "this script runs in the statusline loop",
# not "badge visible". Best-effort; a reparse-point or non-file heartbeat is
# never touched.

# Config dir resolution: CLAUDE_CONFIG_DIR -> USERPROFILE\.claude -> $HOME\.claude.
$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) {
    $env:CLAUDE_CONFIG_DIR
} elseif ($env:USERPROFILE) {
    Join-Path $env:USERPROFILE ".claude"
} else {
    Join-Path $HOME ".claude"
}

$DataDir = Join-Path $ClaudeDir "plugins\buddy-onchain"
$State = Join-Path $DataDir ".buddy-state"

# Every cmdlet in this block needs -ErrorAction Stop: try/catch only swallows
# TERMINATING errors, and a non-terminating failure (e.g. unwritable config
# dir) would print to stderr from the statusline — contract violation.
function Touch-BuddyHeartbeat([string]$Heartbeat) {
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
}

Touch-BuddyHeartbeat (Join-Path $DataDir ".badge-heartbeat")

# Per-project heartbeat. Claude Code pipes a JSON payload on stdin;
# `workspace.project_dir` here and `CLAUDE_PROJECT_DIR` in the plugin's hook
# process carry the same directory string, and both sides key it the same
# way: first 16 hex chars of sha256 (plugin-paths.ts::projectBadgeHeartbeatPath).
# Best-effort — no stdin or an unparseable payload just skips the touch; the
# global heartbeat above already fired.
try {
    $ProjectDir = ""
    if ([Console]::IsInputRedirected) {
        # Raw bytes + explicit UTF-8 decode — [Console]::In decodes with the
        # legacy console code page under Windows PowerShell 5.1, which
        # mangles non-ASCII paths into a different hash than the Node reader
        # computes. Bounded to 1 MiB like the POSIX script's `head -c`; a
        # buffer filled to the cap means truncation, and truncated JSON must
        # not reach ConvertFrom-Json (it would reject the document and drop
        # the project heartbeat even though project_dir was present).
        # Assumes the writer closes stdin (Claude Code does); a composition
        # wrapper that holds the pipe open would stall this read until the
        # statusline runner cancels the render.
        $StdinCap = 1048576
        $StdinStream = [Console]::OpenStandardInput()
        $StdinBuffer = New-Object byte[] $StdinCap
        $StdinTotal = 0
        while ($StdinTotal -lt $StdinCap) {
            $StdinRead = $StdinStream.Read($StdinBuffer, $StdinTotal, $StdinCap - $StdinTotal)
            if ($StdinRead -le 0) { break }
            $StdinTotal += $StdinRead
        }
        $StdinText = ""
        if ($StdinTotal -lt $StdinCap) {
            $StdinText = [System.Text.Encoding]::UTF8.GetString($StdinBuffer, 0, $StdinTotal)
        }
        if ($StdinText) {
            $Payload = $StdinText | ConvertFrom-Json -ErrorAction Stop
            if ($Payload.workspace -and $Payload.workspace.project_dir) {
                $ProjectDir = [string]$Payload.workspace.project_dir
            }
        }
    }
    if ($ProjectDir) {
        $Sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $HashBytes = $Sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($ProjectDir))
        } finally {
            $Sha.Dispose()
        }
        $Key = (($HashBytes | ForEach-Object { $_.ToString("x2") }) -join "").Substring(0, 16)
        Touch-BuddyHeartbeat (Join-Path (Join-Path (Join-Path $DataDir "projects") $Key) ".badge-heartbeat")
    }
} catch {
    # Per-project heartbeat is best-effort too.
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
