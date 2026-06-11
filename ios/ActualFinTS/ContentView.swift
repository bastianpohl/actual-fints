import SwiftUI

struct ContentView: View {
    @State private var selection = 0
    @AppStorage("server_url") private var serverUrl: String = ""
    @AppStorage("api_key") private var apiKey: String = ""
    
    var body: some View {
        Group {
            if serverUrl.isEmpty || apiKey.isEmpty {
                NavigationStack {
                    ZStack {
                        Color.themeBgPrimary.ignoresSafeArea()
                        
                        VStack(spacing: 20) {
                            Image(systemName: "lock.shield.fill")
                                .font(.system(size: 80))
                                .foregroundColor(.themeAccent)
                                .padding(.bottom, 10)
                            
                            Text("Verbindung einrichten")
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(.themeTextPrimary)
                            
                            Text("Trage deine Server-URL und deinen API-Key ein, um auf das native actual-fints Dashboard zuzugreifen.")
                                .font(.subheadline)
                                .foregroundColor(.themeTextSecondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 30)
                            
                            VStack(spacing: 12) {
                                TextField("Server-URL (z.B. http://192.168.1.100:3000)", text: $serverUrl)
                                    .textFieldStyle(.roundedBorder)
                                    .keyboardType(.URL)
                                    .autocorrectionDisabled()
                                    .textInputAutocapitalization(.never)
                                
                                SecureField("API Key", text: $apiKey)
                                    .textFieldStyle(.roundedBorder)
                                    .autocorrectionDisabled()
                                    .textInputAutocapitalization(.never)
                            }
                            .padding(.horizontal, 30)
                            .padding(.vertical, 10)
                            
                            Button(action: saveInitialSetup) {
                                Text("Verbinden")
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .background(serverUrl.isEmpty || apiKey.isEmpty ? Color.themeTextMuted : Color.themeAccent)
                                    .cornerRadius(8)
                            }
                            .disabled(serverUrl.isEmpty || apiKey.isEmpty)
                            .padding(.horizontal, 30)
                        }
                    }
                    .navigationTitle("Actual-FinTS")
                }
            } else {
                TabView(selection: $selection) {
                    DashboardView()
                        .tabItem {
                            Label("Dashboard", systemImage: "chart.bar.fill")
                        }
                        .tag(0)
                    
                    BanksView()
                        .tabItem {
                            Label("Banken", systemImage: "building.columns.fill")
                        }
                        .tag(1)
                    
                    LogsView()
                        .tabItem {
                            Label("Logs", systemImage: "terminal.fill")
                        }
                        .tag(2)
                    
                    SettingsView()
                        .tabItem {
                            Label("Settings", systemImage: "gearshape.fill")
                        }
                        .tag(3)
                }
                .tint(.themeAccent)
            }
        }
    }
    
    private func saveInitialSetup() {
        var cleanURL = serverUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanURL.hasSuffix("/") {
            cleanURL.removeLast()
        }
        serverUrl = cleanURL
        apiKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
