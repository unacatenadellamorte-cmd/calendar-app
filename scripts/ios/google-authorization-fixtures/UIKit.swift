@_exported import Foundation

open class UIResponder: NSObject {}
open class UIViewController: UIResponder {}
public protocol UIWindowSceneDelegate: AnyObject {}
public class UIScene: NSObject {
    public class ConnectionOptions: NSObject {
        public let urlContexts: Set<UIOpenURLContext>
        public init(urlContexts: Set<UIOpenURLContext> = []) { self.urlContexts = urlContexts }
    }
}
public class UIWindowScene: UIScene {}
public class UISceneSession: NSObject {}
public class UIWindow: NSObject {
    public var rootViewController: UIViewController?
    public init(windowScene: UIWindowScene) {}
    public func makeKeyAndVisible() {}
}
public class UIOpenURLContext: NSObject {
    public let url: URL
    public init(url: URL) { self.url = url }
}
