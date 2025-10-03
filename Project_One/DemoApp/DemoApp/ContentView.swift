import SwiftUI
import InvoiceKit

struct ContentView: View {
    @EnvironmentObject private var invoiceManager: ObservableInvoiceManager
    @State private var showingNewInvoiceAlert = false

    var body: some View {
        NavigationStack {
            List(invoiceManager.invoices) { invoice in
                InvoiceRow(invoice: invoice)
            }
            .navigationTitle("Invoices")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingNewInvoiceAlert = true
                    } label: {
                        Label("Add Invoice", systemImage: "plus")
                    }
                    .accessibilityIdentifier("addInvoiceButton")
                }
            }
            .alert("New Invoice", isPresented: $showingNewInvoiceAlert) {
                Button("Create Sample") {
                    invoiceManager.createSampleInvoice()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Generate a new sample invoice using InvoiceKit models.")
            }
        }
    }
}

private struct InvoiceRow: View {
    let invoice: Invoice

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(invoice.number)
                    .font(.headline)
                Spacer()
                Text(invoice.status.rawValue.capitalized)
                    .font(.caption)
                    .padding(6)
                    .background(statusColor.opacity(0.15))
                    .foregroundColor(statusColor)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel("Status: \(invoice.status.rawValue)")
            }
            Text(invoice.client.name)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            HStack {
                Text("Total: \(invoice.total as NSDecimalNumber, formatter: currencyFormatter)")
                Spacer()
                Text("Due: \(invoice.dueDate, formatter: dateFormatter)")
                    .foregroundStyle(invoice.isOverdue ? Color.red : Color.secondary)
            }
            .font(.footnote)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private var statusColor: Color {
        switch invoice.status {
        case .draft:
            return .gray
        case .sent:
            return .blue
        case .paid:
            return .green
        case .overdue:
            return .red
        case .cancelled:
            return .orange
        }
    }
}

private let currencyFormatter: NumberFormatter = {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    return formatter
}()

private let dateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    return formatter
}()

#Preview {
    ContentView()
        .environmentObject(ObservableInvoiceManager())
}
