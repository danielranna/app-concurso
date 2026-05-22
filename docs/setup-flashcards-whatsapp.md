# Setup Flashcards + WhatsApp

Guia alinhado à integração com o bot na VPS e o site Quiz (Papa Vagas).

## Variáveis — projeto Flashcards (Vercel)

| Variável | Obrigatório |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Sim |
| `QUIZ_BOT_USERS_URL` | Sim — `https://SEU-QUIZ.vercel.app/api/flashcards-whatsapp-users` |
| `QUIZ_BOT_USERS_SECRET` | Sim — mesmo valor que `FLASHCARDS_BOT_INBOUND_SECRET` no Quiz |

**Não** coloque `FLASHCARDS_API_KEY` aqui; gere no app (Configurações) e use só na VPS.

## Supabase

1. `sql-flashcards.sql`
2. `sql-flashcards-whatsapp-jid.sql` (se a tabela já existia)
3. Bucket `flashcard-images` (público)

## No app

1. **Gerar API key** (`fc_...`) — fica na conta da pessoa, não na VPS
2. **Buscar contas do WhatsApp** → escolher nome
3. **Vincular e pedir confirmação** → responde **SIM** no privado do bot
4. Salvar horários / ativar lembretes

**Desvincular:** botão na mesma tela.

**Papa Vagas:** após SIM, chamar `POST .../api/flashcards/bot/whatsapp-authorized` no app Flashcards.

## VPS (.env)

```env
FLASHCARDS_API_URL=https://seu-app-flashcards.vercel.app
FLASHCARDS_API_KEY=fc_...
FLASHCARDS_POLL_MS=90000
```

## Teste rápido

```bash
curl -s -H "Authorization: Bearer fc_SUA_KEY" \
  "https://seu-app.vercel.app/api/flashcards/bot/settings"
```

Deve incluir `"whatsapp_jid": "..."`.

Ver também: [api-flashcards-bot.md](./api-flashcards-bot.md)
