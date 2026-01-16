import { useState } from "react"
type ErrorFormProps = {
  selectedTopic: string
  onSubmit: (data: {
    error_text: string
    correction_text: string
    description?: string
    reference_link?: string
    error_type: string
  }) => void
}

export default function ErrorForm({
  selectedTopic,
  onSubmit
}: ErrorFormProps) {
  const [errorText, setErrorText] = useState("")
  const [correctionText, setCorrectionText] = useState("")
  const [description, setDescription] = useState("")
  const [referenceLink, setReferenceLink] = useState("")
  const [errorType, setErrorType] = useState("normal")

  function handleSubmit() {
    if (!errorText || !correctionText) return

    onSubmit({
      error_text: errorText,
      correction_text: correctionText,
      description,
      reference_link: referenceLink,
      error_type: errorType
    })

    setErrorText("")
    setCorrectionText("")
    setDescription("")
    setReferenceLink("")
    setErrorType("normal")
  }

  if (!selectedTopic) return null

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-slate-800">
        ❌ Novo erro
      </h3>

      {/* Erro / Correção */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-red-600">
            Erro
          </label>
          <textarea
            className="w-full rounded-lg border border-slate-300 p-3 text-slate-800 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            rows={3}
            placeholder="O que você pensou / marcou errado"
            value={errorText}
            onChange={e => setErrorText(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-green-600">
            Correção
          </label>
          <textarea
            className="w-full rounded-lg border border-slate-300 p-3 text-slate-800 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            rows={3}
            placeholder="Qual é a regra correta"
            value={correctionText}
            onChange={e => setCorrectionText(e.target.value)}
          />
        </div>
      </div>

      {/* Descrição */}
      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-slate-600">
          Descrição (opcional)
        </label>
        <textarea
          className="w-full rounded-lg border border-slate-300 p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
          rows={2}
          placeholder="Contexto rápido para lembrar depois"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      {/* Link + Tipo */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-600">
            Link da questão
          </label>
          <input
            className="w-full rounded-lg border border-slate-300 p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
            placeholder="https://"
            value={referenceLink}
            onChange={e => setReferenceLink(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">
            Tipo
          </label>
          <select
            className="w-full rounded-lg border border-slate-300 p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
            value={errorType}
            onChange={e => setErrorType(e.target.value)}
          >
            <option value="normal">Normal</option>
            <option value="critico">Crítico</option>
            <option value="reincidente">Reincidente</option>
            <option value="aprendido">Aprendido</option>
          </select>
        </div>
      </div>

      {/* Botão */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSubmit}
          className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Salvar erro
        </button>
      </div>
    </div>
  )
}
