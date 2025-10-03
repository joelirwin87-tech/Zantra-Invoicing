import Foundation

public struct Invoice: Identifiable, Codable, Equatable {
    public enum Status: String, Codable, CaseIterable {
        case draft
        case sent
        case paid
        case overdue
        case cancelled
    }

    public let id: UUID
    public var number: String
    public var issueDate: Date
    public var dueDate: Date
    public var client: Client
    public var items: [InvoiceItem]
    public var notes: String?
    public var status: Status

    public init(
        id: UUID = UUID(),
        number: String,
        issueDate: Date,
        dueDate: Date,
        client: Client,
        items: [InvoiceItem],
        notes: String? = nil,
        status: Status = .draft
    ) {
        self.id = id
        self.number = number
        self.issueDate = issueDate
        self.dueDate = dueDate
        self.client = client
        self.items = items
        self.notes = notes
        self.status = status
    }

    public var subtotal: Decimal {
        items.reduce(into: Decimal(0)) { result, item in
            result += item.subtotal
        }
    }

    public var taxAmount: Decimal {
        items.reduce(into: Decimal(0)) { result, item in
            result += item.taxAmount
        }
    }

    public var total: Decimal {
        items.reduce(into: Decimal(0)) { result, item in
            result += item.total
        }
    }

    public var isOverdue: Bool {
        status != .paid && Date() > dueDate
    }
}
