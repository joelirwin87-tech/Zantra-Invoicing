import XCTest
@testable import InvoiceKit

final class InvoiceManagerTests: XCTestCase {
    func testSaveAndFetchInvoice() {
        let client = Client(name: "Acme Corp", email: "billing@acme.com")
        let item = InvoiceItem(description: "Consulting", quantity: 10, unitPrice: 150, taxRate: 0.15)
        let invoice = Invoice(number: "INV-001", issueDate: Date(), dueDate: Date().addingTimeInterval(86400), client: client, items: [item])

        let manager = InvoiceManager()
        manager.save(invoice)

        let fetched = manager.invoice(withID: invoice.id)
        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.total, item.total)
    }

    func testDeleteInvoice() {
        let client = Client(name: "Acme Corp", email: "billing@acme.com")
        let invoice = Invoice(number: "INV-002", issueDate: Date(), dueDate: Date(), client: client, items: [])
        let manager = InvoiceManager(initialInvoices: [invoice])

        manager.deleteInvoice(withID: invoice.id)
        let fetched = manager.invoice(withID: invoice.id)
        XCTAssertNil(fetched)
    }

    func testPaymentManagerCalculatesTotal() {
        let client = Client(name: "Acme Corp", email: "billing@acme.com")
        let invoice = Invoice(number: "INV-003", issueDate: Date(), dueDate: Date(), client: client, items: [])
        let paymentManager = PaymentManager()
        let payment = PaymentManager.Payment(invoiceID: invoice.id, amount: 200, method: .card)

        paymentManager.record(payment: payment)
        XCTAssertEqual(paymentManager.totalPaid(for: invoice.id), 200)
    }
}
