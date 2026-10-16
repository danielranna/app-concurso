function normName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function matchSubjectId(
  materia: string,
  subjects: { id: string; name: string }[],
  mappings: { tec_subject: string; tec_topic: string | null; subject_id: string }[]
) {
  const key = normName(materia)
  if (!key) return null
  const inside = materia.match(/\(([^)]+)\)/)
  const keys = [key, inside ? normName(inside[1]) : ""].filter((item) => item.length >= 4)

  const mapped = mappings.find((row) => {
    const subjectKey = normName(row.tec_subject)
    return keys.some((item) => item === subjectKey) && !String(row.tec_topic || "").trim()
  })
  if (mapped?.subject_id) return mapped.subject_id

  const anyMap = mappings.find((row) => keys.some((item) => item === normName(row.tec_subject)))
  if (anyMap?.subject_id) return anyMap.subject_id

  const exact = subjects.find((row) => keys.some((item) => item === normName(row.name)))
  if (exact) return exact.id

  const partial = subjects
    .filter((row) => {
      const name = normName(row.name)
      return name.length >= 4 && keys.some((item) => item.includes(name) || name.includes(item))
    })
    .sort((a, b) => normName(b.name).length - normName(a.name).length)[0]
  return partial?.id ?? null
}
