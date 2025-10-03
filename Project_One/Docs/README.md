# Project_One

Project_One is a starter workspace that provides a reusable invoicing library and a demo SwiftUI application. The project is structured for modular development and testing from the outset.

## Components

- **InvoiceKit** – A Swift package containing core invoicing models and manager classes.
- **DemoApp** – A SwiftUI application showcasing how to integrate and use InvoiceKit with Core Data persistence.
- **Docs** – Documentation, licensing, and contribution guidelines.
- **Tests** – Centralized location for future integration or UI tests.

## Getting Started

1. Open `Project_One.xcodeproj` (generated from the Swift Package) or the `DemoApp` Xcode project.
2. Resolve Swift Package Manager dependencies. InvoiceKit is included as a local package dependency.
3. Run the DemoApp target to explore sample data flows.

## Development

- Run `swift test` from the repository root to execute library unit tests.
- Use the DemoApp project to iterate on UI and data persistence features.

## Contributing

Please read the [CONTRIBUTING](CONTRIBUTING.md) guide before submitting changes.

## License

Project_One is released under the terms described in [LICENSE.md](LICENSE.md).
