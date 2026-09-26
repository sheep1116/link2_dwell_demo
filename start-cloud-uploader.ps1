[CmdletBinding()]
param(
    [string]$Endpoint = $env:PRESENCE_ENDPOINT,
    [string]$DemoPath = '',
    [switch]$DryRun,
    [switch]$Stdin,
    [switch]$Once,
    [string[]]$EventLines = @()
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if ([string]::IsNullOrWhiteSpace($Endpoint)) {
    $Endpoint = 'https://memory-frame-demo-d7djiee0702b6c.service.tcloudbase.com/api'
}

$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot '..\..'))
# Avoid a non-ASCII package-folder literal here: Windows PowerShell 5.1 can
# misread UTF-8 scripts without a BOM. Discover only the expected shallow
# <package>\unseen\runtime\node.exe layout instead of recursively searching.
$bundledNodes = @(
    Get-ChildItem -LiteralPath $workspaceRoot -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'unseen\runtime\node.exe' } |
        Where-Object { Test-Path -LiteralPath $_ }
)
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($bundledNodes.Count -eq 1) {
    $node = (Resolve-Path -LiteralPath $bundledNodes[0]).Path
} elseif ($bundledNodes.Count -gt 1) {
    $runtimeGroups = @($bundledNodes | Group-Object { (Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash })
    if ($runtimeGroups.Count -eq 1) {
        # The ordinary and MVP packages may both be present. Identical bundled
        # runtimes are interchangeable; use a deterministic path.
        $node = (Resolve-Path -LiteralPath ($bundledNodes | Sort-Object | Select-Object -First 1)).Path
    } elseif ($nodeCommand) {
        $node = $nodeCommand.Source
    } else {
        throw 'Different bundled Node.js runtimes were found. Put the intended Node.js 20+ executable on PATH.'
    }
} elseif ($nodeCommand) {
    $node = $nodeCommand.Source
} else {
    throw 'Node.js 20 or later was not found. Install Node.js or keep the frontend package beside the demos folder.'
}

$arguments = @((Join-Path $scriptRoot 'presence_uploader.cjs'), '--endpoint', $Endpoint)
if (-not [string]::IsNullOrWhiteSpace($DemoPath)) {
    $arguments += @('--demo', $DemoPath)
}
if ($DryRun) {
    $arguments += '--dry-run'
} elseif ([string]::IsNullOrWhiteSpace($env:PRESENCE_SENSOR_TOKEN)) {
    throw 'PRESENCE_SENSOR_TOKEN is not set. Ask the server engineer for a sensor token, or use -DryRun.'
}
if ($Stdin) {
    $arguments += '--stdin'
}
if ($Once) {
    $arguments += '--once'
}

if ($Stdin -and $EventLines.Count) {
    $EventLines | & $node @arguments
} else {
    & $node @arguments
}
exit $LASTEXITCODE
