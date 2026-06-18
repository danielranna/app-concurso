import type { SubjectStudyDossierStructured } from "../../coach-types"
import { runAgent } from "../run-agent"
import type { SubjectDossierPayload } from "../subject-dossier-payload"
import { loadOptionsByQuestion } from "../question-options"

const SYSTEM = `Você é tutor de concurso. Sua ÚNICA tarefa é esclarecer as dúvidas do aluno nas anotações (notes) de questões que ele acertou ou errou.

REGRAS:
1. Responda DIRETAMENTE à user_note — cada pergunta ou ponto levantado deve ter resposta explícita
2. Se a nota pedir exemplo numérico, cenário hipotético ("vamos supor", "como fica") ou comparação, inclua exemplo passo a passo com números concretos (mínimo 3 passos)
3. Use statement_excerpt, options e cached_feedback/report_feedback como contexto — não invente trechos do enunciado
4. Se cached_feedback existir mas for genérico ou não responder à nota, substitua por resposta específica
5. Tom didático, português (BR), 4–8 frases por anotação quando a nota tiver dúvidas substantivas
6. PROIBIDO respostas vagas tipo "revise o conceito" ou só repetir definição sem ligar à dúvida

Responda JSON:
{
  "annotation_clarifications": [{
    "question_id": "uuid",
    "note_body": "cópia da nota",
    "answer_md": "resposta completa à dúvida",
    "linked_topics": ["tópico TEC"]
  }]
}

Inclua TODAS as anotações do input com o mesmo question_id.`

export type AnnotationClarificationsResult = {
  clarifications: SubjectStudyDossierStructured["annotation_clarifications"]
  usedLlm: boolean
  modelUsed: string
  tokensIn: number
  tokensOut: number
  costUsd: number
}

export async function runAnnotationClarificationsAgent(params: {
  userId: string
  subjectId: string
  payload: SubjectDossierPayload
  skipLlm?: boolean
}): Promise<AnnotationClarificationsResult> {
  const notes = params.payload.annotations.filter((a) => a.note_body.trim())
  if (!notes.length) {
    return {
      clarifications: [],
      usedLlm: false,
      modelUsed: "rule-based",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    }
  }

  const errorByQ = new Map(
    params.payload.aggregated_errors.map((e) => [e.question_id, e])
  )
  const questionIds = notes.map((n) => n.question_id)
  const optionsByQ = await loadOptionsByQuestion(questionIds)

  const input = {
    subject_name: params.payload.subject_name,
    items: notes.map((a) => {
      const err = errorByQ.get(a.question_id)
      return {
        question_id: a.question_id,
        note_body: a.note_body,
        tec_topic: a.tec_topic ?? err?.tec_topic,
        statement_excerpt: a.statement_excerpt ?? err?.statement_excerpt,
        options: (optionsByQ.get(a.question_id) ?? []).slice(0, 6),
        cached_feedback: a.cached_feedback,
        report_feedback: err?.feedback_detailed?.slice(0, 800),
        error_taxonomy: err?.error_taxonomy,
      }
    }),
  }

  const result = await runAgent({
    agentType: "dossier",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: SYSTEM,
    userContent: JSON.stringify(input),
    jsonMode: true,
    maxTokens: 2000,
    model: "gpt-4o",
    skipLlm: params.skipLlm,
    metadata: { phase: "annotation_clarifications" },
  })

  if (result.usedLlm && result.text) {
    try {
      const parsed = JSON.parse(result.text) as {
        annotation_clarifications?: SubjectStudyDossierStructured["annotation_clarifications"]
      }
      const clarifications = (parsed.annotation_clarifications ?? [])
        .filter((c) => c.question_id && c.answer_md?.trim())
        .map((c) => {
          const src = notes.find((n) => n.question_id === c.question_id)
          return {
            question_id: c.question_id,
            note_body: c.note_body?.trim() || src?.note_body || "",
            answer_md: c.answer_md.trim(),
            linked_topics:
              c.linked_topics?.length
                ? c.linked_topics
                : src?.tec_topic
                  ? [src.tec_topic]
                  : [],
          }
        })
      if (clarifications.length) {
        return {
          clarifications,
          usedLlm: true,
          modelUsed: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
        }
      }
    } catch {
      /* fall through */
    }
  }

  const clarifications = notes.map((a) => ({
    question_id: a.question_id,
    note_body: a.note_body,
    answer_md:
      a.cached_feedback?.trim() ||
      "Revise a explicação no relatório do caderno ou regenere as explicações com IA.",
    linked_topics: a.tec_topic ? [a.tec_topic] : [],
  }))

  return {
    clarifications,
    usedLlm: false,
    modelUsed: "rule-based",
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
  }
}
