import {
  hasResidualPdfSpacingArtifacts,
  repairPdfSpuriousSpaces,
} from "./pdf-text-repair"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const ex1 =
  "P ara que seja considerada administração indireta, é necessária a constituição de patrimônio próprio."
const fixed1 =
  "Para que seja considerada administração indireta, é necessária a constituição de patrimônio próprio."
assert(repairPdfSpuriousSpaces(ex1) === fixed1, `ex1: ${repairPdfSpuriousSpaces(ex1)}`)

assert(repairPdfSpuriousSpaces("f uncional") === "funcional", "f uncional")

assert(
  repairPdfSpuriousSpaces("a administração") === "a administração",
  "preserve a administração"
)
assert(repairPdfSpuriousSpaces("e assim") === "e assim", "preserve e assim")
assert(
  repairPdfSpuriousSpaces("o poder") === "o poder",
  "preserve o poder"
)
assert(
  repairPdfSpuriousSpaces("O modelo gerencial") === "O modelo gerencial",
  "preserve O modelo"
)
assert(
  repairPdfSpuriousSpaces("A respeito da lei") === "A respeito da lei",
  "preserve A respeito"
)
assert(
  repairPdfSpuriousSpaces("jurídica. Vas normas") === "jurídica. V as normas",
  "fix Vas roman artifact"
)

assert(
  !hasResidualPdfSpacingArtifacts(repairPdfSpuriousSpaces(ex1)),
  "no residual after repair"
)

console.log("pdf-text-repair tests OK")
