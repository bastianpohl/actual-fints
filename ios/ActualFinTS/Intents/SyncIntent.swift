import AppIntents
import Foundation
import UserNotifications

struct SyncTransactionsIntent: AppIntent {
    static let title: LocalizedStringResource = "Transactions synchronisieren"
    static let description = IntentDescription("Triggert den Import neuer Bankumsätze in Actual Budget.")
    
    static let isDiscoverable: Bool = true
    static let openAppWhenRun: Bool = false
    
    @available(iOS 26.0, *)
    static var supportedModes: IntentModes { [.background] }
    
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        do {
            // Run network sync directly via URLSession (same logic as main App)
            guard let serverUrlString = UserDefaults.standard.string(forKey: "server_url"),
                  let serverUrl = URL(string: serverUrlString + "/api/transactions/load") else {
                let errorMsg = "Fehler: Keine Server-URL konfiguriert. Bitte öffne zuerst die App."
                triggerLocalNotification(
                    title: "FinTS-Import FEHLGESCHLAGEN 🚨",
                    body: "Fehler beim Ausführen der Bank-Synchronisation!\n\nFehlermeldung:\n\(errorMsg)"
                )
                return .result(value: errorMsg)
            }
            
            let apiKey = UserDefaults.standard.string(forKey: "api_key") ?? ""
            
            var request = URLRequest(url: serverUrl)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.timeoutInterval = 30 // 30 seconds timeout
            
            if !apiKey.isEmpty {
                request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
            }
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                let errorMsg = "Fehler: Server-Antwort konnte nicht geladen werden."
                triggerLocalNotification(
                    title: "FinTS-Import FEHLGESCHLAGEN 🚨",
                    body: "Fehler beim Ausführen der Bank-Synchronisation!\n\nFehlermeldung:\n\(errorMsg)"
                )
                return .result(value: errorMsg)
            }
            
            if httpResponse.statusCode == 200 {
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let success = json["success"] as? Bool, success {
                    
                    // Group and count new transactions for formatting push message
                    var addedByAccount: [String: [[String: Any]]] = [:]
                    var totalAdded = 0
                    
                    if let results = json["results"] as? [[String: Any]] {
                        for accountResult in results {
                            guard let accountName = accountResult["account"] as? String,
                                  let transactions = accountResult["transactions"] as? [[String: Any]] else {
                                continue
                            }
                            
                            for tx in transactions {
                                if let status = tx["status"] as? String, status == "added" {
                                    addedByAccount[accountName, default: []].append(tx)
                                    totalAdded += 1
                                }
                            }
                        }
                    }
                    
                    let title: String
                    let body: String
                    var summary = ""
                    
                    if totalAdded > 0 {
                        title = totalAdded == 1 ? "1 neuer Umsatz importiert 🏦" : "\(totalAdded) neue Umsätze importiert 🏦"
                        
                        var lines: [String] = []
                        summary = "Synchronisation erfolgreich! Neue Umsätze:\n"
                        for (account, txs) in addedByAccount {
                            lines.append("💳 \(account):")
                            summary += "- \(account): +\(txs.count) Umsätze\n"
                            for tx in txs {
                                let payee = tx["payee"] as? String ?? "Unbekannt"
                                let dateStr = tx["date"] as? String ?? ""
                                
                                let amountRaw = tx["amount"]
                                let amountDouble: Double
                                if let val = amountRaw as? Double {
                                    amountDouble = val / 100.0
                                } else if let val = amountRaw as? Int {
                                    amountDouble = Double(val) / 100.0
                                } else {
                                    amountDouble = 0.0
                                }
                                
                                let formattedDate = formatDate(dateStr)
                                let formattedAmt = amountDouble.formattedAsGermanCurrency()
                                lines.append("  • \(formattedDate) \(payee): \(formattedAmt)")
                            }
                            lines.append("")
                        }
                        body = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                        summary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
                    } else {
                        title = "FinTS-Import erfolgreich 🔄"
                        body = "Alle Konten sind auf dem neuesten Stand. Keine neuen Umsätze gefunden."
                        summary = "Umsätze erfolgreich importiert. Keine neuen Umsätze."
                    }
                    
                    triggerLocalNotification(title: title, body: body)
                    return .result(value: summary)
                }
                
                // Fallback success
                let title = "FinTS-Import erfolgreich 🔄"
                let body = "Umsätze erfolgreich importiert."
                triggerLocalNotification(title: title, body: body)
                return .result(value: body)
                
            } else if httpResponse.statusCode == 401 {
                let errorMsg = "Fehler: Nicht autorisiert. Bitte überprüfe den API Key."
                triggerLocalNotification(
                    title: "FinTS-Import FEHLGESCHLAGEN 🚨",
                    body: "Fehler beim Ausführen der Bank-Synchronisation!\n\nFehlermeldung:\n\(errorMsg)"
                )
                return .result(value: errorMsg)
            } else {
                let errorMsg = "Fehler: Server gab Statuscode \(httpResponse.statusCode) zurück."
                triggerLocalNotification(
                    title: "FinTS-Import FEHLGESCHLAGEN 🚨",
                    body: "Fehler beim Ausführen der Bank-Synchronisation!\n\nFehlermeldung:\n\(errorMsg)"
                )
                return .result(value: errorMsg)
            }
        } catch {
            let errorMsg = "Fehler beim Synchronisieren: \(error.localizedDescription)"
            triggerLocalNotification(
                title: "FinTS-Import FEHLGESCHLAGEN 🚨",
                body: "Fehler beim Ausführen der Bank-Synchronisation!\n\nFehlermeldung:\n\(errorMsg)"
            )
            return .result(value: errorMsg)
        }
    }
}

struct ActualFinTSShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SyncTransactionsIntent(),
            phrases: [
                "Synchronisiere meine \(.applicationName) Umsätze",
                "Transactions synchronisieren mit \(.applicationName)",
                "Umsatz-Sync starten in \(.applicationName)"
            ],
            shortTitle: "Umsätze synchronisieren",
            systemImageName: "bolt.fill"
        )
    }
}

// Fileprivate helpers
private func triggerLocalNotification(title: String, body: String) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
    let request = UNNotificationRequest(
        identifier: UUID().uuidString,
        content: content,
        trigger: trigger
    )
    
    UNUserNotificationCenter.current().add(request) { error in
        if let error = error {
            print("Fehler beim Senden der lokalen Benachrichtigung: \(error.localizedDescription)")
        }
    }
}

private func formatDate(_ dateStr: String) -> String {
    let parts = dateStr.split(separator: "-")
    if parts.count == 3 {
        return "\(parts[2]).\(parts[1]).\(parts[0])"
    }
    return dateStr
}
