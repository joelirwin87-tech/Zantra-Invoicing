import Foundation

public final class PaymentManager {
    public struct Payment: Identifiable, Codable, Equatable {
        public enum Method: String, Codable, CaseIterable {
            case cash
            case bankTransfer
            case card
            case online
        }

        public let id: UUID
        public let invoiceID: UUID
        public var amount: Decimal
        public var date: Date
        public var method: Method
        public var reference: String?

        public init(
            id: UUID = UUID(),
            invoiceID: UUID,
            amount: Decimal,
            date: Date = Date(),
            method: Method,
            reference: String? = nil
        ) {
            precondition(amount >= 0, "Amount must be non-negative")
            self.id = id
            self.invoiceID = invoiceID
            self.amount = amount
            self.date = date
            self.method = method
            self.reference = reference
        }
    }

    private let queue = DispatchQueue(label: "com.projectone.paymentManager", attributes: .concurrent)
    private var storage: [UUID: [Payment]] = [:]

    public init() {}

    public func payments(for invoiceID: UUID) -> [Payment] {
        queue.sync {
            storage[invoiceID, default: []]
        }
    }

    public func record(payment: Payment) {
        queue.async(flags: .barrier) { [weak self] in
            var invoicePayments = self?.storage[payment.invoiceID] ?? []
            invoicePayments.append(payment)
            self?.storage[payment.invoiceID] = invoicePayments
        }
    }

    public func totalPaid(for invoiceID: UUID) -> Decimal {
        payments(for: invoiceID).reduce(into: Decimal(0)) { result, payment in
            result += payment.amount
        }
    }
}
