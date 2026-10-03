import Foundation
import UIKit

// 実プラグインが利用する境界だけを持つ、テスト専用のCapacitor代役。
public let CAPPluginReturnPromise = "promise"
public struct CAPPluginMethod {
    public init(name: String, returnType: String) {}
}
public protocol CAPBridgedPlugin {
    var identifier: String { get }
    var jsName: String { get }
    var pluginMethods: [CAPPluginMethod] { get }
}
public class FakeBridge {
    public let viewController = UIViewController()
    public init() {}
    public func registerPluginInstance(_ plugin: CAPPlugin) {}
}
open class CAPPlugin: NSObject {
    public var bridge: FakeBridge? = FakeBridge()
}
open class CAPBridgeViewController: UIViewController {
    public var bridge: FakeBridge? = FakeBridge()
    open func capacitorDidLoad() {}
}

public final class SceneDelegateProxy {
    public static let shared = SceneDelegateProxy()
    public private(set) var willConnectCount = 0
    public private(set) var willConnectURLCounts: [Int] = []
    public private(set) var openURLBatches: [[URL]] = []
    public func reset() { willConnectCount = 0; willConnectURLCounts.removeAll(); openURLBatches.removeAll() }
    public func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        willConnectCount += 1
        willConnectURLCounts.append(options.urlContexts.count)
    }
    public func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
        openURLBatches.append(contexts.map(\.url))
    }
    public func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {}
}
public class CAPPluginCall: NSObject {
    private let options: [String: Any]
    public private(set) var rejection: String?
    public private(set) var result: [String: Any]?
    public var completed: Bool { rejection != nil || result != nil }
    public init(_ options: [String: Any]) { self.options = options }
    public func getString(_ key: String) -> String? { options[key] as? String }
    public func getBool(_ key: String, _ defaultValue: Bool = false) -> Bool { options[key] as? Bool ?? defaultValue }
    public func reject(_ message: String, _ code: String) { rejection = code }
    public func resolve(_ value: [String: Any]) { result = value }
}
