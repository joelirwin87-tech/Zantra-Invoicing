import SwiftUI
import InvoiceKit

@main
struct DemoAppApp: App {
    @StateObject private var persistenceController = PersistenceController.shared
    @StateObject private var invoiceManager = ObservableInvoiceManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, persistenceController.container.viewContext)
                .environmentObject(invoiceManager)
        }
    }
}
