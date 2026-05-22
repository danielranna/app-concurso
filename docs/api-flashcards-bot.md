# API Flashcards — Bot WhatsApp (VPS)

Base URL: `https://SEU-DOMINIO.vercel.app`

Autenticação em todas as rotas `/api/flashcards/bot/*`:

```
Authorization: Bearer fc_xxxxxxxx
```

Gere a chave em **Flashcards → Configurações → Gerar API key**.

---

## Fluxo na VPS

### 1. Job matinal (`node-cron` ou crontab)

No horário `start_hour` (configurado no app):

```javascript
const BASE = process.env.FLASHCARDS_API_URL
const KEY = process.env.FLASHCARDS_API_KEY

async function morningReminder() {
  const pending = await fetch(`${BASE}/api/flashcards/bot/pending`, {
    headers: { Authorization: `Bearer ${KEY}` },
  }).then((r) => r.json())

  if (!pending.should_remind) return

  // Enviar WhatsApp com pending.message_template
  await sendWhatsApp(pending.message_template)

  const session = await fetch(`${BASE}/api/flashcards/bot/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ card_ids: pending.card_ids }),
  }).then((r) => r.json())

  // Guardar session.id mapeado ao telefone do usuário
  sessionsByPhone[userPhone] = session.id
}
```

### 2. Webhook — resposta SIM / NÃO

```javascript
if (text.match(/^sim$/i) && sessionsByPhone[phone]) {
  await fetch(`${BASE}/api/flashcards/bot/sessions/${sessionsByPhone[phone]}/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
  })
}

if (text.match(/^n[aã]o$/i) && sessionsByPhone[phone]) {
  await fetch(`${BASE}/api/flashcards/bot/sessions/${sessionsByPhone[phone]}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
  })
}
```

### 3. Poller de cards (a cada 60–120s, entre start_hour e end_hour)

```javascript
setInterval(async () => {
  const items = await fetch(`${BASE}/api/flashcards/bot/dispatch/due`, {
    headers: { Authorization: `Bearer ${KEY}` },
  }).then((r) => r.json())

  for (const item of items) {
    if (!item.card) continue
    // Enviar pergunta (texto ou image_url de item.card.front)
    await sendWhatsApp(formatQuestion(item.card))
    await fetch(`${BASE}/api/flashcards/bot/dispatch/${item.dispatch_id}/sent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}` },
    })
    awaitingReveal[item.dispatch_id] = item.card
  }
}, 90_000)
```

### 4. Revelar + rating

Quando o usuário responder à pergunta, envie o verso (`on_reveal`) e peça 1–4:

```
1 = Again | 2 = Hard | 3 = Good | 4 = Easy
```

```javascript
await fetch(`${BASE}/api/flashcards/bot/dispatch/${dispatchId}/answer`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ rating: 3 }),
})
```

---

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/flashcards/bot/pending` | Cards pendentes + `message_template` |
| POST | `/api/flashcards/bot/sessions` | Cria sessão `pending_confirm` |
| GET | `/api/flashcards/bot/sessions/active` | Sessão ativa (recuperar após restart) |
| POST | `/api/flashcards/bot/sessions/:id/confirm` | Usuário disse SIM → agenda dispatch |
| POST | `/api/flashcards/bot/sessions/:id/cancel` | Usuário disse NÃO |
| GET | `/api/flashcards/bot/dispatch/due` | Cards prontos para enviar agora |
| POST | `/api/flashcards/bot/dispatch/:id/sent` | Marca como enviado |
| POST | `/api/flashcards/bot/dispatch/:id/answer` | Registra rating FSRS |
| GET/PUT | `/api/flashcards/bot/settings` | Config do bot (Bearer) |

---

## Payload do card

```json
{
  "card_id": "uuid",
  "type": "cloze_image",
  "deck_name": "Direito",
  "front": { "text": null, "image_url": "https://.../occluded.png" },
  "on_reveal": { "text": null, "image_url": "https://.../original.png" }
}
```

---

## Variáveis `.env` no bot

```
FLASHCARDS_API_URL=https://seu-app.vercel.app
FLASHCARDS_API_KEY=fc_...
WHATSAPP_TOKEN=...
```

---

## Setup Supabase (obrigatório)

1. Executar `sql-flashcards.sql` no SQL Editor
2. Criar bucket Storage `flashcard-images` (público)
