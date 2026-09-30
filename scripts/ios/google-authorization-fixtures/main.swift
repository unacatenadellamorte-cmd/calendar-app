import Foundation
import Capacitor
import GoogleSignIn

func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    guard condition() else { fatalError(message) }
}
func pump(until condition: () -> Bool) {
    let deadline = Date().addingTimeInterval(3)
    while !condition() && Date() < deadline {
        _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.01))
    }
    check(condition(), "実プラグインの非同期処理が完了しなかった")
}
func call() -> CAPPluginCall { CAPPluginCall(["serverClientId": "123-server.apps.googleusercontent.com"]) }
let plugin = GoogleAuthorizationPlugin()
let sdk = GIDSignIn.sharedInstance
let scopes = [
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly"
]

if CommandLine.arguments.contains("missing-scheme") {
    for _ in 0..<2 {
        let missing = call()
        plugin.authorize(missing)
        pump { missing.completed }
        check(missing.rejection == "unavailable", "戻りURL不足を拒否していない")
    }
    check(sdk.calls == 0 && sdk.signOuts == 0, "戻りURL不足でSDKを呼び出している")
} else {
    let cancelled = call()
    plugin.authorize(cancelled)
    pump { sdk.pending }
    check(sdk.requestedScopes == scopes, "要求scopeが変わった")
    let duplicate = call()
    plugin.authorize(duplicate)
    pump { duplicate.completed }
    check(duplicate.rejection == "in-progress" && sdk.calls == 1, "認可中の再入を拒否していない")
    sdk.complete(error: NSError(domain: kGIDSignInErrorDomain, code: GIDSignInErrorCode.canceled.rawValue))
    pump { cancelled.completed }
    check(cancelled.rejection == "cancelled", "取消の結果が不正")

    // 同じ実インスタンスで再試行する。authorizingのリセット削除でここが失敗する。
    let success = call()
    plugin.authorize(success)
    pump { sdk.pending || success.completed }
    check(sdk.pending, "取消後に認可状態が解除されていない")
    sdk.complete(GIDSignInResult(code: "server-code", scopes: scopes))
    pump { success.completed }
    check(success.rejection == nil && success.result?["code"] as? String == "server-code", "取消後の成功結果が不正")
    check(Set(success.result?.keys.map { $0 } ?? []) == Set(["code", "grantedScopes"]), "認可コード以外のトークンを返している")
    check(sdk.signOuts == 4, "認可の前後にSDK状態を消していない")

    let partial = call()
    plugin.authorize(partial)
    pump { sdk.pending }
    sdk.complete(GIDSignInResult(code: "partial-code", scopes: [scopes[0]]))
    pump { partial.completed }
    check(partial.rejection == "authorization-failed", "部分許可を成功としている")
    let retried = call()
    plugin.authorize(retried)
    pump { sdk.pending || retried.completed }
    check(sdk.pending, "部分許可の失敗後に認可状態が解除されていない")
    sdk.complete(GIDSignInResult(code: "retry-code", scopes: scopes))
    pump { retried.completed }
    check(retried.result?["code"] as? String == "retry-code", "部分許可後の再試行が失敗した")
}
print("実GoogleAuthorizationPluginの状態と認可結果を検証済み。")
