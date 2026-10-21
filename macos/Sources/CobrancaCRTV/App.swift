import SwiftUI
import WebKit

// Painel roda no Docker local; o app só garante que ele está de pé e o exibe.
let panelURL = URL(string: "http://localhost:3010/")!
// Pasta do projeto (com docker-compose.yml), gravada no Info.plist pelo build-app.sh.
let projectDir = Bundle.main.object(forInfoDictionaryKey: "CRTVProjectDir") as? String
    ?? NSString(string: "~/Claude/CobrancaCRTV").expandingTildeInPath

@main
struct CobrancaCRTVApp: App {
    @State private var model = ServerModel()

    var body: some Scene {
        Window("Cobrança", id: "main") {
            ContentView(model: model)
                .frame(minWidth: 900, minHeight: 600)
                .task { await model.ensureRunning() }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1180, height: 780)
        .commands {
            CommandGroup(after: .toolbar) {
                Button("Recarregar") { model.reloadToken += 1 }
                    .keyboardShortcut("r")
            }
        }
    }
}

@Observable
final class ServerModel {
    enum State: Equatable { case checking, starting, ready, failed(String) }
    var state: State = .checking
    var reloadToken = 0

    func ensureRunning() async {
        state = .checking
        if await isUp() { state = .ready; return }
        state = .starting
        let out = await shell("colima status >/dev/null 2>&1 || colima start; cd '\(projectDir)' && docker compose up -d")
        for _ in 0..<60 {
            if await isUp() { state = .ready; return }
            try? await Task.sleep(for: .seconds(1))
        }
        state = .failed(out.isEmpty ? "O painel não respondeu em localhost:3010." : out)
    }

    private func isUp() async -> Bool {
        var req = URLRequest(url: panelURL.appending(path: "login"))
        req.timeoutInterval = 2
        guard let (_, resp) = try? await URLSession.shared.data(for: req) else { return false }
        return (resp as? HTTPURLResponse)?.statusCode == 200
    }

    private func shell(_ cmd: String) async -> String {
        await withCheckedContinuation { cont in
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/bin/zsh")
            p.arguments = ["-lc", cmd]
            let pipe = Pipe()
            p.standardOutput = pipe
            p.standardError = pipe
            p.terminationHandler = { _ in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let text = String(decoding: data, as: UTF8.self)
                cont.resume(returning: p.terminationStatus == 0 ? "" : String(text.suffix(600)))
            }
            do { try p.run() } catch { cont.resume(returning: error.localizedDescription) }
        }
    }
}

struct ContentView: View {
    let model: ServerModel
    @State private var started = false

    var body: some View {
        ZStack {
            if started {
                panel.transition(.opacity)
            } else {
                SplashView(serverReady: model.state == .ready) {
                    withAnimation(.easeInOut(duration: 0.45)) { started = true }
                }
                .transition(.opacity.combined(with: .scale(scale: 1.04)))
            }
        }
        .preferredColorScheme(.dark)
    }

    private var panel: some View {
        ZStack {
            Color(red: 0.06, green: 0.067, blue: 0.082).ignoresSafeArea()
            switch model.state {
            case .ready:
                PanelWebView(reloadToken: model.reloadToken).ignoresSafeArea()
            case .checking, .starting:
                VStack(spacing: 14) {
                    ProgressView().controlSize(.large)
                    Text(model.state == .starting ? "Iniciando servidor de cobrança…" : "Conectando…")
                        .foregroundStyle(.secondary)
                }
            case .failed(let msg):
                VStack(spacing: 14) {
                    Image(systemName: "exclamationmark.triangle.fill").font(.largeTitle).foregroundStyle(.orange)
                    Text("Não foi possível abrir o painel").font(.headline)
                    Text(msg).font(.caption.monospaced()).foregroundStyle(.secondary)
                        .frame(maxWidth: 560).textSelection(.enabled)
                    Button("Tentar de novo") { Task { await model.ensureRunning() } }
                        .buttonStyle(.glassProminent)
                }
                .padding(32)
            }
        }
        .preferredColorScheme(.dark)
    }
}

struct PanelWebView: NSViewRepresentable {
    let reloadToken: Int

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Abre espaço p/ os botões da janela, já que a barra de título é oculta
        config.userContentController.addUserScript(WKUserScript(
            source: "document.documentElement.classList.add('mac-app')",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = context.coordinator
        web.navigationDelegate = context.coordinator
        web.underPageBackgroundColor = NSColor(red: 0.06, green: 0.067, blue: 0.082, alpha: 1)
        web.load(URLRequest(url: panelURL))
        context.coordinator.lastToken = reloadToken
        return web
    }

    func updateNSView(_ web: WKWebView, context: Context) {
        if context.coordinator.lastToken != reloadToken {
            context.coordinator.lastToken = reloadToken
            web.reload()
        }
    }

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        var lastToken = 0

        // Só navega dentro do painel local; o resto abre no navegador
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .cancel }
            if url.host == "localhost" || url.scheme == "about" || url.scheme == "data" { return .allow }
            NSWorkspace.shared.open(url)
            return .cancel
        }

        // alert() e confirm() do painel viram diálogos nativos
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
            let a = NSAlert()
            a.messageText = message
            a.runModal()
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
            let a = NSAlert()
            a.messageText = message
            a.addButton(withTitle: "OK")
            a.addButton(withTitle: "Cancelar")
            return a.runModal() == .alertFirstButtonReturn
        }
    }
}
