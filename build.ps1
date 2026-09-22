param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildDir = Join-Path $sourceDir 'build-ninja'

$vsRoot = 'G:\Microsoft Visual Studio\2022\Community'
$bundledCmake = Join-Path $vsRoot 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
$bundledNinja = Join-Path $vsRoot 'Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe'
$vcvars = Join-Path $vsRoot 'VC\Auxiliary\Build\vcvars64.bat'

if ((Test-Path -LiteralPath $bundledCmake) -and
    (Test-Path -LiteralPath $bundledNinja) -and
    (Test-Path -LiteralPath $vcvars)) {
    $configure = 'call "' + $vcvars + '" && "' + $bundledCmake +
        '" -S "' + $sourceDir + '" -B "' + $buildDir +
        '" -G Ninja -DCMAKE_MAKE_PROGRAM="' + $bundledNinja +
        '" -DCMAKE_BUILD_TYPE=' + $Configuration
    cmd /d /s /c $configure
    if ($LASTEXITCODE -ne 0) {
        throw "CMake configuration failed with exit code $LASTEXITCODE."
    }

    $build = 'call "' + $vcvars + '" && "' + $bundledCmake +
        '" --build "' + $buildDir + '"'
    cmd /d /s /c $build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE."
    }
} else {
    $cmake = Get-Command cmake -ErrorAction SilentlyContinue
    if (-not $cmake) {
        throw 'CMake was not found. Install CMake and Visual Studio 2022 C++ Build Tools first.'
    }

    & $cmake.Source -S $sourceDir -B $buildDir -A x64
    if ($LASTEXITCODE -ne 0) {
        throw "CMake configuration failed with exit code $LASTEXITCODE."
    }

    & $cmake.Source --build $buildDir --config $Configuration
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE."
    }
}

$exePath = Join-Path $buildDir 'link2_dwell_demo.exe'
Write-Host "Built: $exePath"
