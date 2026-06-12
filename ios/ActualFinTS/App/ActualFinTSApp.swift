import SwiftUI
import AppIntents
import UserNotifications

@main
struct ActualFinTSApp: App {
    init() {
        ActualFinTSShortcuts.updateAppShortcutParameters()
        requestNotificationPermission()
    }
    
    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                print("Notification permission error: \(error.localizedDescription)")
            }
        }
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}