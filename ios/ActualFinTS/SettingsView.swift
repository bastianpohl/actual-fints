import SwiftUI

struct SettingsView: View {
    @ObservedObject var networkManager = NetworkManager.shared
    
    // Native API setup
    @AppStorage("server_url") private var serverUrl: String = ""
    @AppStorage("api_key") private var apiKey: String = ""
    
    // Actual Budget Server configuration
    @State private var abUrl: String = ""
    @State private var abSyncDb: String = ""
    @State private var abPass: String = ""
    
    @State private var status: ServerStatus? = nil
    
    // UI Helpers
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var isTesting = false
    @State private var message: String? = nil
    @State private var isError = false
    
    @State private var isShowingCronLog = false
    
    var body: some View {
        NavigationStack {
            Form {
                if let msg = message {
                    Section {
                        HStack {
                            Image(systemName: isError ? "exclamationmark.octagon.fill" : "checkmark.circle.fill")
                                .foregroundColor(isError ? .themeDanger : .themeSuccess)
                            Text(msg)
                                .foregroundColor(isError ? .themeDanger : .themeTextPrimary)
                                .font(.subheadline)
                        }
                    }
                }
                
                Section(header: Text("Actual-FinTS Server Verbindung")) {
                    TextField("Server-URL", text: $serverUrl)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    
                    SecureField("App API Key", text: $apiKey)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
                
                Section(header: Text("Actual Budget Integration")) {
                    TextField("Actual Server URL", text: $abUrl)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    
                    TextField("Budget Sync ID", text: $abSyncDb)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    
                    SecureField("Verbindungs-Passwort / Token", text: $abPass)
                        .textInputAutocapitalization(.never)
                    
                    HStack {
                        Button("Verbindung testen") { testBudget() }
                            .disabled(isTesting || abUrl.isEmpty || abSyncDb.isEmpty)
                            .tint(.themeAccent)
                        
                        Spacer()
                        
                        Button("Speichern") { saveBudget() }
                            .disabled(isSaving || abUrl.isEmpty || abSyncDb.isEmpty)
                            .tint(.themeAccent)
                    }
                }
                
                if let s = status {
                    Section(header: Text("Automatischer Hintergrund-Sync (Server)")) {
                        LabeledContent("Intervall (Cron)", value: s.cronSchedule ?? "Nicht aktiv")
                        if let next = s.nextCronSync {
                            LabeledContent("Nächster Lauf", value: formatISO(next))
                        }
                        if let last = s.lastCronSync {
                            LabeledContent("Letzter Lauf", value: formatISO(last))
                        }
                        
                        if s.lastCronSyncLog != nil {
                            Button("Letzten Cron-Protokoll anzeigen") {
                                isShowingCronLog = true
                            }
                        }
                    }
                }
                
                Section(header: Text("Server Systemverwaltung")) {
                    Button(action: runGitUpdate) {
                        Label("Systemaktualisierung (Git Pull)", systemImage: "arrow.down.circle.fill")
                    }
                    .tint(.themeAccent)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.themeBgPrimary)
            .navigationTitle("Einstellungen")
            .sheet(isPresented: $isShowingCronLog) {
                CronLogSheet(log: status?.lastCronSyncLog ?? "")
            }
            .onAppear {
                if let cachedStatus: ServerStatus = LocalCacheManager.shared.load(from: "status.json") {
                    self.status = cachedStatus
                }
                if let cachedBudget: BudgetConfig = LocalCacheManager.shared.load(from: "budget_config.json") {
                    self.abUrl = cachedBudget.url
                    self.abSyncDb = cachedBudget.syncDb
                    self.abPass = cachedBudget.hasPassword ? "●●●●●●●●" : ""
                }
                
                Task {
                    await loadStatus()
                    await loadBudgetConfig()
                }
            }
        }
    }
    
    private func loadStatus() async {
        do {
            let fetchedStatus = try await networkManager.fetchStatus()
            status = fetchedStatus
            LocalCacheManager.shared.save(fetchedStatus, to: "status.json")
        } catch {
            print("Failed to fetch server status: \(error)")
        }
    }
    
    private func loadBudgetConfig() async {
        guard !serverUrl.isEmpty else { return }
        do {
            let config = try await networkManager.fetchBudgetConfig()
            abUrl = config.url
            abSyncDb = config.syncDb
            abPass = config.hasPassword ? "●●●●●●●●" : ""
            LocalCacheManager.shared.save(config, to: "budget_config.json")
        } catch {
            print("Failed to fetch budget config: \(error)")
        }
    }
    
    private func saveBudget() {
        isSaving = true
        message = nil
        isError = false
        
        let pass = abPass == "●●●●●●●●" ? nil : abPass
        
        Task {
            do {
                try await networkManager.saveBudgetConfig(url: abUrl, syncDb: abSyncDb, password: pass)
                message = "Budget-Konfiguration erfolgreich gespeichert."
                await loadStatus()
            } catch {
                isError = true
                message = "Fehler beim Speichern: \(error.localizedDescription)"
            }
            isSaving = false
        }
    }
    
    private func testBudget() {
        isTesting = true
        message = nil
        isError = false
        
        let pass = abPass == "●●●●●●●●" ? nil : abPass
        
        Task {
            do {
                try await networkManager.testBudgetConfig(url: abUrl, syncDb: abSyncDb, password: pass)
                message = "Verbindung zu Actual Budget erfolgreich!"
            } catch {
                isError = true
                message = "Verbindungstest gescheitert: \(error.localizedDescription)"
            }
            isTesting = false
        }
    }
    
    private func runGitUpdate() {
        message = nil
        isError = false
        Task {
            do {
                let output = try await networkManager.runGitUpdate()
                message = "Update erfolgreich: \(output)"
            } catch {
                isError = true
                message = "Update gescheitert: \(error.localizedDescription)"
            }
        }
    }
    
    private func formatISO(_ dateStr: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: dateStr) ?? ISO8601DateFormatter().date(from: dateStr) else {
            // Check if it's already in German format: "dd.MM.yyyy, HH:mm:ss" or similar
            let deFormatter = DateFormatter()
            deFormatter.locale = Locale(identifier: "de_DE")
            deFormatter.dateFormat = "dd.M.yyyy, HH:mm:ss"
            if let parsed = deFormatter.date(from: dateStr) {
                let outFormatter = DateFormatter()
                outFormatter.locale = Locale(identifier: "de_DE")
                outFormatter.dateFormat = "dd.MM.yyyy, HH:mm"
                return outFormatter.string(from: parsed)
            }
            deFormatter.dateFormat = "d.M.yyyy, HH:mm:ss"
            if let parsed = deFormatter.date(from: dateStr) {
                let outFormatter = DateFormatter()
                outFormatter.locale = Locale(identifier: "de_DE")
                outFormatter.dateFormat = "dd.MM.yyyy, HH:mm"
                return outFormatter.string(from: parsed)
            }
            return dateStr
        }
        let outputFormatter = DateFormatter()
        outputFormatter.locale = Locale(identifier: "de_DE")
        outputFormatter.dateFormat = "dd.MM.yyyy, HH:mm"
        return outputFormatter.string(from: date)
    }
}

struct CronLogSheet: View {
    @Environment(\.dismiss) var dismiss
    let log: String
    
    var body: some View {
        NavigationStack {
            ScrollView {
                Text(log)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundColor(Color(hex: "A7F3D0"))
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color(hex: "040206"))
            .navigationTitle("Cron-Sync Log")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Schließen") { dismiss() }
                }
            }
        }
    }
}
