// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SinglesWatcher",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "SinglesWatcher",
            path: "Sources"
        ),
    ]
)
