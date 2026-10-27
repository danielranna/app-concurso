import Link from "next/link"

export default function ComentariosNasQuestoesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <p>
        <Link href="/questoes" className="text-sm text-slate-500 hover:text-slate-800">
          ← Questões
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Comentários direto na questão
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Cada questão tem uma thread na lateral. O texto é seu: dúvida, raciocínio
          ou recado para o grupo. Ele não some ao mudar de questão.
        </p>
      </div>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">O que vai para o Papa Vagas</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Ao resolver, o comentário da caixa viaja com a resposta para o grupo
            (WhatsApp / Papa Vagas).
          </li>
          <li>
            Depois de resolvida, Enter envia um novo comentário na mesma thread.
          </li>
          <li>
            Erradas, chute e o botão Discutir aparecem na correção do grupo.
            Inseguro fica só no seu registro.
          </li>
        </ul>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">Atalhos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Enter</strong> — resolve a questão (leva o rascunho). Se já
            estiver resolvida, envia o comentário.
          </li>
          <li>
            <strong>Shift+Enter</strong> — quebra de linha no comentário.
          </li>
        </ul>
      </section>

      <section className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/60 p-4 text-sm text-slate-700">
        <h2 className="font-semibold text-violet-900">Comentário da IA</h2>
        <p>
          A IA <strong>não</strong> comenta sozinha. Marque{" "}
          <em>Pedir comentário da IA</em> só quando quiser que ela esclareça o
          que você escreveu. Sem o botão, o grupo vê só o seu texto.
        </p>
      </section>

      <p className="text-sm text-slate-500">
        Vídeos da turma ficam em{" "}
        <Link href="/tutoriais" className="font-medium text-violet-700 hover:underline">
          Tutoriais
        </Link>
        .
      </p>
    </div>
  )
}
