import SwiftUI

struct MenuBarView: View {
    @ObservedObject var viewModel: StatusViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            statusHeader
            if let progress = viewModel.scanProgress {
                Divider()
                scanProgressSection(progress)
            }
            Divider()
            if viewModel.recentRuns.isEmpty {
                Text("No recent activity")
                    .foregroundStyle(.secondary)
                    .font(.callout)
            } else {
                recentActivity
            }
            Divider()
            footerButtons
        }
        .padding(12)
        .frame(width: 320)
    }

    // MARK: - Status header

    private var statusHeader: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(viewModel.isRunning ? .green : .red)
                .frame(width: 10, height: 10)
            Text(viewModel.isRunning ? "Running" : "Stopped")
                .font(.headline)
            Spacer()
            Text(viewModel.lastChecked, style: .time)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Recent activity

    private var recentActivity: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Recent Activity")
                .font(.caption)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)

            ForEach(viewModel.recentRuns) { run in
                HStack(spacing: 6) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(run.folderName)
                            .font(.callout)
                            .lineLimit(1)
                        Text("\(run.tagCount) files")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if run.totalErrors > 0 {
                        Text("\(run.totalErrors) err")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.red.opacity(0.2))
                            .foregroundStyle(.red)
                            .clipShape(Capsule())
                    }
                    Text(run.timestamp)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .monospacedDigit()
                }
            }
        }
    }

    // MARK: - Scan progress

    private func scanProgressSection(_ progress: ScanProgressInfo) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(progress.phaseLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                Spacer()
                Text("\(progress.foldersDone)/\(progress.totalFolders) folders")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }

            ProgressView(value: progress.folderProgress)
                .tint(.accentColor)

            if !progress.currentFolder.isEmpty {
                Text(progress.currentFolder)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
        }
    }

    // MARK: - Footer

    private var footerButtons: some View {
        HStack {
            Button("Open Log") {
                viewModel.openLog()
            }
            Button("Full Scan") {
                viewModel.triggerFullScan()
            }
            .disabled(viewModel.isScanRunning)
            Spacer()
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
        }
        .buttonStyle(.plain)
        .font(.callout)
    }
}
