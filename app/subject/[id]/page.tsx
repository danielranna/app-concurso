    "use client"

    import { useEffect, useState } from "react"
    import { useParams, useRouter } from "next/navigation"
    import { supabase } from "@/lib/supabase"
    import ErrorCard from "@/components/ErrorCard"
    import AddErrorModal from "@/components/AddErrorModal"

    type ErrorItem = {
    id: string
    error_text: string
    correction_text: string
    description?: string
    reference_link?: string
    error_status: string
    error_type?: string
    created_at: string
    topics: {
        id: string
        name: string
        subject_id: string
        subjects: {
        id: string
        name: string
        }
    }
    }

    export default function SubjectPage() {
    const params = useParams()
    const router = useRouter()
    const subjectId = params.id as string

    const [userId, setUserId] = useState<string | null>(null)
    const [subjectName, setSubjectName] = useState("")
    const [errors, setErrors] = useState<ErrorItem[]>([])
    const [loading, setLoading] = useState(true)

    // 🔧 modal edição
    const [openModal, setOpenModal] = useState(false)
    const [editingError, setEditingError] =
        useState<null | {
        id: string
        topic_id: string
        subject_id: string
        error_text: string
        correction_text: string
        description?: string
        reference_link?: string
        error_type?: any
        }>(null)

    /* =====================
        USUÁRIO
    ===================== */
    async function loadUser() {
        const {
        data: { user }
        } = await supabase.auth.getUser()

        if (user) setUserId(user.id)
    }

    /* =====================
        MATÉRIA
    ===================== */
    async function loadSubjectName() {
        const { data } = await supabase
        .from("subjects")
        .select("name")
        .eq("id", subjectId)
        .single()

        setSubjectName(data?.name ?? "Matéria")
    }

    /* =====================
        ERROS
    ===================== */
    async function loadErrors(uid: string) {
        setLoading(true)

        const res = await fetch(
        `/api/errors?user_id=${uid}&subject_id=${subjectId}`
        )

        const data = await res.json()
        setErrors(data ?? [])
        setLoading(false)
    }

    /* =====================
        EDIÇÃO
    ===================== */
    function handleEdit(error: ErrorItem) {
        setEditingError({
        id: error.id,
        topic_id: error.topics.id,
        subject_id: error.topics.subject_id,
        error_text: error.error_text,
        correction_text: error.correction_text,
        description: error.description,
        reference_link: error.reference_link,
        error_type: error.error_type
        })

        setOpenModal(true)
    }

    /* =====================
        EFFECTS
    ===================== */
    useEffect(() => {
        loadUser()
        loadSubjectName()
    }, [])

    useEffect(() => {
        if (userId && subjectId) {
        loadErrors(userId)
        }
    }, [userId, subjectId])

    return (
        <main className="min-h-screen bg-slate-50 px-6 py-6">
        {/* HEADER */}
        <header className="mb-6 flex items-center gap-4">
            <button
            onClick={() => router.back()}
            className="rounded border px-3 py-1 text-sm"
            >
            ← Voltar
            </button>

            <h1 className="text-2xl font-semibold text-slate-800">
            {subjectName}
            </h1>
        </header>

        {/* PLACEHOLDER GRÁFICO */}
        <section className="mb-6 h-32 rounded-xl border border-dashed bg-white" />

        {/* FILTROS */}
        <section className="mb-6 flex gap-3">
            <button className="rounded border px-4 py-2 text-sm">
            Tema
            </button>
            <button className="rounded border px-4 py-2 text-sm">
            Tipo de erro
            </button>
            <button className="rounded border px-4 py-2 text-sm">
            Status
            </button>
        </section>

        {/* LISTA */}
        {loading ? (
            <p>Carregando erros...</p>
        ) : errors.length === 0 ? (
            <p className="text-slate-500">
            Nenhum erro registrado nessa matéria.
            </p>
        ) : (
            <section
            className="grid gap-4"
            style={{
                gridTemplateColumns:
                "repeat(auto-fill, minmax(320px, 1fr))"
            }}
            >
            {errors.map(error => (
                <ErrorCard
                key={error.id}
                error={error}
                onEdit={() => handleEdit(error)}
                onDeleted={() => loadErrors(userId!)}
                />
            ))}
            </section>
        )}

        {/* MODAL ADD / EDIT */}
        <AddErrorModal
            isOpen={openModal}
            onClose={() => {
            setOpenModal(false)
            setEditingError(null)
            }}
            initialData={editingError}
            onSuccess={() => loadErrors(userId!)}
        />
        </main>
    )
    }
