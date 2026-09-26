[CmdletBinding()]
param(
    [string]$Endpoint = 'http://127.0.0.1:8787/api',
    [string]$SensorToken = $env:PRESENCE_SENSOR_TOKEN,
    [string]$DeviceId = $env:PRESENCE_DEVICE_ID,
    [string]$DemoPath = '',
    [switch]$Stdin,
    [switch]$Once,
    [Parameter(ValueFromPipeline = $true)]
    [string]$EventLine
)

begin { $eventLines = [Collections.Generic.List[string]]::new() }
process {
    if ($PSBoundParameters.ContainsKey('EventLine')) {
        $eventLines.Add($EventLine)
    }
}
end {
    $ErrorActionPreference = 'Stop'
    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    if ([string]::IsNullOrWhiteSpace($SensorToken)) {
        throw 'PRESENCE_SENSOR_TOKEN is not set. Obtain the local MVP token from the server operator; do not store it in this repository.'
    }
    if ([string]::IsNullOrWhiteSpace($DeviceId)) {
        $DeviceId = 'living-room-link2'
    }
    $env:PRESENCE_SENSOR_TOKEN = $SensorToken
    $env:PRESENCE_DEVICE_ID = $DeviceId

    $launcher = Join-Path $scriptRoot 'start-cloud-uploader.ps1'
    $launcherArguments = @{ Endpoint = $Endpoint }
    if (-not [string]::IsNullOrWhiteSpace($DemoPath)) {
        $launcherArguments.DemoPath = $DemoPath
    }
    if ($Stdin) { $launcherArguments.Stdin = $true }
    if ($Once) { $launcherArguments.Once = $true }

    if ($Stdin -and $eventLines.Count) {
        $launcherArguments.EventLines = @($eventLines)
    }
    & $launcher @launcherArguments
    exit $LASTEXITCODE
}
