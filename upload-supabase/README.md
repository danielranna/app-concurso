# upload-supabase — API de upload na VPS (Hostinger)

Serviço **separado do bot WhatsApp**. Recebe PDFs grandes do app Coach, grava no Supabase e **indexa** a fila de materiais (`parse → chunk → embed`) sem o limite de 60s da Vercel.

---

## O que você precisa antes de começar

1. **Acesso SSH** à VPS Hostinger (painel mostra algo como `ssh root@SEU_IP`).
2. **Chaves do Supabase** (mesmas do projeto na Vercel):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY` (= `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. **URL do app na Vercel** (ex.: `https://seu-app.vercel.app`) para CORS.
4. **Um subdomínio** apontando para o IP da VPS (ex.: `upload.seudominio.com`) — **obrigatório para HTTPS** (o app na Vercel é HTTPS; o navegador bloqueia chamadas HTTP).

---

## Visão geral (3 etapas)

| Etapa | Onde | O quê |
|-------|------|--------|
| A | Seu PC (Windows) | Enviar a pasta `upload-supabase` para a VPS |
| B | VPS (terminal SSH) | Instalar Node, configurar `.env`, subir com PM2 + nginx |
| C | Vercel | Variável `NEXT_PUBLIC_COACH_UPLOAD_URL` + redeploy |

Sim: **quase tudo é pelo terminal** na VPS. No PC você usa PowerShell só para copiar os arquivos (uma vez).

---

# ETAPA A — Enviar a pasta do seu PC para a VPS

## A1. Abrir PowerShell no Windows

1. Pressione `Win + X` → **Terminal** ou **PowerShell**.
2. Vá até a pasta do projeto:

```powershell
cd "C:\Users\Daniel Ranna\Desktop\Concurso\app-vercel-next"
```

(Ajuste o caminho se o seu projeto estiver em outro lugar.)

## A2. Copiar a pasta para a VPS com `scp`

Substitua `SEU_IP` pelo IP da Hostinger (no painel: **Visão geral → Acesso root SSH**, ex. `2.24.88.155`):

```powershell
scp -r upload-supabase root@SEU_IP:/root/upload-supabase
```

- Na primeira vez pode pedir `yes` e a **senha root** da VPS.
- Se der erro de `scp` não encontrado: no Windows 10/11 costuma existir; senão use o **Gerenciador de arquivos SFTP** do painel Hostinger para enviar a pasta `upload-supabase` para `/root/upload-supabase`.

**Alternativa (zip):** compacte `upload-supabase` em `.zip`, envie pelo painel Hostinger, e na VPS:

```bash
cd /root
unzip upload-supabase.zip
# renomeie se precisar para /root/upload-supabase
```

---

# ETAPA B — Configurar na VPS (terminal SSH)

## B1. Conectar na VPS

No PowerShell (ou no botão **Terminal** do painel Hostinger):

```powershell
ssh root@SEU_IP
```

Você deve ver um prompt tipo `root@srv...:~#`.

## B2. Instalar Node.js 20 (se ainda não tiver)

Cole linha por linha:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v
npm -v
```

Deve mostrar `v20.x` e versão do npm.

## B3. Entrar na pasta e instalar dependências

```bash
cd /root/upload-supabase
npm install
```

## B4. Criar o arquivo `.env`

```bash
cp .env.example .env
nano .env
```

No editor `nano`:

- Apague os placeholders e cole seus valores reais do Supabase e da Vercel.
- Exemplo:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
SUPABASE_ANON_KEY=eyJhbG...
PORT=3099
MAX_UPLOAD_BYTES=52428800
ALLOWED_ORIGINS=https://seu-app.vercel.app
```

Salvar no nano: `Ctrl+O`, Enter, sair: `Ctrl+X`.

**ALLOWED_ORIGINS:** URL exata do app (sem `/` no final). Se tiver preview na Vercel, pode adicionar duas URLs separadas por vírgula:

```env
ALLOWED_ORIGINS=https://seu-app.vercel.app,https://seu-app-git-main-seu-user.vercel.app
```

## B5. Testar se o serviço sobe

```bash
cd /root/upload-supabase
node src/index.js
```

Deve aparecer: `[upload-supabase] ouvindo em http://0.0.0.0:3099 ...`

Em **outra** janela SSH (ou outra aba), teste:

```bash
curl http://127.0.0.1:3099/health
```

Resposta esperada: `{"ok":true,"service":"upload-supabase"}`

Volte na primeira janela e pare o teste: `Ctrl+C`.

## B6. Instalar PM2 e deixar rodando sempre

```bash
npm install -g pm2
cd /root/upload-supabase
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

O comando `pm2 startup` vai imprimir **uma linha** começando com `sudo env ...` — **copie e cole essa linha inteira** e execute.

Confira:

```bash
pm2 list
```

Deve aparecer `upload-supabase` com status **online**. O bot WhatsApp (se já existir) continua em outro processo — **não mistura**.

Logs:

```bash
pm2 logs upload-supabase --lines 50
```

## B7. Nginx + HTTPS (para o app na Vercel conseguir chamar)

O navegador **não** aceita `http://IP:3099` a partir de um site `https://` na Vercel. Precisa de **HTTPS** em um domínio.

### B7.1 DNS

No painel do seu domínio (Hostinger ou outro), crie um registro:

- Tipo: **A**
- Nome: `upload` (fica `upload.seudominio.com`)
- Valor: **IP da VPS** (o mesmo do SSH)

Espere alguns minutos para propagar.

### B7.2 Instalar nginx e certificado

Na VPS:

```bash
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx
```

Crie o arquivo do site (troque o domínio):

```bash
nano /etc/nginx/sites-available/upload-supabase
```

Cole (troque `upload.seudominio.com`):

```nginx
server {
    listen 80;
    server_name upload.seudominio.com;

    client_max_body_size 55m;

    location / {
        proxy_pass http://127.0.0.1:3099;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Ative o site:

```bash
ln -sf /etc/nginx/sites-available/upload-supabase /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

Gere o certificado SSL (siga as perguntas do certbot; email válido):

```bash
certbot --nginx -d upload.seudominio.com
```

Teste de fora da VPS:

```bash
curl https://upload.seudominio.com/health
```

Deve retornar `{"ok":true,...}`.

### B7.3 Firewall Hostinger

No painel Hostinger → **Segurança** / firewall: libere **443** (HTTPS). A porta **3099** não precisa estar aberta na internet (só localhost + nginx).

---

# ETAPA C — Vercel (app Next)

1. Abra o projeto no [dashboard Vercel](https://vercel.com) → **Settings** → **Environment Variables**.
2. Adicione:

| Nome | Valor |
|------|--------|
| `NEXT_PUBLIC_COACH_UPLOAD_URL` | `https://upload.seudominio.com` (sem barra no final) |
| `NEXT_PUBLIC_COACH_UPLOAD_MAX_MB` | `50` (mesmo valor de `MAX_UPLOAD_BYTES` na VPS, em MB) |

3. **Redeploy** o projeto (Deployments → ⋮ → Redeploy).

Com `NEXT_PUBLIC_COACH_UPLOAD_URL` configurado, o botão **Processar próximo / Processar todos** na fila global do Coach chama `POST /coach/jobs/process-next` nesta VPS (não a Vercel). A consulta da fila continua na Vercel (`GET /api/coach/documents/ingest-queue`).

Opcional (se configurou `COACH_UPLOAD_SHARED_SECRET` no `.env` da VPS):

| Nome | Valor |
|------|--------|
| `NEXT_PUBLIC_COACH_UPLOAD_SECRET` | mesmo secret |

---

# Testar no app

1. Faça login no app (produção na Vercel).
2. Vá em **Coach → Matérias → [matéria] → Materiais**.
3. Envie um PDF entre 5 e 15 MB (antes dava 413).
4. O texto da tela deve mencionar envio pela VPS e limite **50 MB** (ou o valor de `NEXT_PUBLIC_COACH_UPLOAD_MAX_MB`).
5. Abra o painel de **fila de indexação** (layout do Coach) e clique **Processar próximo** — PDFs grandes podem levar vários minutos; o nginx precisa de `proxy_read_timeout 600s`.

Se falhar:

- `pm2 logs upload-supabase`
- Confira se `ALLOWED_ORIGINS` é **exatamente** a URL que aparece na barra do navegador.
- Confira `curl https://upload.seudominio.com/health`

---

# Comandos úteis depois

| Ação | Comando |
|------|---------|
| Ver status | `pm2 list` |
| Reiniciar upload | `pm2 restart upload-supabase` |
| Ver logs | `pm2 logs upload-supabase` |
| Atualizar código | No PC: `scp -r upload-supabase root@IP:/root/upload-supabase` → na VPS: `cd /root/upload-supabase && npm install && pm2 restart upload-supabase` |

---

# Sem domínio ainda?

Enquanto não tiver HTTPS, o app continua usando a rota da Vercel (4 MB). Não configure `NEXT_PUBLIC_COACH_UPLOAD_URL` até o `https://upload...` estar funcionando.

---

# Indexação na VPS

| Rota | Função |
|------|--------|
| `POST /coach/documents/upload` | Upload rápido → `ingest_stage: uploaded` |
| `POST /coach/jobs/process-next` | 1 PDF — modo `auto` (padrão): só faz o passo que falta |
| `POST /coach/jobs/run-batch` | Lote na VPS (`max_documents`, `max_seconds`, `step` opcional) |
| `POST /coach/jobs/cancel-batch` | Cancela lote em andamento para o usuário |

No app (Coach), o painel **Pipeline de indexação** mostra cada PDF por etapa real (`needs_chunk`, `needs_embed`, etc.) e o botão **Completar até RAG (VPS)** dispara lotes até acabar.

Variáveis no `.env` da VPS:

| Variável | Descrição |
|----------|-----------|
| `AI_CREDENTIALS_SECRET` | **Obrigatório para RAG** — mesmo valor da Vercel (descriptografa chave OpenAI do usuário) |
| `INGEST_PDF_TIMEOUT_MS` | `0` = sem limite na extração; ou ex. `1800000` (30 min) |

Sem `AI_CREDENTIALS_SECRET`, os PDFs ficam com texto/chunks mas **sem vetores**. Corrija o secret e rode o lote de novo.

Diagnóstico no Supabase: rode `sql-rag-ingest-audit.sql` na raiz do projeto Next.

Backfill sem browser (cron):

```bash
# No .env:
# INGEST_CRON_USER_IDS=seu-user-uuid
# INGEST_CRON_MAX_PER_USER=20
# INGEST_CRON_MAX_SECONDS=540
node scripts/process-queue-once.js
```

O cron usa `mode: auto` — pula re-parse se o texto já está em `document_source_text`.

PDFs travados sem chunks: rode `sql-heal-ingest-backlog.sql` no Supabase (na raiz do repo Next).

Avisos `TT: undefined function` e `Buffer() deprecated` no log são **ruído do pdf-parse**, não impedem a indexação.

---

# Estrutura desta pasta

```
upload-supabase/
  src/index.js           # Express: upload + process-next + run-batch
  src/upload.js          # grava PDF no Storage + subject_documents
  src/ingest/            # pipeline (sync com lib/ai/document-ingest.ts)
  src/ingest/effective-step.js
  src/ingest/ingest-status.js
  scripts/process-queue-once.js
  ecosystem.config.cjs
  .env.example
```
