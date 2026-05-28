import type { ErrorTaxonomy } from "../coach-types"
import type { ClassificationResult, WrongAttemptRow } from "./error-classifier-types"

const MEMORIZATION_NOTE_RE =
  /\b(prazo|prazos|data|datas|vigência|vigencia|decadência|decadencia|prescrição|prescricao|alíquota|aliquota|percentual|competência|competencia|decorar|memoriz)\b/i

const COMPREHENSION_NOTE_RE =
  /\b(confundi|confusão|confusao|não entendi|nao entendi|misturei|troquei|aplicação|aplicacao|causa|efeito|essência|essencia)\b/i

const ATTENTION_KEYWORD_RE =
  /\b(exceto|incorreta|incorreto|não se aplica|nao se aplica|assinale a alternativa incorreta|todas estão corretas exceto)\b/i

const PROCEDURE_NOTE_RE =
  /\b(cálculo|calculo|conta|soma|subtração|subtracao|etapa|sequência|sequencia|operacional|fórmula|formula)\b/i

function noteSignalsTaxonomy(note: string): ClassificationResult | null {
  const n = note.trim()
  if (!n) return null

  if (MEMORIZATION_NOTE_RE.test(n)) {
    return {
      taxonomy: "falta_memorizacao",
      evidence: ["Nota do aluno indica lacuna factual/memorização"],
      specific_mistake: n.slice(0, 120),
      confidence: "alta",
      source: "heuristic",
    }
  }
  if (COMPREHENSION_NOTE_RE.test(n)) {
    return {
      taxonomy: "falta_compreensao",
      evidence: ["Nota do aluno indica confusão conceitual ou aplicação"],
      specific_mistake: n.slice(0, 120),
      confidence: "alta",
      source: "heuristic",
    }
  }
  if (PROCEDURE_NOTE_RE.test(n)) {
    return {
      taxonomy: "calculo_procedimento",
      evidence: ["Nota do aluno menciona cálculo ou procedimento"],
      specific_mistake: n.slice(0, 120),
      confidence: "media",
      source: "heuristic",
    }
  }
  return null
}

export function heuristicClassify(row: WrongAttemptRow): ClassificationResult {
  const fromNote = noteSignalsTaxonomy(row.user_note)
  if (fromNote) return fromNote

  const evidence: string[] = []
  const dur = row.duration_ms ?? 0
  const statement = row.statement.toLowerCase()

  if (ATTENTION_KEYWORD_RE.test(statement) && row.confidence_level === "seguro" && !row.is_correct) {
    evidence.push("Enunciado com palavra-chave de banca e confiança alta no erro")
    return {
      taxonomy: "desatencao",
      evidence,
      source: "heuristic",
      confidence: "media",
    }
  }

  if (row.prior_correct_count >= 2 && !row.is_correct) {
    evidence.push("Já acertou esta questão antes em outro caderno")
    return { taxonomy: "desatencao", evidence, source: "heuristic", confidence: "media" }
  }

  if (dur < 25_000 && row.confidence_level === "seguro" && !row.is_correct) {
    evidence.push("Resposta rápida com confiança alta no erro")
    return { taxonomy: "desatencao", evidence, source: "heuristic", confidence: "media" }
  }

  if (row.outcome_category === "falso_positivo") {
    evidence.push("Chutou e acertou — risco de interpretação/pegadinha")
    return {
      taxonomy: "pegadinha_interpretacao",
      evidence,
      source: "heuristic",
      confidence: "media",
    }
  }

  if (row.confidence_level === "chute") {
    return {
      taxonomy: row.is_correct ? "pegadinha_interpretacao" : "falta_memorizacao",
      evidence: ["Resposta marcada como chute"],
      source: "heuristic",
      confidence: "media",
    }
  }

  if (dur > 120_000 && !row.is_correct) {
    evidence.push("Tempo elevado na questão com erro")
    return {
      taxonomy: "falta_compreensao",
      evidence,
      source: "heuristic",
      confidence: "media",
    }
  }

  if (
    row.outcome_category === "lacuna_critica" ||
    row.outcome_category === "conteudo_desconhecido"
  ) {
    evidence.push("Lacuna de conteúdo registrada na metacognição")
    return {
      taxonomy: "falta_memorizacao",
      evidence,
      source: "heuristic",
      confidence: "media",
    }
  }

  if (row.outcome_category === "lacuna_consciente") {
    return {
      taxonomy: "falta_compreensao",
      evidence: ["Lacuna consciente — inseguro e errou"],
      source: "heuristic",
      confidence: "media",
    }
  }

  if (row.outcome_category === "conhecimento_fragil") {
    return {
      taxonomy: "falta_compreensao",
      evidence: ["Acertou com insegurança — domínio frágil"],
      source: "heuristic",
      confidence: "baixa",
    }
  }

  if (row.is_correct && row.confidence_level === "inseguro") {
    return {
      taxonomy: "falta_compreensao",
      evidence: ["Acerto inseguro — consolidar compreensão"],
      source: "heuristic",
      confidence: "baixa",
    }
  }

  return {
    taxonomy: "nao_aplicavel",
    evidence: ["Sinais insuficientes para classificar com precisão"],
    source: "heuristic",
    confidence: "baixa",
  }
}

export const TAXONOMY_SEVERITY: Record<ErrorTaxonomy, number> = {
  falta_compreensao: 4,
  calculo_procedimento: 4,
  falta_memorizacao: 3,
  pegadinha_interpretacao: 2,
  desatencao: 1,
  nao_aplicavel: 0,
}
