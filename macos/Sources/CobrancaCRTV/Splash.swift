import SwiftUI

// Tela de abertura: fica até clicar em "Começar". O servidor já sobe por trás.
struct SplashView: View {
    let serverReady: Bool
    let onStart: () -> Void

    @State private var appeared = false
    @State private var glow = false

    private let green = Color(red: 0.145, green: 0.827, blue: 0.4)
    private let teal = Color(red: 0.078, green: 0.722, blue: 0.651)
    private let cyan = Color(red: 0.133, green: 0.827, blue: 0.933)

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.063, green: 0.141, blue: 0.11), Color(red: 0.027, green: 0.047, blue: 0.039)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            // Brilhos que respiram devagar
            Circle()
                .fill(RadialGradient(colors: [green.opacity(0.35), .clear], center: .center, startRadius: 0, endRadius: 320))
                .frame(width: 640, height: 640)
                .offset(x: glow ? -60 : -120, y: glow ? -90 : -40)
                .blur(radius: 30)
            Circle()
                .fill(RadialGradient(colors: [cyan.opacity(0.22), .clear], center: .center, startRadius: 0, endRadius: 280))
                .frame(width: 560, height: 560)
                .offset(x: glow ? 170 : 120, y: glow ? 120 : 170)
                .blur(radius: 30)

            VStack(spacing: 0) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .interpolation(.high)
                    .frame(width: 148, height: 148)
                    .shadow(color: green.opacity(0.45), radius: glow ? 40 : 22, y: 10)
                    .scaleEffect(appeared ? 1 : 0.82)
                    .opacity(appeared ? 1 : 0)

                Text("CobrançaCRTV")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .foregroundStyle(LinearGradient(colors: [.white, Color(white: 0.8)], startPoint: .top, endPoint: .bottom))
                    .padding(.top, 28)
                    .opacity(appeared ? 1 : 0)
                    .offset(y: appeared ? 0 : 12)

                Text("Lembretes de cobrança no WhatsApp, no tempo certo.")
                    .font(.title3)
                    .foregroundStyle(.white.opacity(0.62))
                    .padding(.top, 8)
                    .opacity(appeared ? 1 : 0)
                    .offset(y: appeared ? 0 : 12)

                HStack(spacing: 10) {
                    feature("calendar.badge.clock", "10, 5 e 1 dia antes", green)
                    feature("exclamationmark.bubble", "Aviso de atraso", teal)
                    feature("person.3", "Contatos e grupos", cyan)
                }
                .padding(.top, 34)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 16)

                Button(action: onStart) {
                    HStack(spacing: 10) {
                        Text("Começar")
                        Image(systemName: "arrow.right")
                    }
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color(red: 0.016, green: 0.082, blue: 0.039))
                    .padding(.horizontal, 34)
                    .padding(.vertical, 14)
                    .background(LinearGradient(colors: [green, teal], startPoint: .leading, endPoint: .trailing), in: .capsule)
                    .shadow(color: green.opacity(0.5), radius: glow ? 22 : 12, y: 6)
                    .contentShape(.capsule)
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.defaultAction)
                .padding(.top, 44)
                .opacity(appeared ? 1 : 0)
                .scaleEffect(appeared ? 1 : 0.9)

                HStack(spacing: 6) {
                    Circle()
                        .fill(serverReady ? green : Color.orange)
                        .frame(width: 7, height: 7)
                    Text(serverReady ? "Servidor pronto" : "Preparando servidor…")
                }
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.45))
                .padding(.top, 18)
                .opacity(appeared ? 1 : 0)
                .animation(.easeInOut, value: serverReady)
            }
            .padding(40)
        }
        .onAppear {
            withAnimation(.spring(response: 0.9, dampingFraction: 0.8).delay(0.1)) { appeared = true }
            withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) { glow = true }
        }
    }

    private func feature(_ symbol: String, _ title: String, _ tint: Color) -> some View {
        Label(title, systemImage: symbol)
            .font(.callout.weight(.medium))
            .foregroundStyle(.white.opacity(0.85))
            .symbolRenderingMode(.hierarchical)
            .imageScale(.medium)
            .tint(tint)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .glassEffect(.regular.tint(tint.opacity(0.18)), in: .capsule)
    }
}
