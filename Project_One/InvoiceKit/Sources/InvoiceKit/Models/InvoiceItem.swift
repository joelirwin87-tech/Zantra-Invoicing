import Foundation

public struct InvoiceItem: Identifiable, Codable, Equatable {
    public let id: UUID
    public var description: String
    public var quantity: Int
    public var unitPrice: Decimal
    public var taxRate: Decimal

    public init(id: UUID = UUID(), description: String, quantity: Int, unitPrice: Decimal, taxRate: Decimal = 0) {
        precondition(quantity >= 0, "Quantity must be non-negative")
        self.id = id
        self.description = description
        self.quantity = quantity
        self.unitPrice = unitPrice
        self.taxRate = taxRate
    }

    public var subtotal: Decimal {
        Decimal(quantity) * unitPrice
    }

    public var taxAmount: Decimal {
        subtotal * taxRate
    }

    public var total: Decimal {
        subtotal + taxAmount
    }
}
