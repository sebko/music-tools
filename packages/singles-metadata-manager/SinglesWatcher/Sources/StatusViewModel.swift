import AppKit
import Combine

@MainActor
final class StatusViewModel: ObservableObject {
    @Published var isRunning = false
    @Published var recentRuns: [ProcessingRun] = []
    @Published var lastChecked = Date()
    @Published var scanProgress: ScanProgressInfo?
    @Published var isScanRunning = false

    private let daemonLabel = "com.djtools.singles-watcher"
    private let logPath: String
    private let progressPath: String
    private let scriptsDir: String
    private var timer: AnyCancellable?
    private var scanProcess: Process?

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        self.logPath = "\(home)/Library/Logs/singles-watcher.log"
        self.progressPath = "\(home)/Library/Logs/singles-watcher-progress.json"
        self.scriptsDir = "\(home)/github/dj-tools/packages/singles-metadata-manager/scripts"
    }

    func startPolling() {
        refresh()
        timer = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.refresh()
            }
    }

    func stopPolling() {
        timer?.cancel()
    }

    func refresh() {
        isRunning = checkDaemon()
        recentRuns = LogParser.recentRuns(logPath: logPath)
        lastChecked = Date()
        refreshScanProgress()
    }

    func openLog() {
        let url = URL(fileURLWithPath: logPath)
        NSWorkspace.shared.open(url)
    }

    func triggerFullScan() {
        guard !isScanRunning else { return }
        isScanRunning = true

        let process = Process()
        let venvPython = "\(scriptsDir)/../.venv/bin/python"
        let scriptPath = "\(scriptsDir)/run_all.py"
        let singlesDir = "/Volumes/T7/DJ Library/Singles"

        process.executableURL = URL(fileURLWithPath: venvPython)
        process.arguments = [scriptPath, singlesDir]
        process.currentDirectoryURL = URL(fileURLWithPath: scriptsDir)
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        process.terminationHandler = { [weak self] _ in
            Task { @MainActor in
                self?.isScanRunning = false
                self?.scanProcess = nil
                self?.refresh()
            }
        }

        do {
            try process.run()
            scanProcess = process
        } catch {
            isScanRunning = false
        }
    }

    // MARK: - Private

    private func refreshScanProgress() {
        if let info = ScanProgressInfo.read(from: progressPath), info.running {
            scanProgress = info
            isScanRunning = true
        } else {
            scanProgress = nil
            // Only clear isScanRunning if our process is also not running
            if scanProcess == nil || !(scanProcess?.isRunning ?? false) {
                isScanRunning = false
            }
        }
    }

    private func checkDaemon() -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        process.arguments = ["list", daemonLabel]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }
}
