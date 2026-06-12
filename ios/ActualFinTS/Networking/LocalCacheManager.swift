import Foundation

class LocalCacheManager {
    static let shared = LocalCacheManager()
    
    private init() {}
    
    private func getCacheURL(for filename: String) -> URL? {
        let fileManager = FileManager.default
        guard let cacheDir = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            return nil
        }
        return cacheDir.appendingPathComponent(filename)
    }
    
    func save<T: Encodable>(_ data: T, to filename: String) {
        guard let url = getCacheURL(for: filename) else { return }
        do {
            let encoder = JSONEncoder()
            // Format dates nicely as ISO8601 in cache JSON for debugging compatibility
            encoder.dateEncodingStrategy = .iso8601
            let encoded = try encoder.encode(data)
            try encoded.write(to: url, options: .atomic)
        } catch {
            print("Failed to save cache for \(filename): \(error)")
        }
    }
    
    func load<T: Decodable>(from filename: String) -> T? {
        guard let url = getCacheURL(for: filename) else { return nil }
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(T.self, from: data)
        } catch {
            print("Failed to load cache for \(filename): \(error)")
            return nil
        }
    }
    
    func clear(filename: String) {
        guard let url = getCacheURL(for: filename) else { return }
        let fileManager = FileManager.default
        if fileManager.fileExists(atPath: url.path) {
            try? fileManager.removeItem(at: url)
        }
    }
}
