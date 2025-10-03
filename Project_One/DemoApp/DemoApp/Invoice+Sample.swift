import Foundation
import Combine
import InvoiceKit

final class ObservableInvoiceManager: ObservableObject {
    @Published private(set) var invoices: [Invoice]
    private let manager: InvoiceManager

    init(manager: InvoiceManager = InvoiceManager(initialInvoices: SampleData.seedInvoices)) {
        self.manager = manager
        self.invoices = manager.invoices()
    }

    func refresh() {
        invoices = manager.invoices()
    }

    func createSampleInvoice() {
        let nextInvoice = SampleData.generateInvoice(number: invoices.count + 1)
        manager.save(nextInvoice)
        refresh()
    }
}

enum SampleData {
    static let seedInvoices: [Invoice] = {
        let client = Client(name: "Acme Corp", email: "finance@acme.com", phoneNumber: "555-0100", billingAddress: "123 Market St")
        let items = [
            InvoiceItem(description: "Design Services", quantity: 20, unitPrice: 120, taxRate: 0.13),
            InvoiceItem(description: "Consultation", quantity: 5, unitPrice: 150, taxRate: 0.13)
        ]
        let invoice = Invoice(
            number: "INV-0001",
            issueDate: Date().addingTimeInterval(-86400 * 5),
            dueDate: Date().addingTimeInterval(86400 * 10),
            client: client,
            items: items,
            notes: "Thank you for your business!",
            status: .sent
        )
        return [invoice]
    }()

    static func generateInvoice(number: Int) -> Invoice {
        let client = Client(name: "Client #\(number)", email: "client\(number)@example.com")
        let items = [
            InvoiceItem(description: "Subscription", quantity: 1, unitPrice: Decimal(99)),
            InvoiceItem(description: "Support", quantity: 2, unitPrice: Decimal(49.5))
        ]

        return Invoice(
            number: String(format: "INV-%04d", number + 1),
            issueDate: Date(),
            dueDate: Calendar.current.date(byAdding: .day, value: 14, to: Date()) ?? Date(),
            client: client,
            items: items,
            status: .draft
        )
    }
}
