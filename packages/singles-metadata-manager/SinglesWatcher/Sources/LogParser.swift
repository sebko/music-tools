import Foundation

struct ProcessingRun: Identifiable {
    let id = UUID()
    let folderName: String
    let timestamp: String
    let tagCount: Int
    let tagErrors: Int
    let artCount: Int
    let artErrors: Int

    var totalErrors: Int { tagErrors + artErrors }
}

enum LogParser {
    /// Read the last `maxBytes` of the log file and parse completed processing runs.
    static func recentRuns(logPath: String, maxBytes: Int = 32_768) -> [ProcessingRun] {
        guard let data = tailOfFile(path: logPath, maxBytes: maxBytes),
              let text = String(data: data, encoding: .utf8) else {
            return []
        }

        let lines = text.components(separatedBy: "\n")
        return parseRuns(from: lines)
    }

    // MARK: - Private

    private static func tailOfFile(path: String, maxBytes: Int) -> Data? {
        guard let handle = FileHandle(forReadingAtPath: path) else { return nil }
        defer { handle.closeFile() }

        let fileSize = handle.seekToEndOfFile()
        let offset = fileSize > UInt64(maxBytes) ? fileSize - UInt64(maxBytes) : 0
        handle.seek(toFileOffset: offset)
        return handle.readDataToEndOfFile()
    }

    private static func firstMatch(_ pattern: String, in line: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(line.startIndex..., in: line)
        guard let match = regex.firstMatch(in: line, range: range) else { return nil }

        var groups: [String] = []
        for i in 0..<match.numberOfRanges {
            if let r = Range(match.range(at: i), in: line) {
                groups.append(String(line[r]))
            } else {
                groups.append("")
            }
        }
        return groups
    }

    private static func parseRuns(from lines: [String]) -> [ProcessingRun] {
        var runs: [ProcessingRun] = []
        var currentFolder: String?
        var currentTimestamp: String?
        var tagCount = 0, tagErrors = 0
        var artCount = 0, artErrors = 0

        for line in lines {
            guard let tsGroups = firstMatch(#"\[(\d{2}:\d{2}:\d{2})\]"#, in: line) else {
                continue
            }
            let ts = tsGroups[1]

            if let procGroups = firstMatch(#"Processing (.+) \((LIVE|DRY RUN)\)\.\.\."#, in: line) {
                currentFolder = procGroups[1]
                currentTimestamp = ts
                tagCount = 0; tagErrors = 0; artCount = 0; artErrors = 0
            } else if let tagGroups = firstMatch(#"Tags: (\d+) processed, (\d+) errors"#, in: line) {
                tagCount = Int(tagGroups[1]) ?? 0
                tagErrors = Int(tagGroups[2]) ?? 0
            } else if let artGroups = firstMatch(#"Art: (\d+) processed, (\d+) errors"#, in: line) {
                artCount = Int(artGroups[1]) ?? 0
                artErrors = Int(artGroups[2]) ?? 0
            } else if firstMatch(#"Done with .+, watching\.\.\."#, in: line) != nil {
                if let folder = currentFolder, let timestamp = currentTimestamp {
                    runs.append(ProcessingRun(
                        folderName: folder,
                        timestamp: timestamp,
                        tagCount: tagCount,
                        tagErrors: tagErrors,
                        artCount: artCount,
                        artErrors: artErrors
                    ))
                }
                currentFolder = nil
            }
        }

        // Return last 10, newest first
        return Array(runs.suffix(10).reversed())
    }
}
