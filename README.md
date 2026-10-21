# CobrançaCRTV

Envia lembretes de cobrança pelo WhatsApp automaticamente 10, 5 e 1 dia antes do vencimento (configurável por cobrança, inclusive "no dia").

## Instalar no seu Mac

Roda no seu próprio computador: o WhatsApp conectado é o seu, e o Mac precisa estar ligado na hora dos envios.
Precisa de um Mac com Apple Silicon e macOS 26 ou mais novo (o painel em si roda em qualquer máquina com Docker).

1. Instale o **Homebrew** (se ainda não tiver), colando no Terminal o comando de https://brew.sh
2. Instale o Docker leve (colima) e deixe ele ligar sozinho com o Mac:

```bash
brew install colima docker docker-compose
[ -f ~/.docker/config.json ] || { mkdir -p ~/.docker && echo '{"cliPluginsExtraDirs":["/opt/homebrew/lib/docker/cli-plugins"]}' > ~/.docker/config.json; }
brew services start colima
```

3. Baixe o projeto e crie sua configuração:

```bash
git clone https://github.com/noahcrtv1/CobrancaCRTV.git
cd CobrancaCRTV
cp .env.example .env
open -e .env
```

   No `.env`, troque `EVOLUTION_API_KEY` por uma senha longa qualquer e `PANEL_PASSWORD` pela senha do painel. Salve.

4. Suba tudo (a primeira vez demora alguns minutos baixando as imagens):

```bash
docker compose up -d --build
```

5. **App do Mac (opcional)** — uma janela própria no Dock que liga o Docker sozinha se estiver parado.
   Precisa do **Xcode** (App Store, grátis; abra uma vez e aceite a licença):

```bash
macos/scripts/build-app.sh --install
```

   Na primeira abertura, se o macOS bloquear: **Ajustes do Sistema ▸ Privacidade e Segurança ▸ Abrir Mesmo Assim**.
   Se mover a pasta do projeto, rode esse comando de novo.

Para atualizar depois: `git pull && docker compose up -d --build`.

## Usar

Painel: http://localhost:3010 (login `admin` / senha do `.env`).

1. **Configurações** → Gerar QR code → no celular: WhatsApp › Aparelhos conectados › Conectar aparelho.
2. Preencha chave Pix, favorecido, hora do envio e texto da mensagem.
3. **Clientes** → cadastre nome + WhatsApp (DDD + número).
4. **Cobranças** → valor, vencimento, dias de aviso, mensal ou avulsa.

## Como funciona

- A cada hora (após a hora configurada) verifica cobranças cujo vencimento cai em um dos dias de aviso e envia. Nunca envia o mesmo aviso duas vezes; se der erro, tenta de novo na hora seguinte.
- **Pago**: cobrança mensal avança para o mês seguinte; avulsa é desativada.
- Envios espaçados 3–7s para reduzir risco de bloqueio do número.
- Dados em `data/cobranca.db` (SQLite) — faça backup dessa pasta.

O Mac/servidor precisa estar ligado na hora do envio.
