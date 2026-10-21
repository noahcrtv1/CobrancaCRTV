# CobrançaCRTV

Envia lembretes de cobrança pelo WhatsApp automaticamente 10, 5 e 1 dia antes do vencimento (configurável por cobrança, inclusive "no dia").

## Subir

```bash
cp .env.example .env   # edite chave e senha
docker compose up -d --build
```

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
