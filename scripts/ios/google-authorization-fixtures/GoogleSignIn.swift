import Foundation

// SDKの結果を制御する。認可状態や結果処理は実プラグインに任せる。
public let kGIDSignInErrorDomain = "test.google-sign-in"
public enum GIDSignInErrorCode: Int { case canceled = -5 }
public class GIDConfiguration {
    public init(clientID: String, serverClientID: String) {}
}
public struct GIDGoogleUser {
    public let grantedScopes: [String]?
    public init(grantedScopes: [String]?) { self.grantedScopes = grantedScopes }
}
public struct GIDSignInResult {
    public let serverAuthCode: String?
    public let user: GIDGoogleUser
    public init(code: String?, scopes: [String]?) {
        serverAuthCode = code
        user = GIDGoogleUser(grantedScopes: scopes)
    }
}
public class GIDSignIn {
    public static let sharedInstance = GIDSignIn()
    public var configuration: GIDConfiguration?
    public private(set) var calls = 0
    public private(set) var signOuts = 0
    public private(set) var requestedScopes: [String]?
    private var completion: ((GIDSignInResult?, Error?) -> Void)?
    public var pending: Bool { completion != nil }
    public func signOut() { signOuts += 1 }
    public func signIn(withPresenting: NSObject, hint: String?, additionalScopes: [String]?,
                       completion: @escaping (GIDSignInResult?, Error?) -> Void) {
        calls += 1
        requestedScopes = additionalScopes
        self.completion = completion
    }
    public func complete(_ result: GIDSignInResult? = nil, error: Error? = nil) {
        let callback = completion
        completion = nil
        DispatchQueue.main.async { callback?(result, error) }
    }
}
