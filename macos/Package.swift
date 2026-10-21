// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CobrancaCRTV",
    platforms: [.macOS("26.0")],
    targets: [
        .executableTarget(
            name: "CobrancaCRTV",
            path: "Sources/CobrancaCRTV",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
