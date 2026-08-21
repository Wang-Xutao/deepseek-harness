$ErrorActionPreference = 'Continue'

function Test-SupportedVersion([string]$Version) {
  $normalized = $Version.Trim().TrimStart('v', 'V')
  $parts = $normalized.Split('.')
  if ($parts.Count -lt 2) { return $false }
  $major = 0
  $minor = 0
  if (-not [int]::TryParse($parts[0], [ref]$major)) { return $false }
  if (-not [int]::TryParse($parts[1], [ref]$minor)) { return $false }
  if ($major -eq 22 -and $minor -ge 19) { return $true }
  if ($major -ge 24) { return $true }
  return $false
}

function Test-NodeExe([string]$Exe) {
  if (-not (Test-Path -LiteralPath $Exe)) { return $false }
  try {
    $output = & $Exe -v 2>$null | Select-Object -First 1
    if ($null -eq $output) { return $false }
    return Test-SupportedVersion ([string]$output)
  } catch {
    return $false
  }
}

$candidates = New-Object System.Collections.Generic.List[string]
$command = Get-Command node -ErrorAction SilentlyContinue
if ($null -ne $command -and $command.Source) { [void]$candidates.Add($command.Source) }
[void]$candidates.Add("$env:ProgramFiles\nodejs\node.exe")
if ($env:LOCALAPPDATA) { [void]$candidates.Add("$env:LOCALAPPDATA\Programs\nodejs\node.exe") }

foreach ($candidate in $candidates) {
  if (Test-NodeExe $candidate) {
    Write-Output "ok $candidate"
    exit 0
  }
}

Write-Output 'need-install'
exit 2
