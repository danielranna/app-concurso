import "dotenv/config"
import express from "express"
import cors from "cors"
import multer from "multer"
import { loadConfig } from "./config.js"
import { resolveUserFromRequest } from "./auth.js"
import { uploadStudyMaterialPdf } from "./upload.js"
import { getServiceClient } from "./supabase.js"
import { processNextIngestDocument } from "./ingest/worker.js"

const config = loadConfig()
const app = express()

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (!config.allowedOrigins.length) return cb(null, true)
      if (config.allowedOrigins.includes(origin)) return cb(null, true)
      cb(new Error(`CORS bloqueado para origem: ${origin}`))
    },
    credentials: true,
  })
)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 30 },
})

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "upload-supabase", ingest: true })
})

app.post("/coach/jobs/process-next", express.json(), async (req, res) => {
  try {
    const auth = await resolveUserFromRequest(req, config)
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error })
    }

    const bodyUserId =
      typeof req.body?.user_id === "string" ? req.body.user_id.trim() : ""
    if (!bodyUserId) {
      return res.status(400).json({ error: "user_id obrigatório" })
    }
    if (bodyUserId !== auth.userId) {
      return res.status(403).json({ error: "user_id não corresponde à sessão" })
    }

    const random = Boolean(req.body?.random)
    const includeFailed = Boolean(req.body?.include_failed)
    const mode =
      req.body?.mode === "embed_only" ? "embed_only" : "full"
    const supabase = getServiceClient(config)
    const result = await processNextIngestDocument(supabase, config, bodyUserId, {
      random,
      includeFailed,
      mode,
    })
    return res.json(result)
  } catch (e) {
    console.error("[ingest] process-next", e)
    const msg = e instanceof Error ? e.message : "Erro interno"
    return res.status(500).json({ error: msg })
  }
})

app.post(
  "/coach/documents/upload",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "files", maxCount: 30 },
  ]),
  async (req, res) => {
    try {
      const auth = await resolveUserFromRequest(req, config)
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error })
      }
      const userId = auth.userId

      const docType = (req.body?.doc_type || "study_material").trim()
      const subjectId = (req.body?.subject_id || "").trim()

      if (docType !== "study_material") {
        return res.status(400).json({
          error:
            "Nesta API só study_material é suportado. Use a Vercel para edital/incidência.",
        })
      }
      if (!subjectId) {
        return res.status(400).json({ error: "subject_id obrigatório" })
      }

      const files = []
      if (req.files?.file?.length) files.push(...req.files.file)
      if (req.files?.files?.length) files.push(...req.files.files)

      if (!files.length) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" })
      }

      const maxLabel = `${Math.round(config.maxUploadBytes / (1024 * 1024))} MB`
      const uploaded = []
      const documentIds = []
      const errors = []

      for (const file of files) {
        if (file.size > config.maxUploadBytes) {
          errors.push({
            file: file.originalname,
            error: `Máximo ${maxLabel} por arquivo.`,
          })
          continue
        }

        const title =
          req.body?.[`title_${file.originalname}`] ||
          req.body?.title ||
          file.originalname

        try {
          const { doc, duplicate } = await uploadStudyMaterialPdf(config, {
            userId,
            buffer: file.buffer,
            fileName: file.originalname,
            title,
            subjectId,
          })
          const docId = doc.id
          uploaded.push({
            id: docId,
            title: doc.title,
            doc_type: doc.doc_type,
            status: doc.status,
            ingest_stage: doc.ingest_stage,
            duplicate: duplicate || Number(doc.chunk_count ?? 0) > 0,
          })
          if (docId && !duplicate) documentIds.push(docId)
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Falha no upload"
          errors.push({ file: file.originalname, error: msg })
        }
      }

      return res.json({
        uploaded,
        count: uploaded.length,
        document_ids: documentIds,
        errors: errors.length ? errors : undefined,
      })
    } catch (e) {
      console.error("[upload]", e)
      const msg = e instanceof Error ? e.message : "Erro interno"
      return res.status(500).json({ error: msg })
    }
  }
)

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Arquivo grande demais para esta API." })
  }
  console.error("[upload] middleware", err)
  res.status(500).json({ error: err?.message || "Erro" })
})

app.listen(config.port, "0.0.0.0", () => {
  console.log(
    `[upload-supabase] ouvindo em http://0.0.0.0:${config.port} (máx. ${config.maxUploadBytes} bytes/arquivo)`
  )
})
