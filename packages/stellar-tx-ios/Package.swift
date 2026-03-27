// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "StellarTxIOS",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(
            name: "StellarTxIOS",
            targets: ["StellarTxIOS"]
        )
    ],
    targets: [
        .target(
            name: "StellarTxIOS",
            dependencies: []
        ),
        .testTarget(
            name: "StellarTxIOSTests",
            dependencies: ["StellarTxIOS"]
        )
    ]
)

