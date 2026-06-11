import SwiftUI

struct LogsView: View {
    @ObservedObject var networkManager = NetworkManager.shared
    
    @State private var rawLogs: String = ""
    @State private var logRuns: [LogRun] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    
    // UI state
    @State private var filterStatus: String = "Alle"
    @State private var searchText: String = ""
    @State private var expandedRunIds: Set<String> = []
    @State private var isShowingRawLogs = false
    
    var filteredRuns: [LogRun] {
        logRuns.filter { run in
            if filterStatus == "Fehler" && run.status != .error { return false }
            if filterStatus == "Erfolgreich" && run.status != .success { return false }
            if filterStatus == "Warnungen" && run.status != .warning { return false }
            
            if !searchText.isEmpty {
                let matchesText = run.stdout.localizedCaseInsensitiveContains(searchText) ||
                                  run.stderr.localizedCaseInsensitiveContains(searchText) ||
                                  run.timestamp.localizedCaseInsensitiveContains(searchText) ||
                                  run.processedAccounts.contains(where: { $0.localizedCaseInsensitiveContains(searchText) })
                if !matchesText { return false }
            }
            return true
        }
    }
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter Segment
                Picker("Filter", selection: $filterStatus) {
                    Text("Alle").tag("Alle")
                    Text("Erfolge").tag("Erfolgreich")
                    Text("Warnungen").tag("Warnungen")
                    Text("Fehler").tag("Fehler")
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(Color.themeBgSecondary)
                
                Group {
                    if isLoading && logRuns.isEmpty {
                        VStack(spacing: 20) {
                            ProgressView()
                            Text("Analysiere Protokolldaten...")
                                .foregroundColor(.secondary)
                        }
                        .frame(maxHeight: .infinity)
                    } else if let error = errorMessage {
                        VStack(spacing: 16) {
                            Image(systemName: "wifi.slash")
                                .font(.largeTitle)
                                .foregroundColor(.red)
                            Text(error)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                            Button("Erneut laden") {
                                Task { await loadLogs() }
                            }
                            .buttonStyle(.bordered)
                        }
                        .frame(maxHeight: .infinity)
                    } else if filteredRuns.isEmpty {
                        VStack(spacing: 16) {
                            Image(systemName: "doc.text.magnifyingglass")
                                .font(.system(size: 50))
                                .foregroundColor(.gray)
                            Text("Keine Einträge gefunden")
                                .font(.headline)
                            Text("Es gibt keine Sync-Protokolle, die den aktiven Filtern entsprechen.")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                        .frame(maxHeight: .infinity)
                    } else {
                        List {
                            ForEach(filteredRuns) { run in
                                Section {
                                    LogRunRow(run: run, isExpanded: expandedRunIds.contains(run.id)) {
                                        if expandedRunIds.contains(run.id) {
                                            expandedRunIds.remove(run.id)
                                        } else {
                                            expandedRunIds.insert(run.id)
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
            }
            .navigationTitle("System-Protokolle")
            .searchable(text: $searchText, prompt: "Logs durchsuchen...")
            .refreshable {
                await loadLogs()
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { isShowingRawLogs = true }) {
                        Label("Terminal-Ansicht", systemImage: "terminal")
                    }
                }
            }
            .onAppear {
                Task {
                    await loadLogs()
                }
            }
            .sheet(isPresented: $isShowingRawLogs) {
                RawLogsSheet(rawLogs: rawLogs)
            }
        }
    }
    
    private func loadLogs() async {
        isLoading = true
        errorMessage = nil
        do {
            rawLogs = try await networkManager.fetchLogs()
            logRuns = LogParser.parse(rawLogs)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct LogRunRow: View {
    let run: LogRun
    let isExpanded: Bool
    let onToggleExpand: () -> Void
    
    @State private var activeTab = 0 // 0 = STDOUT, 1 = STDERR
    @State private var showCopyToast = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header Accordion Trigger
            Button(action: onToggleExpand) {
                HStack(spacing: 12) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 12, height: 12)
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text(run.timestamp)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)
                        
                        Text("Zeitspanne: \(run.range)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    Spacer()
                    
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.secondary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isExpanded)
                }
            }
            .buttonStyle(.plain)
            
            // Accounts Pill List
            if !run.processedAccounts.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(run.processedAccounts, id: \.self) { acc in
                            Text(acc)
                                .font(.system(size: 9, weight: .bold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Color.themeAccent.opacity(0.1))
                                .foregroundColor(.themeAccent)
                                .cornerRadius(6)
                        }
                    }
                }
                .padding(.leading, 24)
            }
            
            // Expanded content view
            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    Divider()
                        .padding(.vertical, 4)
                    
                    if let error = run.errorMessage {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "exclamationmark.octagon.fill")
                                .foregroundColor(.themeDanger)
                                .font(.subheadline)
                            Text(error)
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.themeDanger)
                                .lineLimit(nil)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.themeDanger.opacity(0.08))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.themeDanger.opacity(0.15), lineWidth: 1)
                        )
                    }
                    
                    // Detail Segment Picker
                    Picker("Details", selection: $activeTab) {
                        Text("System-Output").tag(0)
                        if !run.stderr.isEmpty {
                            Text("Fehlerkanal").tag(1)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.bottom, 2)
                    
                    // Console Output Area
                    ZStack(alignment: .topTrailing) {
                        ScrollView {
                            Text(activeTab == 0 ? run.stdout : run.stderr)
                                .font(.system(size: 10, weight: .regular, design: .monospaced))
                                .foregroundColor(activeTab == 0 ? Color(hex: "A7F3D0") : .themeDanger)
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .multilineTextAlignment(.leading)
                        }
                        .frame(height: 180)
                        .background(Color(hex: "040206"))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.white.opacity(0.08), lineWidth: 1)
                        )
                        
                        Button(action: copyToClipboard) {
                            Image(systemName: showCopyToast ? "checkmark.circle.fill" : "doc.on.doc.fill")
                                .foregroundColor(showCopyToast ? .themeSuccess : .white.opacity(0.7))
                                .padding(8)
                                .background(Color.black.opacity(0.5))
                                .cornerRadius(6)
                                .padding(8)
                        }
                    }
                }
                .padding(.leading, 24)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .padding(.vertical, 4)
    }
    
    private var statusColor: Color {
        switch run.status {
        case .success: return .themeSuccess
        case .warning: return .themeWarning
        case .error: return .themeDanger
        }
    }
    
    private func copyToClipboard() {
        let text = activeTab == 0 ? run.stdout : run.stderr
        UIPasteboard.general.string = text
        showCopyToast = true
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            showCopyToast = false
        }
    }
}

// Log Parser Utility
struct LogParser {
    static func parse(_ raw: String) -> [LogRun] {
        var runs: [LogRun] = []
        let lines = raw.components(separatedBy: .newlines)
        
        var tempLines: [String] = []
        var currentHeader: String = ""
        
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.contains("--- SYNC START") {
                if !tempLines.isEmpty && !currentHeader.isEmpty {
                    if let run = parseBlock(header: currentHeader, lines: tempLines) {
                        runs.append(run)
                    }
                }
                currentHeader = line
                tempLines = []
            } else if trimmed.contains("--- SYNC END ---") {
                tempLines.append(line)
                if !currentHeader.isEmpty {
                    if let run = parseBlock(header: currentHeader, lines: tempLines) {
                        runs.append(run)
                    }
                }
                currentHeader = ""
                tempLines = []
            } else {
                if !currentHeader.isEmpty {
                    tempLines.append(line)
                }
            }
        }
        
        if !tempLines.isEmpty && !currentHeader.isEmpty {
            if let run = parseBlock(header: currentHeader, lines: tempLines) {
                runs.append(run)
            }
        }
        
        return runs.sorted { $0.parsedDate > $1.parsedDate }
    }
    
    private static func parseBlock(header: String, lines: [String]) -> LogRun? {
        var timestamp = ""
        if let startIdx = header.firstIndex(of: "["), let endIdx = header.firstIndex(of: "]") {
            let nextStartIdx = header.index(after: startIdx)
            timestamp = String(header[nextStartIdx..<endIdx])
        } else {
            timestamp = header.components(separatedBy: " ---").first?.trimmingCharacters(in: CharacterSet(charactersIn: "[]")) ?? "Unbekannt"
        }
        
        var range = "Heute"
        if let rangeStart = header.range(of: "Range: ") {
            let endPart = header[rangeStart.upperBound...]
            if let rangeEnd = endPart.firstIndex(of: ")") {
                range = String(endPart[..<rangeEnd])
            }
        }
        
        var stdoutLines: [String] = []
        var stderrLines: [String] = []
        var isStderr = false
        
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed == "STDOUT:" {
                isStderr = false
            } else if trimmed == "STDERR:" {
                isStderr = true
            } else if trimmed == "--- SYNC END ---" {
                continue
            } else {
                if isStderr {
                    stderrLines.append(line)
                } else {
                    stdoutLines.append(line)
                }
            }
        }
        
        let stdoutText = stdoutLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        let stderrText = stderrLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        
        var status: LogStatus = .success
        var errorMessage: String? = nil
        
        for line in stderrLines {
            let lower = line.lowercased()
            if lower.contains("error") || lower.contains("fehler") || lower.contains("failed") || lower.contains("failure") {
                status = .error
                if errorMessage == nil {
                    errorMessage = line.trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
        }
        
        if status == .success {
            for line in stderrLines {
                let lower = line.lowercased()
                if lower.contains("warnung") || lower.contains("warning") || lower.contains("skip") || lower.contains("übersprungen") {
                    status = .warning
                }
            }
        }
        
        var accounts: [String] = []
        for line in stderrLines {
            if line.contains("Verarbeite Konto:") {
                let parts = line.components(separatedBy: "-> ")
                if parts.count > 1 {
                    accounts.append(parts[1].trimmingCharacters(in: .whitespacesAndNewlines))
                }
            }
        }
        
        let date = parseDate(timestamp)
        
        return LogRun(
            timestamp: timestamp,
            parsedDate: date,
            range: range,
            stdout: stdoutText,
            stderr: stderrText,
            status: status,
            processedAccounts: accounts,
            errorMessage: errorMessage
        )
    }
    
    private static func parseDate(_ ts: String) -> Date {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "dd.M.yyyy, HH:mm:ss"
        if let d = formatter.date(from: ts) {
            return d
        }
        formatter.dateFormat = "d.M.yyyy, HH:mm:ss"
        if let d = formatter.date(from: ts) {
            return d
        }
        return Date(timeIntervalSince1970: 0)
    }
}

struct RawLogsSheet: View {
    @Environment(\.dismiss) var dismiss
    let rawLogs: String
    
    var body: some View {
        NavigationStack {
            ScrollView {
                Text(rawLogs)
                    .font(.system(size: 9, weight: .regular, design: .monospaced))
                    .foregroundColor(Color(hex: "A7F3D0"))
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color(hex: "040206"))
            .navigationTitle("Rohdaten (sync.log)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Schließen") { dismiss() }
                }
            }
        }
    }
}

