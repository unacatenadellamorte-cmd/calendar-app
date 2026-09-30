import Foundation

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
    public let viewController = NSObject()
    public init() {}
    public func registerPluginInstance(_ plugin: CAPPlugin) {}
}
open class CAPPlugin: NSObject {
    public var bridge: FakeBridge? = FakeBridge()
}
open class CAPBridgeViewController: NSObject {
    public var bridge: FakeBridge? = FakeBridge()
    open func capacitorDidLoad() {}
}
public class CAPPluginCall: NSObject {
    private let options: [String: String]
    public private(set) var rejection: String?
    public private(set) var result: [String: Any]?
    public var completed: Bool { rejection != nil || result != nil }
    public init(_ options: [String: String]) { self.options = options }
    public func getString(_ key: String) -> String? { options[key] }
    public func reject(_ message: String, _ code: String) { rejection = code }
    public func resolve(_ value: [String: Any]) { result = value }
}
