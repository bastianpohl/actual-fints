import SwiftUI

struct ListRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .background(configuration.isPressed ? Color.themeCardBorder.opacity(0.5) : Color.clear)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct BankEditorItem: Identifiable {
    let id = UUID()
    let bank: BankConfig?
}

struct BanksView: View {
    @ObservedObject var networkManager = NetworkManager.shared
    
    @State private var banks: [BankConfig] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    
    @State private var activeEditorItem: BankEditorItem? = nil
    
    // Deletion confirmation
    @State private var bankToDelete: BankConfig? = nil
    @State private var isShowingDeleteConfirmation = false
    
    // Background connection test
    @State private var isTestingConnection = false
    @State private var alertTitle = ""
    @State private var alertMessage = ""
    @State private var isShowingAlert = false
    
    var body: some View {
        NavigationStack {
            Group {
                if isLoading && banks.isEmpty {
                    ProgressView("Lade Bankverbindungen...")
                } else if let error = errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.slash")
                            .font(.largeTitle)
                            .foregroundColor(.themeDanger)
                        Text(error)
                            .foregroundColor(.themeTextPrimary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        Button("Erneut versuchen") {
                            triggerSelectionHaptic()
                            Task { await loadBanks() }
                        }
                        .buttonStyle(.bordered)
                        .tint(.themeAccent)
                    }
                } else if banks.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "building.columns")
                            .font(.system(size: 70))
                            .foregroundColor(.themeTextMuted)
                        Text("Keine Banken eingerichtet")
                            .font(.title3)
                            .fontWeight(.bold)
                            .foregroundColor(.themeTextPrimary)
                        Text("Konfiguriere deinen ersten Bankzugang, um Umsätze abrufen zu können.")
                            .font(.subheadline)
                            .foregroundColor(.themeTextSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 30)
                        
                        Button(action: {
                            triggerSelectionHaptic()
                            activeEditorItem = BankEditorItem(bank: nil)
                        }) {
                            Text("Bank hinzufügen")
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 12)
                                .background(Color.themeAccent)
                                .cornerRadius(10)
                        }
                    }
                    .padding()
                } else {
                    List {
                        ForEach(banks) { bank in
                            Section(header: HStack {
                                Image(systemName: "building.columns.fill")
                                    .foregroundColor(.themeAccent)
                                    .font(.subheadline)
                                Text(bank.name)
                                    .font(.headline)
                                    .fontWeight(.bold)
                                    .foregroundColor(.themeTextPrimary)
                                Spacer()
                                Text("BLZ: \(bank.fints.blz)")
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundColor(.themeTextSecondary)
                            }) {
                                if bank.accounts.isEmpty {
                                    HStack {
                                        Label("Keine Kontomappings", systemImage: "exclamationmark.triangle")
                                            .foregroundColor(.themeWarning)
                                            .font(.subheadline)
                                        Spacer()
                                    }
                                    .listRowBackground(Color.themeCardBg)
                                } else {
                                    ForEach(bank.accounts) { acc in
                                        HStack {
                                            Label {
                                                Text(maskIBAN(acc.iban))
                                                    .font(.system(.subheadline, design: .monospaced))
                                                    .foregroundColor(.themeTextPrimary)
                                            } icon: {
                                                Image(systemName: "creditcard.fill")
                                                    .foregroundColor(.themeAccent.opacity(0.8))
                                            }
                                            
                                            Spacer()
                                            
                                            Text(acc.actualAccountName.isEmpty ? "Nicht verknüpft" : acc.actualAccountName)
                                                .font(.subheadline)
                                                .fontWeight(.medium)
                                                .foregroundColor(acc.actualAccountName.isEmpty ? .themeWarning : .themeSuccess)
                                        }
                                        .listRowBackground(Color.themeCardBg)
                                    }
                                }
                                
                                Button(action: {
                                    triggerSelectionHaptic()
                                    activeEditorItem = BankEditorItem(bank: bank)
                                }) {
                                    HStack {
                                        Label("Verbindung verwalten", systemImage: "slider.horizontal.3")
                                            .foregroundColor(.themeAccent)
                                            .fontWeight(.medium)
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 12, weight: .bold))
                                            .foregroundColor(.themeTextMuted)
                                    }
                                    .padding(.vertical, 4)
                                }
                                .buttonStyle(ListRowButtonStyle())
                                .listRowBackground(Color.themeCardBg)
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        bankToDelete = bank
                                        isShowingDeleteConfirmation = true
                                    } label: {
                                        Label("Löschen", systemImage: "trash")
                                    }
                                }
                                .contextMenu {
                                    Button {
                                        triggerSelectionHaptic()
                                        activeEditorItem = BankEditorItem(bank: bank)
                                    } label: {
                                        Label("Bearbeiten", systemImage: "pencil")
                                    }
                                    
                                    Button {
                                        testConnection(for: bank)
                                    } label: {
                                        Label("Verbindung testen", systemImage: "network")
                                    }
                                    
                                    Button(role: .destructive) {
                                        bankToDelete = bank
                                        isShowingDeleteConfirmation = true
                                    } label: {
                                        Label("Löschen", systemImage: "trash")
                                    }
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                    .background(Color.themeBgPrimary)
                }
            }
            .background(Color.themeBgPrimary)
            .navigationTitle("Bankverbindungen")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        triggerSelectionHaptic()
                        activeEditorItem = BankEditorItem(bank: nil)
                    }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .refreshable {
                await loadBanks()
            }
            .onAppear {
                if let cachedBanks: [BankConfig] = LocalCacheManager.shared.load(from: "banks.json") {
                    self.banks = cachedBanks
                }
                Task {
                    await loadBanks()
                }
            }
            .sheet(item: $activeEditorItem, onDismiss: {
                Task { await loadBanks() }
            }) { item in
                BankEditorView(bank: item.bank)
            }
            .confirmationDialog(
                "Bankverbindung löschen?",
                isPresented: $isShowingDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Löschen", role: .destructive) {
                    if let bank = bankToDelete {
                        deleteBank(bank)
                    }
                }
                Button("Abbrechen", role: .cancel) {
                    bankToDelete = nil
                }
            } message: {
                if let bank = bankToDelete {
                    Text("Möchtest du die Bankverbindung '\(bank.name)' wirklich löschen? Alle zugeordneten Kontomappings werden dabei entfernt.")
                }
            }
            .alert(alertTitle, isPresented: $isShowingAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(alertMessage)
            }
            .overlay {
                if isTestingConnection {
                    ZStack {
                        Color.black.opacity(0.15)
                            .ignoresSafeArea()
                        ProgressView("Verbindung wird getestet...")
                            .padding()
                            .background(Color.themeCardBg)
                            .cornerRadius(12)
                            .shadow(radius: 10)
                    }
                }
            }
        }
    }
    
    private func loadBanks() async {
        isLoading = true
        errorMessage = nil
        do {
            let fetchedBanks = try await networkManager.fetchBanks()
            banks = fetchedBanks
            LocalCacheManager.shared.save(fetchedBanks, to: "banks.json")
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    private func deleteBank(_ bank: BankConfig) {
        guard let index = banks.firstIndex(where: { $0.id == bank.id || $0.name == bank.name }) else { return }
        Task {
            do {
                try await networkManager.deleteBank(name: bank.name)
                banks.remove(at: index)
                triggerHapticFeedback(.success)
            } catch {
                errorMessage = "Fehler beim Löschen: \(error.localizedDescription)"
                triggerHapticFeedback(.error)
            }
            bankToDelete = nil
        }
    }
    
    private func testConnection(for bank: BankConfig) {
        isTestingConnection = true
        triggerSelectionHaptic()
        Task {
            do {
                let accounts = try await networkManager.testBankConnection(config: bank)
                alertTitle = "Verbindung erfolgreich!"
                alertMessage = "Verbindung zu \(bank.name) war erfolgreich. \(accounts.count) Konten gefunden."
                triggerHapticFeedback(.success)
                isShowingAlert = true
            } catch {
                alertTitle = "Verbindung fehlgeschlagen"
                alertMessage = error.localizedDescription
                triggerHapticFeedback(.error)
                isShowingAlert = true
            }
            isTestingConnection = false
        }
    }
    
    private func maskIBAN(_ iban: String) -> String {
        guard iban.count > 10 else { return iban }
        let start = iban.prefix(4)
        let end = iban.suffix(4)
        return "\(start)...\(end)"
    }
    
    private func triggerHapticFeedback(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(type)
    }
    
    private func triggerSelectionHaptic() {
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }
}

