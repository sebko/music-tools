import SwiftUI

@main
struct SinglesWatcherApp: App {
    @StateObject private var viewModel = StatusViewModel()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(viewModel: viewModel)
                .onAppear { viewModel.startPolling() }
        } label: {
            Image(systemName: viewModel.isRunning ? "circle.fill" : "circle")
        }
        .menuBarExtraStyle(.window)
    }
}
