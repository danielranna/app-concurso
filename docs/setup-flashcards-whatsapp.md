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

1. Configurações → **Buscar contas do WhatsApp**
2. Escolher nome → **Salvar**
3. **Gerar API key** → copiar `fc_...` para VPS
4. Definir `start_hour` / `end_hour`

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
