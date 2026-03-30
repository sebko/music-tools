import Foundation

struct ScanProgressInfo: Codable {
    let running: Bool
    let phase: String
    let currentFolder: String
    let foldersDone: Int
    let totalFolders: Int
    let filesDone: Int
    let totalFiles: Int
    let startedAt: String

    enum CodingKeys: String, CodingKey {
        case running, phase
        case currentFolder = "current_folder"
        case foldersDone = "folders_done"
        case totalFolders = "total_folders"
        case filesDone = "files_done"
        case totalFiles = "total_files"
        case startedAt = "started_at"
    }

    var phaseLabel: String {
        switch phase {
        case "tags": return "Setting tags"
        case "art": return "Generating art"
        default: return phase
        }
    }

    var folderProgress: Double {
        guard totalFolders > 0 else { return 0 }
        return Double(foldersDone) / Double(totalFolders)
    }

    static func read(from path: String) -> ScanProgressInfo? {
        guard let data = FileManager.default.contents(atPath: path) else { return nil }
        return try? JSONDecoder().decode(ScanProgressInfo.self, from: data)
    }
}
