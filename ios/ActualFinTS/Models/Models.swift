import Foundation

struct ServerStatus: Codable {
    let actualBudgetConfigured: Bool
    let masterKeyConfigured: Bool
    let bankCount: Int
    let accountCount: Int
    let lastSync: String?
    let cronSchedule: String?
    let lastCronSync: String?
    let lastCronSyncLog: String?
    let nextCronSync: String?
    let dbError: String?
    /// Days the server reaches into the past when a sync runs without an explicit range.
    /// Optional so the app keeps working against servers that predate the field.
    let syncLookbackDays: Int?
}

struct FinTSDetails: Codable, Equatable {
    var url: String
    var blz: String
    var login: String
    var pin: String
}

struct AccountMapping: Codable, Equatable, Identifiable {
    var id: String { iban }
    var iban: String
    var actualAccountName: String
}

struct BankConfig: Codable, Equatable, Identifiable {
    var id: Int?
    var name: String
    var fints: FinTSDetails
    var accounts: [AccountMapping]
}

struct TestBankAccount: Codable, Identifiable {
    var id: String { iban }
    let iban: String
    let name: String
    let productName: String
}

struct TestBankResponse: Codable {
    let success: Bool
    let accounts: [TestBankAccount]?
}

struct ActualAccount: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let offbudget: Bool
    let closed: Bool
}

struct ActualAccountsResponse: Codable {
    let success: Bool
    let accounts: [ActualAccount]?
}

struct BudgetConfig: Codable {
    let url: String
    let syncDb: String
    let hasPassword: Bool
}

struct ImportedTransaction: Codable, Identifiable, Equatable {
    var id: String { date + account + payee + String(amount) + status }
    let date: String
    let account: String
    let payee: String
    let amount: Double
    let status: String // "added", "updated", or "ignored"
}

struct SyncResponse: Codable {
    let success: Bool
    let results: [AccountSyncResult]?
    let output: String?
    let error: String?
}

struct AccountSyncResult: Codable {
    let account: String
    let added: Int
    let updated: Int
    let ignored: Int
    let transactions: [SyncTransactionDetail]
}

struct SyncTransactionDetail: Codable {
    let date: String
    let payee: String
    let amount: Double
    let status: String
}

struct SimpleResponse: Codable {
    let success: Bool
    let error: String?
}

struct GitUpdateResponse: Codable {
    let output: String?
    let error: String?
}

struct LogsResponse: Codable {
    let logs: String
}

enum LogStatus: String, Codable {
    case success
    case warning
    case error
}

struct LogRun: Identifiable, Equatable {
    var id: String { timestamp + range }
    let timestamp: String
    let parsedDate: Date
    let range: String
    let stdout: String
    let stderr: String
    let status: LogStatus
    let processedAccounts: [String]
    let errorMessage: String?
}

struct AccountBalance: Codable, Identifiable, Equatable {
    var id: String { iban }
    let iban: String
    let name: String
    let productName: String?
    let balance: Double
    let actualBalance: Double?
    let currency: String
    let bankName: String
    let lastUpdated: String
}

struct BankBalanceError: Codable, Identifiable, Equatable {
    var id: String { bankName }
    let bankName: String
    let error: String
}

struct BalancesResponse: Codable {
    let success: Bool
    let balances: [AccountBalance]?
    let errors: [BankBalanceError]?
}

extension Double {
    func formattedAsGermanCurrency() -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        let formattedString = formatter.string(from: NSNumber(value: self)) ?? String(format: "%.2f", self)
        return "\(formattedString) €"
    }
}

#if canImport(SwiftUI) && canImport(UIKit)
import SwiftUI
import UIKit

extension UIColor {
    convenience init(hex: String) {
        var cleanHex = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if cleanHex.hasPrefix("#") {
            cleanHex.removeFirst()
        }
        var int: UInt64 = 0
        Scanner(string: cleanHex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch cleanHex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            red: CGFloat(r) / 255,
            green: CGFloat(g) / 255,
            blue: CGFloat(b) / 255,
            alpha: CGFloat(a) / 255
        )
    }

    static func themeDynamicColor(light: String, dark: String, lightAlpha: CGFloat = 1.0, darkAlpha: CGFloat = 1.0) -> UIColor {
        return UIColor { traitCollection in
            switch traitCollection.userInterfaceStyle {
            case .dark:
                return UIColor(hex: dark).withAlphaComponent(darkAlpha)
            default:
                return UIColor(hex: light).withAlphaComponent(lightAlpha)
            }
        }
    }
}

extension Color {
    init(hex: String) {
        self.init(UIColor(hex: hex))
    }
    
    static let themeAccent = Color(.themeDynamicColor(light: "0A7382", dark: "0A7382"))
    static let themeAccentSecondary = Color(.themeDynamicColor(light: "06B6D4", dark: "06B6D4"))
    
    static let themeBgPrimary = Color(.themeDynamicColor(light: "F3F4F6", dark: "07090e"))
    static let themeBgSecondary = Color(.themeDynamicColor(light: "FFFFFF", dark: "0d111a"))
    static let themeCardBg = Color(.themeDynamicColor(light: "FFFFFF", dark: "0F1624", lightAlpha: 0.75, darkAlpha: 0.65))
    static let themeCardBorder = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark ? UIColor.white.withAlphaComponent(0.07) : UIColor.black.withAlphaComponent(0.07)
    })
    
    static let themeTextPrimary = Color(.themeDynamicColor(light: "1F2937", dark: "F3F4F6"))
    static let themeTextSecondary = Color(.themeDynamicColor(light: "4B5563", dark: "9CA3AF"))
    static let themeTextMuted = Color(.themeDynamicColor(light: "9CA3AF", dark: "6B7280"))
    
    static let themeSuccess = Color(.themeDynamicColor(light: "059669", dark: "10B981"))
    static let themeWarning = Color(.themeDynamicColor(light: "D97706", dark: "F59E0B"))
    static let themeDanger = Color(.themeDynamicColor(light: "DC2626", dark: "EF4444"))
}
#endif



