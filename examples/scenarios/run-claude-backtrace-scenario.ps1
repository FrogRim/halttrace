param(
  [string]$StateRoot = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($StateRoot)) {
  $StateRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("halttrace-scenario-" + [Guid]::NewGuid().ToString("N"))
}

New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null

if (-not $SkipBuild) {
  Push-Location $repoRoot
  try {
    npm run build
  } finally {
    Pop-Location
  }
}

$entry = Join-Path $repoRoot "dist\src\cli\claude-hook.js"
if (-not (Test-Path -LiteralPath $entry)) {
  throw "Missing built CLI entry: $entry"
}

$previousStateDir = $env:HALTTRACE_STATE_DIR
$env:HALTTRACE_STATE_DIR = $StateRoot
$env:HALTTRACE_DUMP_MODE = "rich-local"

$sessionId = "scenario-" + [Guid]::NewGuid().ToString("N")
$secret = "ScenarioSecretToken_ZYXWVUTSRQPONMLK1234567890"
$dumpPath = $null

$steps = @(
  @{
    Name = "context command success"
    ExpectDump = $false
    Input = @{
      hook_event_name = "PostToolUse"
      session_id = $sessionId
      cwd = $repoRoot
      tool_name = "Bash"
      tool_input = @{ command = "npm test" }
      tool_response = @{ exit_code = 0; stdout = "14 tests passed" }
    }
  },
  @{
    Name = "ordinary command failure"
    ExpectDump = $false
    Input = @{
      hook_event_name = "PostToolUseFailure"
      session_id = $sessionId
      cwd = $repoRoot
      tool_name = "Bash"
      tool_input = @{ command = "npm test" }
      tool_response = @{ exit_code = 1; stderr = "expected red-loop feedback" }
    }
  },
  @{
    Name = "host blocked write"
    ExpectDump = $true
    Input = @{
      hook_event_name = "PermissionDenied"
      session_id = $sessionId
      cwd = $repoRoot
      reason = "policy"
      tool_name = "Write"
      tool_input = @{
        file_path = "src/blocked.ts"
        content = "const token = `"API_TOKEN=$secret`";"
      }
    }
  }
)

try {
  foreach ($step in $steps) {
    $json = $step.Input | ConvertTo-Json -Depth 20 -Compress
    $outputLines = $json | & node $entry 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "CLI exited with $LASTEXITCODE during '$($step.Name)'"
    }
    $output = ($outputLines | Out-String).Trim()
    $hasDump = $output -match "\[halttrace\] backtrace dump: (.+)"

    if ($step.ExpectDump -and -not $hasDump) {
      throw "Expected dump for '$($step.Name)', got output: $output"
    }
    if (-not $step.ExpectDump -and $hasDump) {
      throw "Unexpected dump for '$($step.Name)', got output: $output"
    }
    if ($hasDump) {
      $dumpPath = $Matches[1].Trim()
    }
  }

  if ([string]::IsNullOrWhiteSpace($dumpPath) -or -not (Test-Path -LiteralPath $dumpPath)) {
    throw "Dump path was not created: $dumpPath"
  }

  $eventLogs = @(Get-ChildItem -Path $StateRoot -Filter "events.jsonl" -Recurse | Where-Object { $_.FullName -like "*$sessionId*" })
  if ($eventLogs.Count -ne 1) {
    throw "Expected one events.jsonl, found $($eventLogs.Count)"
  }

  $dumpText = Get-Content -LiteralPath $dumpPath -Raw
  $eventText = Get-Content -LiteralPath $eventLogs[0].FullName -Raw

  if ($dumpText -notmatch "Agent Event Backtrace") {
    throw "Dump missing title"
  }
  if ($dumpText -notmatch "host-blocked") {
    throw "Dump missing host-blocked trigger"
  }
  if ($dumpText -notmatch "src/blocked.ts") {
    throw "Dump missing file path"
  }
  if ($dumpText -match [Regex]::Escape($secret)) {
    throw "Dump leaked raw secret"
  }
  if ($eventText -match [Regex]::Escape($secret)) {
    throw "events.jsonl leaked raw secret"
  }
  if ($dumpText -notmatch "redacted" -or $eventText -notmatch "redacted") {
    throw "Expected redaction markers in dump and event log"
  }

  $lineCount = ($eventText -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 }).Count
  if ($lineCount -ne 3) {
    throw "Expected 3 persisted events, found $lineCount"
  }

  [pscustomobject]@{
    Status = "PASS"
    Scenario = "Claude host-blocked backtrace"
    StateRoot = $StateRoot
    EventLog = $eventLogs[0].FullName
    DumpPath = $dumpPath
    PersistedEvents = $lineCount
  } | ConvertTo-Json -Depth 5
} finally {
  $env:HALTTRACE_STATE_DIR = $previousStateDir
}
