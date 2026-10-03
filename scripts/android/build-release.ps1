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

    # 別アプリの鍵で署名してもAAB生成自体は成功するため、Play登録済みの
    # Multi calendarアップロード証明書と一致することをビルド前に確かめる。
    $expectedUploadSha1 = 'F8B5AC884AC40E5E4934F9B5CC4CEE1EE1A8773E'
    $keytoolOutput = & keytool -list -v `
        -keystore $env:ANDROID_KEYSTORE_PATH `
        -alias $env:ANDROID_KEY_ALIAS `
        -storepass:env ANDROID_KEYSTORE_PASSWORD 2>&1
    if ($LASTEXITCODE -ne 0) { throw '提出用キーストアの証明書を確認できませんでした。' }
    $sha1Line = $keytoolOutput | Select-String -Pattern 'SHA1:\s*([0-9A-F:]+)' | Select-Object -First 1
    if (-not $sha1Line -or (($sha1Line.Matches[0].Groups[1].Value -replace ':', '').ToUpperInvariant() -ne $expectedUploadSha1)) {
        throw '提出用キーストアがMulti calendarのGoogle Playアップロード鍵と一致しません。'
    }
} elseif ($env:ANDROID_KEYSTORE_PATH) {
    throw '未署名検証では署名用環境変数を設定していないターミナルを使ってください。'
}

$previousBuildRoot = $env:ANDROID_BUILD_ROOT
$previousNativeTarget = $env:VITE_NATIVE_TARGET
Push-Location $projectRoot
try {
    $env:ANDROID_BUILD_ROOT = $BuildRoot
    $env:VITE_NATIVE_TARGET = 'android'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Webビルドに失敗しました。' }
    $serviceWorker = Join-Path (Join-Path $projectRoot 'dist') 'sw.js'
    if (-not (Test-Path -LiteralPath $serviceWorker -PathType Leaf)) { throw 'Service Workerが生成されませんでした。' }
    $serviceWorkerSource = Get-Content -Raw -LiteralPath $serviceWorker
    if ($serviceWorkerSource -notmatch 'registration\.unregister\s*\(' -or
        $serviceWorkerSource -notmatch 'caches\.keys\s*\(' -or
        $serviceWorkerSource -notmatch 'caches\.delete\s*\(') {
        throw 'ネイティブ配布用Service Workerの自己破棄契約を確認できませんでした。'
    }
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
    if ($null -eq $previousNativeTarget) { Remove-Item Env:VITE_NATIVE_TARGET -ErrorAction SilentlyContinue } else { $env:VITE_NATIVE_TARGET = $previousNativeTarget }
    Pop-Location
}
