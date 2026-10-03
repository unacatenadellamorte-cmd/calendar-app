"""macOS上で実プラグインを偽SDKとリンクして実行する。製品コードの複製はしない。"""
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile


def main():
    if sys.platform != "darwin":
        raise SystemExit("このネイティブテストはmacOSのSwiftコンパイラが必要です。")
    root = Path(__file__).resolve().parents[2]
    fixture = root / "scripts/ios/google-authorization-fixtures"
    with tempfile.TemporaryDirectory(prefix="calendar-google-plugin-") as directory:
        temporary = Path(directory)
        for module in ["UIKit", "Capacitor", "GoogleSignIn"]:
            command = ["xcrun", "swiftc", "-swift-version", "5", "-emit-library", "-emit-module", "-module-name", module]
            if module == "Capacitor":
                command += ["-I", str(temporary), "-L", str(temporary), "-lUIKit"]
            command += [
                            str(fixture / (module + ".swift")), "-emit-module-path", str(temporary / (module + ".swiftmodule")),
                            "-o", str(temporary / ("lib" + module + ".dylib"))]
            subprocess.run(command, check=True)
        executable = temporary / "PluginTests"
        subprocess.run(["xcrun", "swiftc", "-swift-version", "5", "-I", str(temporary), "-L", str(temporary),
                        "-lUIKit", "-lCapacitor", "-lGoogleSignIn", "-Xlinker", "-rpath", "-Xlinker", str(temporary),
                        str(root / "ios/App/App/GoogleAuthorizationPlugin.swift"), str(fixture / "main.swift"),
                        "-o", str(executable)], check=True)
        for scenario in ["valid", "missing-scheme"]:
            contents = temporary / (scenario + ".app") / "Contents"
            binary = contents / "MacOS/PluginTests"
            binary.parent.mkdir(parents=True)
            shutil.copy2(executable, binary)
            info = {
                "CFBundleExecutable": "PluginTests", "CFBundleIdentifier": "test.calendar." + scenario,
                "CFBundlePackageType": "APPL", "GIDClientID": "123-ios.apps.googleusercontent.com",
                "GIDServerClientID": "123-server.apps.googleusercontent.com",
                "CFBundleURLTypes": [{"CFBundleURLSchemes": ["calendar-app"]}],
            }
            if scenario == "valid":
                info["CFBundleURLTypes"][0]["CFBundleURLSchemes"].append("com.googleusercontent.apps.123-ios")
            (contents / "Info.plist").write_bytes(plistlib.dumps(info))
            subprocess.run([str(binary), scenario], check=True)

        scene_executable = temporary / "SceneTests"
        subprocess.run(["xcrun", "swiftc", "-swift-version", "5", "-I", str(temporary), "-L", str(temporary),
                        "-lUIKit", "-lCapacitor", "-lGoogleSignIn", "-Xlinker", "-rpath", "-Xlinker", str(temporary),
                        str(root / "ios/App/App/GoogleAuthorizationPlugin.swift"),
                        str(root / "ios/App/App/SceneDelegate.swift"), str(fixture / "scene-main.swift"),
                        "-o", str(scene_executable)], check=True)
        subprocess.run([str(scene_executable)], check=True)


if __name__ == "__main__":
    main()
