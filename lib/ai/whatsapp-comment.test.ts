import assert from "node:assert/strict"
import {
  formatWhatsappComment,
  isPublishableAiFeedback,
  splitPublishParts,
  WHATSAPP_AI_SEPARATOR,
} from "./whatsapp-comment"

assert.equal(formatWhatsappComment(""), "")
assert.equal(formatWhatsappComment("  dúvida  "), "dúvida")
assert.equal(
  isPublishableAiFeedback(
    "Revise a explicação no relatório do caderno ou regenere as explicações com IA."
  ),
  false
)
assert.equal(isPublishableAiFeedback("ok"), false)

const ai =
  "A competência é a medida da capacidade da União para legislar sobre direito penal, distinta da capacidade de fato."
assert.equal(isPublishableAiFeedback(ai), true)
assert.equal(
  formatWhatsappComment("o que é competência?", ai),
  `o que é competência?\n\n${WHATSAPP_AI_SEPARATOR}\n${ai}`
)
assert.equal(formatWhatsappComment("", ai), ai)
assert.deepEqual(splitPublishParts("o que é competência?", ai), {
  comment: "o que é competência?",
  aiComment: ai,
})

console.log("whatsapp-comment.test.ts: ok")
