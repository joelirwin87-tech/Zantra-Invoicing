import Foundation

public struct Client: Identifiable, Codable, Equatable {
    public let id: UUID
    public var name: String
    public var email: String
    public var phoneNumber: String?
    public var billingAddress: String?

    public init(id: UUID = UUID(), name: String, email: String, phoneNumber: String? = nil, billingAddress: String? = nil) {
        self.id = id
        self.name = name
        self.email = email
        self.phoneNumber = phoneNumber
        self.billingAddress = billingAddress
    }
}
