// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Project_One",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "InvoiceKit",
            targets: ["InvoiceKit"]
        )
    ],
    targets: [
        .target(
            name: "InvoiceKit",
            path: "InvoiceKit/Sources"
        ),
        .testTarget(
            name: "InvoiceKitTests",
            dependencies: ["InvoiceKit"],
            path: "InvoiceKit/Tests"
        )
    ]
)
