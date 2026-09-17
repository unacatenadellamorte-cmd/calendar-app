param(
    [switch]$Unsigned,
    [string]$BuildRoot = (Join-Path $env:LOCALAPPDATA 'calendar-app\android-release')
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BuildRoot = [System.IO.Path]::GetFullPath($BuildRoot)
if (-not $Unsigned) {
    foreach ($name in @('ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD')) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
            throw "提出用の署名設定が不足しています: $name。検証だけなら -Unsigned を指定してください。"
        }
    }
    if (-not (Test-Path -LiteralPath $env:ANDROID_KEYSTORE_PATH -PathType Leaf)) {
        throw '指定したキーストアが存在しません。'
    }
} elseif ($env:ANDROID_KEYSTORE_PATH) {
    throw '未署名検証では署名用環境変数を設定していないターミナルを使ってください。'
}

$previousBuildRoot = $env:ANDROID_BUILD_ROOT
Push-Location $projectRoot
try {
    $env:ANDROID_BUILD_ROOT = $BuildRoot
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Webビルドに失敗しました。' }
    & npx.cmd cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'Android同期に失敗しました。' }
    $gradleArgs = @('-p', 'android', ':app:testDebugUnitTest', ':app:lintRelease', ':app:bundleRelease', '--console=plain')
    if (-not $Unsigned) { $gradleArgs += '-PrequireReleaseSigning' }
    & .\android\gradlew.bat @gradleArgs
    if ($LASTEXITCODE -ne 0) { throw 'Androidの検証またはビルドに失敗しました。' }
    $bundle = Join-Path $BuildRoot 'app\outputs\bundle\release\app-release.aab'
    if (-not (Test-Path -LiteralPath $bundle)) { throw 'AABが生成されませんでした。' }
    $label = if ($Unsigned) { '未署名・提出不可' } else { '署名済み・提出前に公開チェックリストを確認' }
    Write-Output "AAB ($label): $bundle"
    Get-FileHash -LiteralPath $bundle -Algorithm SHA256
} finally {
    $env:ANDROID_BUILD_ROOT = $previousBuildRoot
    Pop-Location
}
