import SwiftUI

struct DashboardView: View {
    @ObservedObject var networkManager = NetworkManager.shared
    @AppStorage("hideBalances") private var hideBalances = false
    
    @State private var status: ServerStatus? = nil
    @State private var isLoadingStatus = false
    
    @State private var syncResults: [ImportedTransaction] = []
    @State private var isSyncing = false
    @State private var syncError: String? = nil
    @State private var hasSynced = false
    
    // Off by default: the server already imports a rolling window that reaches a few days
    // into the past, which is what catches bookings the bank posts backdated (card fees,
    // foreign currency charges). Narrowing it down to a single day used to lose those for
    // good, so a custom range is now the exception the user opts into.
    @State private var limitDateRange = false
    @State private var startDate = Date()
    @State private var endDate = Date()
    /// Mirrors the server default so the date pickers open on the same range.
    @State private var syncLookbackDays = DashboardView.fallbackLookbackDays

    /// Used until the server reported its own value via `/api/status`.
    private static let fallbackLookbackDays = 7
    
    @State private var accountBalances: [AccountBalance] = []
    @State private var isLoadingBalances = false
    @State private var balancesError: String? = nil
    @State private var bankErrors: [BankBalanceError] = []
    @State private var selectedAccountForPending: AccountBalance? = nil
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 20) {
                    
                    // --- Status Grid ---
                    HStack(spacing: 12) {
                        statusBadge(
                            title: "Actual Budget",
                            statusText: status?.actualBudgetConfigured == true ? "Verbunden" : "Konfigurieren",
                            systemImage: status?.actualBudgetConfigured == true ? "checkmark.circle.fill" : "exclamationmark.triangle.fill",
                            color: status?.actualBudgetConfigured == true ? .themeSuccess : .themeWarning
                        )
                        
                        statusBadge(
                            title: "Banken (Konten)",
                            statusText: status != nil ? "\(status!.bankCount) Banken (\(status!.accountCount) Konten)" : "Lade...",
                            systemImage: "building.columns.fill",
                            color: .themeAccent
                        )
                    }
                    .padding(.horizontal)
                    
                    // --- Account Balances Card ---
                    VStack(alignment: .leading, spacing: 15) {
                        HStack {
                            Image(systemName: "creditcard.fill")
                                .foregroundColor(.themeAccent)
                                .font(.title3)
                            Text("Kontostände")
                                .font(.headline)
                                .foregroundColor(.themeTextPrimary)
                            Spacer()
                            if !accountBalances.isEmpty {
                                Text("Gesamt: \(hideBalances ? "•••• €" : accountBalances.reduce(0) { $0 + $1.balance }.formattedAsGermanCurrency())")
                                    .font(.subheadline)
                                    .fontWeight(.bold)
                                    .foregroundColor(.themeAccent)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(Color.themeAccent.opacity(0.08))
                                    .cornerRadius(6)
                            }
                        }
                        
                        if isLoadingBalances && accountBalances.isEmpty {
                            HStack {
                                Spacer()
                                ProgressView("Lade Salden...")
                                Spacer()
                            }
                            .padding(.vertical, 10)
                        } else if let error = balancesError, accountBalances.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(error)
                                    .font(.subheadline)
                                    .foregroundColor(.themeDanger)
                                Button("Erneut versuchen") {
                                    Task { await loadBalances() }
                                }
                                .font(.caption)
                                .buttonStyle(.bordered)
                                .tint(.themeAccent)
                            }
                            .padding(.vertical, 5)
                        } else if accountBalances.isEmpty {
                            Text("Keine Kontostände geladen. Ziehe nach unten zum Aktualisieren.")
                                .font(.subheadline)
                                .foregroundColor(.themeTextSecondary)
                                .italic()
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.vertical, 10)
                        } else {
                            VStack(spacing: 12) {
                                ForEach(accountBalances) { acc in
                                    let hasPending = acc.pendingTransactions != nil && !acc.pendingTransactions!.isEmpty
                                    
                                    Button(action: {
                                        if hasPending {
                                            selectedAccountForPending = acc
                                        }
                                    }) {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 4) {
                                                HStack(spacing: 6) {
                                                    Text(acc.name)
                                                        .font(.subheadline)
                                                        .fontWeight(.semibold)
                                                        .foregroundColor(.themeTextPrimary)
                                                    
                                                    if let actualBal = acc.actualBalance {
                                                        let delta = acc.balance - actualBal
                                                        if abs(delta) < 0.01 {
                                                            Image(systemName: "checkmark.circle.fill")
                                                                .font(.caption2)
                                                                .foregroundColor(.themeSuccess)
                                                        } else {
                                                            Image(systemName: "exclamationmark.triangle.fill")
                                                                .font(.caption2)
                                                                .foregroundColor(.themeDanger)
                                                        }
                                                    }
                                                }
                                                Text("\(acc.bankName) • \(formatISO(acc.lastUpdated))")
                                                    .font(.caption2)
                                                    .foregroundColor(.themeTextSecondary)
                                            }
                                            Spacer()
                                            VStack(alignment: .trailing, spacing: 2) {
                                                Text(hideBalances ? "•••• €" : acc.balance.formattedAsGermanCurrency())
                                                    .font(.subheadline)
                                                    .fontWeight(.bold)
                                                    .foregroundColor(acc.balance < 0 ? .themeDanger : .themeTextPrimary)
                                                
                                                if let actualBal = acc.actualBalance {
                                                    let delta = acc.balance - actualBal
                                                    if abs(delta) >= 0.01 {
                                                        Text("Actual: \(hideBalances ? "•••• €" : actualBal.formattedAsGermanCurrency()) (Delta: \(delta > 0 ? "+" : "")\(hideBalances ? "•••• €" : delta.formattedAsGermanCurrency()))")
                                                            .font(.system(size: 10))
                                                            .fontWeight(.medium)
                                                            .foregroundColor(.themeDanger)
                                                    } else {
                                                        Text("Synchron")
                                                            .font(.system(size: 9, weight: .bold))
                                                            .foregroundColor(.themeSuccess)
                                                    }
                                                }
                                                
                                                if let pending = acc.pendingBalance, pending != 0 {
                                                    HStack(spacing: 4) {
                                                        Text("Vorgemerkt: \(hideBalances ? "•••• €" : pending.formattedAsGermanCurrency())")
                                                        if hasPending {
                                                            Image(systemName: "chevron.right")
                                                                .font(.system(size: 9, weight: .bold))
                                                        }
                                                    }
                                                    .font(.caption2)
                                                    .foregroundColor(.themeTextSecondary)
                                                }
                                            }
                                        }
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(PlainButtonStyle())
                                    .disabled(!hasPending)
                                    
                                    if acc.id != accountBalances.last?.id {
                                        Divider()
                                    }
                                }
                            }
                        }
                        
                        if !bankErrors.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Divider()
                                    .padding(.vertical, 4)
                                HStack {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .foregroundColor(.themeWarning)
                                        .font(.caption)
                                    Text("Verbindung zu einigen Banken fehlgeschlagen:")
                                        .font(.caption)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.themeWarning)
                                }
                                ForEach(bankErrors) { err in
                                    Text("• \(err.bankName): \(err.error)")
                                        .font(.caption2)
                                        .foregroundColor(.themeTextSecondary)
                                }
                            }
                            .padding(.top, 5)
                        }
                    }
                    .padding()
                    .background(Color.themeCardBg)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.themeCardBorder, lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.05), radius: 5, x: 0, y: 2)
                    .padding(.horizontal)
                    
                    
                    // --- Sync Trigger Box ---
                    VStack(alignment: .leading, spacing: 15) {
                        Text("Transaktionen abrufen")
                            .font(.headline)
                            .foregroundColor(.themeTextPrimary)
                        
                        Text("Lade Umsätze via FinTS von deinen konfigurierten Bankkonten ab und importiere sie direkt in Actual Budget.")
                            .font(.subheadline)
                            .foregroundColor(.themeTextSecondary)
                            .lineLimit(nil)
                            
                        Toggle(isOn: $limitDateRange.animation()) {
                            Label("Zeitraum eingrenzen", systemImage: "calendar")
                                .font(.subheadline)
                                .foregroundColor(.themeTextPrimary)
                        }
                        .tint(.themeAccent)
                        // Single-parameter form: the two-parameter onChange needs iOS 17,
                        // the deployment target is iOS 16.
                        .onChange(of: limitDateRange) { isOn in
                            // Start the custom range on the same window the server would
                            // have used, so switching it on changes nothing by itself.
                            if isOn { resetDateRangeToServerDefault() }
                        }

                        if limitDateRange {
                            VStack(spacing: 10) {
                                DatePicker("Startdatum", selection: $startDate, displayedComponents: .date)
                                    .font(.subheadline)
                                DatePicker("Enddatum", selection: $endDate, displayedComponents: .date)
                                    .font(.subheadline)
                            }
                            .padding(.top, 5)
                        } else {
                            Text("Standard: die letzten \(syncLookbackDays) Tage. Der Puffer fängt Buchungen ab, die die Bank nachträglich rückdatiert einstellt.")
                                .font(.caption)
                                .foregroundColor(.themeTextSecondary)
                                .lineLimit(nil)
                        }
                    }
                    .padding()
                    .background(Color.themeCardBg)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.themeCardBorder, lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.05), radius: 5, x: 0, y: 2)
                    .padding(.horizontal)
                    
                    // --- Sync Results Section ---
                    if !syncResults.isEmpty || hasSynced || syncError != nil {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Ergebnisse des letzten Imports")
                                .font(.headline)
                                .foregroundColor(.themeTextPrimary)
                                .padding(.horizontal)
                            
                            if let error = syncError {
                                HStack(spacing: 8) {
                                    Image(systemName: "exclamationmark.octagon.fill")
                                        .foregroundColor(.themeDanger)
                                    Text(error)
                                        .foregroundColor(.themeDanger)
                                        .font(.subheadline)
                                }
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.themeDanger.opacity(0.1))
                                .cornerRadius(10)
                                .padding(.horizontal)
                            } else if syncResults.isEmpty {
                                Text("Keine neuen Umsätze gefunden (Duplikate gefiltert).")
                                    .font(.subheadline)
                                    .foregroundColor(.themeTextSecondary)
                                    .padding()
                                    .frame(maxWidth: .infinity, alignment: .center)
                                    .background(Color.themeCardBg)
                                    .cornerRadius(10)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10)
                                            .stroke(Color.themeCardBorder, lineWidth: 1)
                                    )
                                    .padding(.horizontal)
                            } else {
                                VStack(spacing: 0) {
                                    ForEach(syncResults) { tx in
                                        transactionRow(tx: tx)
                                        if tx != syncResults.last {
                                            Divider()
                                        }
                                    }
                                }
                                .background(Color.themeCardBg)
                                .cornerRadius(12)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(Color.themeCardBorder, lineWidth: 1)
                                )
                                .shadow(color: Color.black.opacity(0.05), radius: 5, x: 0, y: 2)
                                .padding(.horizontal)
                            }
                        }
                    }
                }
                .padding(.top)
            }
            .background(Color.themeBgPrimary)
            .refreshable {
                async let statusLoad: () = loadServerStatus()
                async let balancesLoad: () = loadBalances()
                _ = await (statusLoad, balancesLoad)
            }
            
            // --- Sticky Bottom Bar ---
            VStack(spacing: 0) {
                Divider()
                
                Button(action: triggerSync) {
                    HStack {
                        if isSyncing {
                            ProgressView()
                                .tint(.white)
                                .padding(.trailing, 5)
                            Text("Synchronisiere...")
                        } else {
                            Image(systemName: "bolt.fill")
                            Text("Sync starten")
                        }
                    }
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(isSyncing ? Color.themeTextMuted : Color.themeAccent)
                    .cornerRadius(12)
                }
                .disabled(isSyncing)
                .padding(.horizontal)
                .padding(.top, 12)
                .padding(.bottom, 12)
            }
            .background(Color.themeBgSecondary)
        }
        .navigationTitle("Dashboard")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    hideBalances.toggle()
                }) {
                    Image(systemName: hideBalances ? "eye.slash.fill" : "eye.fill")
                        .foregroundColor(.themeAccent)
                }
            }
        }
        .sheet(item: $selectedAccountForPending) { acc in
            PendingTransactionsSheet(account: acc)
        }
        .onAppear {
            // Load from local cache first for instant rendering
            if let cachedBalances: [AccountBalance] = LocalCacheManager.shared.load(from: "balances.json") {
                self.accountBalances = cachedBalances
            }
            if let cachedStatus: ServerStatus = LocalCacheManager.shared.load(from: "status.json") {
                self.status = cachedStatus
            }
            
            // Always fetch fresh balances and status in the background (Stale-While-Revalidate)
            Task {
                await loadBalances()
            }
            Task {
                await loadServerStatus()
            }
        }
    }
    }
    
    private func statusBadge(title: String, statusText: String, systemImage: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: systemImage)
                    .foregroundColor(color)
                    .font(.system(size: 20))
                Spacer()
            }
            Text(title)
                .font(.caption)
                .foregroundColor(.themeTextSecondary)
            Text(statusText)
                .font(.subheadline)
                .fontWeight(.bold)
                .foregroundColor(.themeTextPrimary)
                .lineLimit(1)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color.themeCardBg)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.themeCardBorder, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.05), radius: 5, x: 0, y: 2)
    }
    
    private func transactionRow(tx: ImportedTransaction) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(tx.payee)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.themeTextPrimary)
                    .lineLimit(1)
                Text("\(tx.account) • \(formatDate(tx.date))")
                    .font(.caption)
                    .foregroundColor(.themeTextSecondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(hideBalances ? "•••• €" : tx.amount.formattedAsGermanCurrency())
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundColor(tx.amount < 0 ? .themeTextPrimary : .themeSuccess)
                
                Text(statusLabel(for: tx.status))
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(statusColor(for: tx.status))
                    .cornerRadius(4)
            }
        }
        .padding()
    }
    
    private func statusLabel(for status: String) -> String {
        switch status {
        case "added": return "Neu"
        case "pending": return "Vorgemerkt"
        default: return "Aktualisiert"
        }
    }
    
    private func statusColor(for status: String) -> Color {
        switch status {
        case "added": return Color.themeAccent
        default: return Color.themeWarning
        }
    }
    
    private func loadServerStatus() async {
        isLoadingStatus = true
        defer { isLoadingStatus = false }
        do {
            let fetchedStatus = try await networkManager.fetchStatus()
            status = fetchedStatus
            if let lookback = fetchedStatus.syncLookbackDays, lookback >= 0 {
                syncLookbackDays = lookback
                // Only while the user has not opened a custom range - their own dates win.
                if !limitDateRange { resetDateRangeToServerDefault() }
            }
            LocalCacheManager.shared.save(fetchedStatus, to: "status.json")
        } catch {
            print("Failed to fetch status: \(error)")
        }
    }

    /// Puts the date pickers on the same window the server uses without an explicit range.
    private func resetDateRangeToServerDefault() {
        let today = Date()
        endDate = today
        startDate = Calendar.current.date(byAdding: .day, value: -syncLookbackDays, to: today) ?? today
    }
    
    private func loadBalances() async {
        isLoadingBalances = true
        balancesError = nil
        bankErrors = []
        do {
            let response = try await networkManager.fetchBalances()
            if response.success {
                let fetchedBalances = response.balances ?? []
                accountBalances = fetchedBalances
                bankErrors = response.errors ?? []
                LocalCacheManager.shared.save(fetchedBalances, to: "balances.json")
            } else {
                balancesError = "Laden der Kontostände fehlgeschlagen."
            }
        } catch {
            balancesError = error.localizedDescription
        }
        isLoadingBalances = false
    }
    
    private func triggerSync() {
        isSyncing = true
        syncError = nil
        syncResults = []
        hasSynced = false
        
        let generator = UINotificationFeedbackGenerator()
        
        Task {
            do {
                var startStr: String? = nil
                var endStr: String? = nil
                
                if limitDateRange {
                    let formatter = DateFormatter()
                    formatter.dateFormat = "yyyy-MM-dd"
                    startStr = formatter.string(from: startDate)
                    endStr = formatter.string(from: endDate)
                }
                
                let results = try await networkManager.syncTransactions(startDate: startStr, endDate: endStr)
                generator.notificationOccurred(.success)
                
                syncResults = results
                hasSynced = true
                
                async let statusLoad: () = loadServerStatus()
                async let balancesLoad: () = loadBalances()
                _ = await (statusLoad, balancesLoad)
            } catch {
                generator.notificationOccurred(.error)
                syncError = error.localizedDescription
            }
            isSyncing = false
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
    
    private func formatDate(_ dateStr: String) -> String {
        let inputFormatter = DateFormatter()
        inputFormatter.locale = Locale(identifier: "en_US_POSIX")
        inputFormatter.dateFormat = "yyyy-MM-dd"
        guard let date = inputFormatter.date(from: dateStr) else { return dateStr }
        
        let outputFormatter = DateFormatter()
        outputFormatter.locale = Locale(identifier: "de_DE")
        outputFormatter.dateFormat = "dd.MM.yyyy"
        return outputFormatter.string(from: date)
    }
}

struct PendingTransactionsSheet: View {
    let account: AccountBalance
    @Environment(\.dismiss) var dismiss
    @State private var expandedTransactionIds: Set<String> = []
    @AppStorage("hideBalances") private var hideBalances = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Header overview card
                VStack(spacing: 8) {
                    Text(account.name)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.themeTextPrimary)
                    Text("\(account.bankName) • IBAN \(formatIban(account.iban))")
                        .font(.caption)
                        .foregroundColor(.themeTextSecondary)
                    
                    if let pending = account.pendingBalance {
                        Text(hideBalances ? "•••• €" : pending.formattedAsGermanCurrency())
                            .font(.system(size: 36, weight: .black, design: .rounded))
                            .foregroundColor(pending < 0 ? .themeDanger : .themeSuccess)
                            .padding(.top, 4)
                        Text("Vorgemerkte Gesamtsumme")
                            .font(.caption2)
                            .foregroundColor(.themeTextSecondary)
                            .textCase(.uppercase)
                            .tracking(1)
                    }
                }
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity)
                .background(Color.themeBgSecondary)
                
                // Info Callout Box (Warning/Info)
                HStack(spacing: 12) {
                    Image(systemName: "info.circle.fill")
                        .foregroundColor(.themeAccent)
                        .font(.title3)
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Vorgemerkte Umsätze")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.themeTextPrimary)
                        Text("Diese Buchungen sind noch nicht endgültig von der Bank gebucht. Sie werden lokal zwischengespeichert und nicht nach Actual Budget übertragen.")
                            .font(.caption)
                            .foregroundColor(.themeTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding()
                .background(Color.themeAccent.opacity(0.06))
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.themeAccent.opacity(0.15), lineWidth: 1)
                )
                .padding(.horizontal)
                .padding(.bottom, 16)

                // Scrollable List of Transactions
                ScrollView {
                    VStack(spacing: 12) {
                        if let transactions = account.pendingTransactions, !transactions.isEmpty {
                            ForEach(transactions) { tx in
                                pendingTransactionRow(tx: tx)
                            }
                        } else {
                            VStack(spacing: 8) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 40))
                                    .foregroundColor(.themeSuccess)
                                Text("Keine vorgemerkten Umsätze")
                                    .font(.headline)
                                    .foregroundColor(.themeTextPrimary)
                            }
                            .padding(.vertical, 40)
                        }
                    }
                    .padding(.horizontal)
                }
                
                Spacer()
            }
            .background(Color.themeBgPrimary)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Schließen") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .tint(.themeAccent)
                }
            }
        }
    }

    private func formatIban(_ iban: String) -> String {
        var result = ""
        for (idx, char) in iban.enumerated() {
            if idx > 0 && idx % 4 == 0 {
                result += " "
            }
            result += String(char)
        }
        return result
    }

    @ViewBuilder
    private func pendingTransactionRow(tx: PendingTransaction) -> some View {
        let isExpanded = expandedTransactionIds.contains(tx.id)
        
        Button(action: {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                if isExpanded {
                    expandedTransactionIds.remove(tx.id)
                } else {
                    expandedTransactionIds.insert(tx.id)
                }
            }
        }) {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color.themeAccent.opacity(0.08))
                    .frame(width: 40, height: 40)
                    .overlay(
                        Image(systemName: tx.isCredit ? "arrow.down.left.circle.fill" : "creditcard.fill")
                            .foregroundColor(.themeAccent)
                            .font(.system(size: 16))
                    )
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(tx.payee)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.themeTextPrimary)
                        .lineLimit(1)
                    
                    Text(tx.purpose)
                        .font(.caption2)
                        .foregroundColor(.themeTextSecondary)
                        .lineLimit(isExpanded ? nil : 2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: isExpanded)
                    
                    Text("Wertstellung: \(formatDate(tx.valueDate))")
                        .font(.system(size: 9))
                        .foregroundColor(.themeTextSecondary)
                        .padding(.top, 2)
                }
                
                Spacer()
                
                Text(hideBalances ? "•••• €" : (tx.isCredit ? tx.amount : -tx.amount).formattedAsGermanCurrency())
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundColor(tx.isCredit ? .themeSuccess : .themeTextPrimary)
            }
            .padding()
            .background(Color.themeCardBg)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.themeCardBorder, lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    private func formatDate(_ dateStr: String) -> String {
        let inputFormatter = DateFormatter()
        inputFormatter.dateFormat = "yyyy-MM-dd"
        guard let date = inputFormatter.date(from: dateStr) else { return dateStr }
        
        let outputFormatter = DateFormatter()
        outputFormatter.dateFormat = "dd.MM.yyyy"
        return outputFormatter.string(from: date)
    }
}
