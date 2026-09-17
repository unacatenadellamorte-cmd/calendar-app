// swift-tools-version: 5.9
import PackageDescription

// Foundationだけの契約処理をmacOS上でテストする。WidgetKitの画面はXcodeビルドで検証する。
let package = Package(
    name: "FeaturedWidgetData",
    platforms: [.macOS(.v12)],
    targets: [
        .target(name: "FeaturedWidgetData", path: "Models"),
        .testTarget(name: "FeaturedWidgetDataTests", dependencies: ["FeaturedWidgetData"], path: "Tests")
    ]
)
