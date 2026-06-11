import SwiftUI

struct BankEditorView: View {
    @Environment(\.dismiss) var dismiss
    @ObservedObject var networkManager = NetworkManager.shared
    
    // Config state
    @State private var name: String = ""
    @State private var url: String = ""
    @State private var blz: String = ""
    @State private var login: String = ""
    @State private var pin: String = ""
    @State private var accounts: [AccountMapping] = []
    
    // UI Helpers
    let isEditMode: Bool
    let originalName: String?
    
    @State private var isTesting = false
    @State private var isSaving = false
    @State private var errorMessage: String? = nil
    @State private var testSuccessMessage: String? = nil
    @State private var isShowingDeleteDialog = false
    
    // Dropdown selection fields
    @State private var budgetAccounts: [ActualAccount] = []
    
    init(bank: BankConfig? = nil) {
        if let b = bank {
            isEditMode = true
            originalName = b.name
            _name = State(initialValue: b.name)
            _url = State(initialValue: b.fints.url)
            _blz = State(initialValue: b.fints.blz)
            _login = State(initialValue: b.fints.login)
            _pin = State(initialValue: b.fints.pin)
            _accounts = State(initialValue: b.accounts)
        } else {
            isEditMode = false
            originalName = nil
            _name = State(initialValue: "")
            _url = State(initialValue: "")
            _blz = State(initialValue: "")
            _login = State(initialValue: "")
            _pin = State(initialValue: "")
            _accounts = State(initialValue: [])
        }
    }
    
    var body: some View {
        NavigationStack {
            Form {
                if let error = errorMessage {
                    Section {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "exclamationmark.octagon.fill")
                                .font(.title3)
                                .foregroundColor(.themeDanger)
                                .padding(.top, 2)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Fehler")
                                    .font(.subheadline)
                                    .fontWeight(.bold)
                                    .foregroundColor(.themeDanger)
                                Text(error)
                                    .font(.caption)
                                    .foregroundColor(.themeTextPrimary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowBackground(Color.themeDanger.opacity(0.1))
                }
                
                if let success = testSuccessMessage {
                    Section {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.title3)
                                .foregroundColor(.themeSuccess)
                                .padding(.top, 2)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Verbindung erfolgreich")
                                    .font(.subheadline)
                                    .fontWeight(.bold)
                                    .foregroundColor(.themeSuccess)
                                Text(success)
                                    .font(.caption)
                                    .foregroundColor(.themeTextPrimary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowBackground(Color.themeSuccess.opacity(0.1))
                }
                
                Section(header: Text("FinTS-Zugangsdaten")) {
                    HStack(spacing: 12) {
                        Image(systemName: "building.columns.fill")
                            .foregroundColor(.themeAccent)
                            .frame(width: 20)
                        TextField("Bankname (z.B. ING-DiBa)", text: $name)
                            .autocorrectionDisabled()
                    }
                    
                    HStack(spacing: 12) {
                        Image(systemName: "link")
                            .foregroundColor(.themeAccent)
                            .frame(width: 20)
                        TextField("FinTS-URL", text: $url)
                            .keyboardType(.URL)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                    
                    HStack(spacing: 12) {
                        Image(systemName: "number")
                            .foregroundColor(.themeAccent)
                            .frame(width: 20)
                        TextField("Bankleitzahl (BLZ)", text: $blz)
                            .keyboardType(.numberPad)
                    }
                    
                    HStack(spacing: 12) {
                        Image(systemName: "person.fill")
                            .foregroundColor(.themeAccent)
                            .frame(width: 20)
                        TextField("Anmeldename / Kontonummer", text: $login)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                    
                    HStack(spacing: 12) {
                        Image(systemName: "lock.fill")
                            .foregroundColor(.themeAccent)
                            .frame(width: 20)
                        SecureField("Online-Banking PIN (verschlüsselt)", text: $pin)
                            .textInputAutocapitalization(.never)
                    }
                }
                
                Section {
                    Button(action: testConnection) {
                        HStack {
                            if isTesting {
                                ProgressView()
                                    .padding(.trailing, 5)
                            }
                            Text("Verbindung testen")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(isTesting || name.isEmpty || url.isEmpty || blz.isEmpty || login.isEmpty || pin.isEmpty)
                    .tint(.themeAccent)
                }
                
                Section(header: Text("Konto-Mappings")) {
                    if accounts.isEmpty {
                        Text("Noch keine Konten eingerichtet. Klicke auf 'Verbindung testen', um Kontodaten abzurufen oder füge manuell Zeilen hinzu.")
                            .font(.caption)
                            .foregroundColor(.themeTextSecondary)
                    } else {
                        ForEach($accounts) { $acc in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Image(systemName: "creditcard.fill")
                                        .foregroundColor(.themeAccent)
                                        .font(.subheadline)
                                    Text(maskIBAN(acc.iban))
                                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                                        .foregroundColor(.themeTextPrimary)
                                    Spacer()
                                    if acc.actualAccountName.isEmpty {
                                        Image(systemName: "exclamationmark.triangle.fill")
                                            .foregroundColor(.themeWarning)
                                            .font(.caption)
                                    } else {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundColor(.themeSuccess)
                                            .font(.caption)
                                    }
                                }
                                
                                Picker("Actual Budget Konto", selection: $acc.actualAccountName) {
                                    Text("Auswählen...").tag("")
                                    if !acc.actualAccountName.isEmpty && !budgetAccounts.contains(where: { $0.name == acc.actualAccountName }) {
                                        Text(acc.actualAccountName).tag(acc.actualAccountName)
                                    }
                                    ForEach(budgetAccounts) { budgetAcc in
                                        Text(budgetAcc.name).tag(budgetAcc.name)
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(acc.actualAccountName.isEmpty ? .themeWarning : .themeAccent)
                            }
                            .padding(.vertical, 4)
                        }
                        .onDelete(perform: removeMapping)
                    }
                    
                    Button(action: addManualMappingRow) {
                        Label("Manuelle Mappingszeile", systemImage: "plus")
                            .font(.subheadline)
                    }
                    .tint(.themeAccent)
                }
                
                if isEditMode {
                    Section {
                        Button(role: .destructive) {
                            triggerSelectionHaptic()
                            isShowingDeleteDialog = true
                        } label: {
                            HStack {
                                Spacer()
                                Image(systemName: "trash.fill")
                                Text("Bankverbindung löschen")
                                    .fontWeight(.bold)
                                Spacer()
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.themeBgPrimary)
            .navigationTitle(isEditMode ? "Bank bearbeiten" : "Bank hinzufügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") { save() }
                        .disabled(isSaving || name.isEmpty || url.isEmpty || blz.isEmpty)
                        .fontWeight(.bold)
                }
            }
            .onAppear {
                Task {
                    await loadActualAccounts()
                }
            }
            .confirmationDialog(
                "Bankverbindung löschen?",
                isPresented: $isShowingDeleteDialog,
                titleVisibility: .visible
            ) {
                Button("Löschen", role: .destructive) {
                    deleteBank()
                }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Möchtest du die Bankverbindung '\(originalName ?? "")' wirklich löschen? Alle zugeordneten Kontomappings werden dabei entfernt.")
            }
        }
    }
    
    private func loadActualAccounts() async {
        do {
            budgetAccounts = try await networkManager.fetchBudgetAccounts()
        } catch {
            print("Failed to fetch budget accounts: \(error)")
        }
    }
    
    private func testConnection() {
        isTesting = true
        errorMessage = nil
        testSuccessMessage = nil
        triggerSelectionHaptic()
        
        let details = FinTSDetails(url: url, blz: blz, login: login, pin: pin)
        let config = BankConfig(id: nil, name: name, fints: details, accounts: accounts)
        
        Task {
            do {
                let fetchedAccounts = try await networkManager.testBankConnection(config: config)
                // Add any missing accounts
                for fetched in fetchedAccounts {
                    if !accounts.contains(where: { $0.iban == fetched.iban }) {
                        accounts.append(AccountMapping(iban: fetched.iban, actualAccountName: ""))
                    }
                }
                testSuccessMessage = "Erfolgreich! \(fetchedAccounts.count) Konten gefunden."
                triggerHapticFeedback(.success)
            } catch {
                errorMessage = "Verbindungstest gescheitert: \(error.localizedDescription)"
                triggerHapticFeedback(.error)
            }
            isTesting = false
        }
    }
    
    private func save() {
        isSaving = true
        errorMessage = nil
        triggerSelectionHaptic()
        
        let details = FinTSDetails(url: url, blz: blz, login: login, pin: pin)
        let config = BankConfig(id: nil, name: name, fints: details, accounts: accounts)
        
        Task {
            do {
                try await networkManager.saveBank(config: config, isEdit: isEditMode, originalName: originalName)
                triggerHapticFeedback(.success)
                dismiss()
            } catch {
                errorMessage = "Fehler beim Speichern: \(error.localizedDescription)"
                triggerHapticFeedback(.error)
            }
            isSaving = false
        }
    }
    
    private func deleteBank() {
        guard let name = originalName else { return }
        isSaving = true
        triggerSelectionHaptic()
        Task {
            do {
                try await networkManager.deleteBank(name: name)
                triggerHapticFeedback(.success)
                dismiss()
            } catch {
                errorMessage = "Fehler beim Löschen: \(error.localizedDescription)"
                triggerHapticFeedback(.error)
            }
            isSaving = false
        }
    }
    
    private func addManualMappingRow() {
        let alert = UIAlertController(title: "Manuelles Mapping", message: "Trage die IBAN des Kontos manuell ein.", preferredStyle: .alert)
        alert.addTextField { textField in
            textField.placeholder = "DE..."
            textField.autocapitalizationType = .allCharacters
        }
        alert.addAction(UIAlertAction(title: "Hinzufügen", style: .default, handler: { _ in
            if let text = alert.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
                accounts.append(AccountMapping(iban: text, actualAccountName: ""))
            }
        }))
        alert.addAction(UIAlertAction(title: "Abbrechen", style: .cancel))
        
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let rootVC = windowScene.windows.first?.rootViewController {
            rootVC.present(alert, animated: true)
        }
    }
    
    private func removeMapping(at offsets: IndexSet) {
        accounts.remove(atOffsets: offsets)
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

