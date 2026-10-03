import Foundation
import Capacitor
import GoogleSignIn

@objc(GoogleAuthorizationPlugin)
public class GoogleAuthorizationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoogleAuthorizationPlugin"
    public let jsName = "GoogleAuthorization"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var authorizing = false
    private let readScopes = [
        "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly"
    ]
    private let writeScope = "https://www.googleapis.com/auth/calendar.events"

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard !self.authorizing else {
                call.reject("認可処理が進行中です。", "in-progress")
                return
            }
            guard let presenter = self.bridge?.viewController,
                  let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
                  let configuredServerID = Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String,
                  let serverID = call.getString("serverClientId"),
                  clientID.hasSuffix(".apps.googleusercontent.com"),
                  serverID.hasSuffix(".apps.googleusercontent.com"),
                  serverID == configuredServerID else {
                call.reject("Google接続設定が不足しています。", "unavailable")
                return
            }
            let registeredURLs = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
            let registeredSchemes = registeredURLs.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] }
            let callbackScheme = clientID.components(separatedBy: ".").reversed().joined(separator: ".")
            guard registeredSchemes.contains(callbackScheme) else {
                call.reject("Googleの戻りURL設定が不足しています。", "unavailable")
                return
            }
            self.authorizing = true
            let requestedScopes = call.getBool("write", false) ? Array(self.readScopes.dropLast()) + [self.writeScope] : self.readScopes
            let signIn = GIDSignIn.sharedInstance
            // 主認証はSupabaseのまま。前の利用者のSDK状態は使い回さない。
            signIn.signOut()
            signIn.configuration = GIDConfiguration(clientID: clientID, serverClientID: serverID)
            signIn.signIn(withPresenting: presenter, hint: nil, additionalScopes: Array(requestedScopes)) { result, error in
                defer {
                    signIn.signOut()
                    self.authorizing = false
                }
                if let error = error as NSError? {
                    // Googleの公開定義 kGIDSignInErrorCodeCanceled は -5。Swift側の列挙名変更に依存しない。
                    let cancelled = error.domain == kGIDSignInErrorDomain && error.code == -5
                    call.reject("Googleカレンダーの認可を完了できませんでした。", cancelled ? "cancelled" : "authorization-failed")
                    return
                }
                guard let result, let code = result.serverAuthCode, !code.isEmpty,
                      let granted = result.user.grantedScopes,
                      requestedScopes.allSatisfy({ scope in
                          granted.contains(scope) ||
                              (scope == self.readScopes[1] && granted.contains(self.writeScope))
                      }) else {
                    call.reject("必要なカレンダー権限が許可されていません。", "authorization-failed")
                    return
                }
                // アクセストークン・更新トークン・IDトークンはJSへ渡さない。
                call.resolve(["code": code, "grantedScopes": granted])
            }
        }
    }
}

class CalendarBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GoogleAuthorizationPlugin())
    }
}
