import Foundation

struct VaultEntry: Identifiable, Codable, Hashable {
  let id: String
  let label: String
  let secret: String
}

enum VaultStore {
  private static let entriesKey = "gaubee-2fa.mobile.entries"

  static func loadEntries() -> [VaultEntry] {
    guard let data = UserDefaults.standard.data(forKey: entriesKey) else {
      return []
    }

    do {
      return try JSONDecoder().decode([VaultEntry].self, from: data)
    } catch {
      return []
    }
  }

  static func saveEntries(_ entries: [VaultEntry]) {
    guard let data = try? JSONEncoder().encode(entries) else {
      return
    }

    UserDefaults.standard.set(data, forKey: entriesKey)
  }

  static func demoEntry() -> VaultEntry {
    VaultEntry(
      id: "demo-rfc6238",
      label: "RFC Demo",
      secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    )
  }

  static func createId() -> String {
    "entry-\(Int(Date().timeIntervalSince1970 * 1000))-\(Int.random(in: 1000..<9999))"
  }
}
