import Foundation
import SwiftUI

@MainActor
class NetworkManager: ObservableObject {
    static let shared = NetworkManager()
    
    @AppStorage("server_url") private var serverUrl: String = ""
    @AppStorage("api_key") private var apiKey: String = ""
    
    private init() {}
    
    private func getBaseURL() throws -> URL {
        guard let url = URL(string: serverUrl) else {
            throw NSError(domain: "NetworkManager", code: 400, userInfo: [NSLocalizedDescriptionKey: "Ungültige Server-URL konfiguriert."])
        }
        return url
    }
    
    private func makeRequest(url: URL, method: String, body: Data? = nil) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        
        if let body = body {
            request.httpBody = body
        }
        
        return request
    }
    
    private func sendRequest<T: Decodable>(endpoint: String, method: String, body: Data? = nil) async throws -> T {
        let baseUrl = try getBaseURL()
        let fullUrl = baseUrl.appendingPathComponent(endpoint)
        let request = makeRequest(url: fullUrl, method: method, body: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(domain: "NetworkManager", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server-Antwort konnte nicht interpretiert werden."])
        }
        
        if httpResponse.statusCode == 401 {
            throw NSError(domain: "NetworkManager", code: 401, userInfo: [NSLocalizedDescriptionKey: "Nicht autorisiert. Bitte überprüfe den API Key in den Einstellungen."])
        }
        
        if httpResponse.statusCode >= 400 {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unbekannter Fehler (Statuscode \(httpResponse.statusCode))"
            // Try parsing JSON error
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let err = json["error"] as? String {
                throw NSError(domain: "NetworkManager", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: err])
            }
            throw NSError(domain: "NetworkManager", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMsg])
        }
        
        do {
            let decoder = JSONDecoder()
            return try decoder.decode(T.self, from: data)
        } catch {
            print("Decoding error: \(error)")
            // Fallback for plain string / malformed JSON responses if status code was 200
            throw error
        }
    }
    
    func fetchStatus() async throws -> ServerStatus {
        return try await sendRequest(endpoint: "/api/status", method: "GET")
    }
    
    func fetchBanks() async throws -> [BankConfig] {
        return try await sendRequest(endpoint: "/api/banks", method: "GET")
    }
    
    func saveBank(config: BankConfig, isEdit: Bool, originalName: String?) async throws {
        let body = try JSONEncoder().encode(config)
        if isEdit, let name = originalName {
            let encodedName = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
            let _: SimpleResponse = try await sendRequest(endpoint: "/api/banks/\(encodedName)", method: "PUT", body: body)
        } else {
            let _: SimpleResponse = try await sendRequest(endpoint: "/api/banks", method: "POST", body: body)
        }
    }
    
    func deleteBank(name: String) async throws {
        let encodedName = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        let _: SimpleResponse = try await sendRequest(endpoint: "/api/banks/\(encodedName)", method: "DELETE")
    }
    
    func testBankConnection(config: BankConfig) async throws -> [TestBankAccount] {
        // Prepare request body with raw pin/login since we are editing/testing
        let testConfig = [
            "name": config.name,
            "url": config.fints.url,
            "blz": config.fints.blz,
            "login": config.fints.login,
            "pin": config.fints.pin
        ]
        let body = try JSONSerialization.data(withJSONObject: testConfig)
        let response: TestBankResponse = try await sendRequest(endpoint: "/api/banks/test", method: "POST", body: body)
        guard response.success, let accounts = response.accounts else {
            throw NSError(domain: "NetworkManager", code: 400, userInfo: [NSLocalizedDescriptionKey: "Verbindungstest fehlgeschlagen."])
        }
        return accounts
    }
    
    func fetchLogs() async throws -> String {
        let response: LogsResponse = try await sendRequest(endpoint: "/api/logs", method: "GET")
        return response.logs
    }
    
    func syncTransactions(startDate: String?, endDate: String?) async throws -> [ImportedTransaction] {
        var params: [String: String] = [:]
        if let start = startDate, !start.isEmpty { params["start"] = start }
        if let end = endDate, !end.isEmpty { params["end"] = end }
        
        let body = try JSONSerialization.data(withJSONObject: params)
        let response: SyncResponse = try await sendRequest(endpoint: "/api/transactions/load", method: "POST", body: body)
        
        guard response.success else {
            throw NSError(domain: "NetworkManager", code: 400, userInfo: [NSLocalizedDescriptionKey: response.error ?? "Import fehlgeschlagen."])
        }
        
        var flatTransactions: [ImportedTransaction] = []
        if let results = response.results {
            for accountResult in results {
                for tx in accountResult.transactions {
                    // Divide amount by 100 because server returns cents
                    let amountInEuro = tx.amount / 100.0
                    flatTransactions.append(ImportedTransaction(
                        date: tx.date,
                        account: accountResult.account,
                        payee: tx.payee,
                        amount: amountInEuro,
                        status: tx.status
                    ))
                }
            }
        }
        
        return flatTransactions
    }
    
    func fetchBudgetConfig() async throws -> BudgetConfig {
        return try await sendRequest(endpoint: "/api/budget/config", method: "GET")
    }
    
    func saveBudgetConfig(url: String, syncDb: String, password: String?) async throws {
        var params: [String: String] = [
            "url": url,
            "syncDb": syncDb
        ]
        if let pass = password, !pass.isEmpty {
            params["password"] = pass
        }
        let body = try JSONSerialization.data(withJSONObject: params)
        let _: SimpleResponse = try await sendRequest(endpoint: "/api/budget/config", method: "POST", body: body)
    }
    
    func fetchBudgetAccounts() async throws -> [ActualAccount] {
        let response: ActualAccountsResponse = try await sendRequest(endpoint: "/api/budget/accounts", method: "GET")
        return response.accounts ?? []
    }
    
    func testBudgetConfig(url: String, syncDb: String, password: String?) async throws {
        var params: [String: String] = [
            "url": url,
            "syncDb": syncDb
        ]
        if let pass = password, !pass.isEmpty {
            params["password"] = pass
        }
        let body = try JSONSerialization.data(withJSONObject: params)
        let _: SimpleResponse = try await sendRequest(endpoint: "/api/budget/test", method: "POST", body: body)
    }
    
    func runGitUpdate() async throws -> String {
        let response: GitUpdateResponse = try await sendRequest(endpoint: "/api/update/config", method: "PUT")
        return response.output ?? "Git pull abgeschlossen."
    }
    
    func fetchBalances() async throws -> BalancesResponse {
        return try await sendRequest(endpoint: "/api/banks/balances", method: "GET")
    }
}
