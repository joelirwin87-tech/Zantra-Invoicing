import Foundation

public final class InvoiceManager {
    private let queue = DispatchQueue(label: "com.projectone.invoiceManager", attributes: .concurrent)
    private var storage: [UUID: Invoice] = [:]

    public init(initialInvoices: [Invoice] = []) {
        initialInvoices.forEach { invoice in
            storage[invoice.id] = invoice
        }
    }

    public func invoices() -> [Invoice] {
        queue.sync {
            storage.values.sorted { $0.issueDate < $1.issueDate }
        }
    }

    @discardableResult
    public func save(_ invoice: Invoice) -> Invoice {
        queue.async(flags: .barrier) { [weak self] in
            self?.storage[invoice.id] = invoice
        }
        return invoice
    }

    public func invoice(withID id: UUID) -> Invoice? {
        queue.sync {
            storage[id]
        }
    }

    public func deleteInvoice(withID id: UUID) {
        queue.async(flags: .barrier) { [weak self] in
            self?.storage.removeValue(forKey: id)
        }
    }

    public func markInvoice(_ id: UUID, as status: Invoice.Status) {
        queue.async(flags: .barrier) { [weak self] in
            guard var invoice = self?.storage[id] else { return }
            invoice.status = status
            self?.storage[id] = invoice
        }
    }

    public func invoices(for status: Invoice.Status) -> [Invoice] {
        queue.sync {
            storage.values.filter { $0.status == status }
        }
    }
}
