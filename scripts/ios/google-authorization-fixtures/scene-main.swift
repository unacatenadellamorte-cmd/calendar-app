import Foundation
import UIKit
import Capacitor
import GoogleSignIn

func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    guard condition() else { fatalError(message) }
}

@main
struct SceneDelegateFixture {
    static func main() {
        let delegate = SceneDelegate()
        let scene = UIWindowScene()
        let session = UISceneSession()
        let google = UIOpenURLContext(url: URL(string: "com.googleusercontent.apps.123-ios:/oauth2redirect?code=google")!)
        let other = UIOpenURLContext(url: URL(string: "calendar-app://connections/google/callback?code=other")!)
        let proxy = SceneDelegateProxy.shared

        proxy.reset()
        delegate.scene(scene, willConnectTo: session, options: UIScene.ConnectionOptions(urlContexts: [google]))
        check(proxy.willConnectCount == 1 && proxy.willConnectURLCounts == [1], "Googleのコールド起動URLをCapacitorへ渡していない")
        check(GIDSignIn.sharedInstance.handledURLs.last == google.url, "Googleのコールド起動URLをSDKへ渡していない")

        proxy.reset()
        delegate.scene(scene, willConnectTo: session, options: UIScene.ConnectionOptions(urlContexts: [other]))
        check(proxy.willConnectCount == 1 && proxy.willConnectURLCounts == [1], "非Googleのコールド起動URLをCapacitorへ渡していない")

        proxy.reset()
        delegate.scene(scene, openURLContexts: [google, other])
        check(proxy.openURLBatches.count == 1 && proxy.openURLBatches[0] == [other.url], "warm起動でGoogle URLを除外していない")
        print("SceneDelegateのcold/warm URL転送を検証済み。")
    }
}
