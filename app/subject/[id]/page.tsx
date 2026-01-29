    "use client"

    import { useEffect, useState } from "react"
    import { useParams, useRouter } from "next/navigation"
    import { supabase } from "@/lib/supabase"
    import ErrorCard from "@/components/ErrorCard"
    import AddErrorModal from "@/components/AddErrorModal"
    import ErrorsByTopicChart from "@/components/ErrorsByTopicChart"
    import { ArrowLeft, Filter, Eye, Plus } from "lucide-react"
    import { useDataCache } from "@/contexts/DataCacheContext"

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
    const cache = useDataCache()
    const subjectId = params.id as string

    const [mounted, setMounted] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)
    const [subjectName, setSubjectName] = useState("")
    const [errors, setErrors] = useState<ErrorItem[]>([])
    const [loading, setLoading] = useState(true)

    // 🔧 filtros
    const [topics, setTopics] = useState<Array<{ id: string; name: string }>>([])
    const [errorTypes, setErrorTypes] = useState<Array<{ id: string; name: string }>>([])
    const [errorStatuses, setErrorStatuses] = useState<Array<{ id: string; name: string }>>([])
    const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
    const [selectedErrorTypes, setSelectedErrorTypes] = useState<string[]>([])
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
    const [openFilterMenu, setOpenFilterMenu] = useState<"topics" | "errorTypes" | "statuses" | null>(null)
    const [allCardsExpanded, setAllCardsExpanded] = useState(false)

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
        error_status?: string
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
        FILTROS
    ===================== */
    async function loadTopics(uid: string) {
        const res = await fetch(
        `/api/topics?user_id=${uid}&subject_id=${subjectId}`
        )
        const data = await res.json()
        setTopics(data ?? [])
    }

    async function loadErrorTypes(uid: string) {
        const data = await cache.getErrorTypes(uid)
        setErrorTypes(data ?? [])
    }

    async function loadErrorStatuses(uid: string) {
        const data = await cache.getErrorStatuses(uid)
        setErrorStatuses(data)
    }

    /* =====================
        ERROS
    ===================== */
    async function loadErrors(uid: string) {
        setLoading(true)

        const data = await cache.getErrors(uid, {
            subject_id: subjectId,
            topic_ids: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
            error_types: selectedErrorTypes.length > 0 ? selectedErrorTypes : undefined,
            error_statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
        })

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
        error_type: error.error_type,
        error_status: error.error_status
        })

        setOpenModal(true)
    }

    /* =====================
        EXCLUSÃO
    ===================== */
    async function handleDelete(errorId: string) {
        if (!confirm("Deseja realmente excluir este erro?")) return

        const res = await fetch(`/api/errors/${errorId}`, {
            method: "DELETE"
        })

        if (res.ok) {
            cache.invalidateErrors(userId!, subjectId)
            loadErrors(userId!)
        }
    }

    /* =====================
        EFFECTS
    ===================== */
    useEffect(() => {
        setMounted(true)
        loadUser()
        loadSubjectName()
    }, [])

    useEffect(() => {
        if (userId && subjectId) {
        loadTopics(userId)
        loadErrorTypes(userId)
        loadErrorStatuses(userId)
        }
    }, [userId, subjectId])

    useEffect(() => {
        if (userId && subjectId) {
        loadErrors(userId)
        }
    }, [userId, subjectId, selectedTopicIds, selectedErrorTypes, selectedStatuses])

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
        {/* HEADER */}
        <header className="mb-6 flex flex-wrap items-center gap-3 sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:gap-4">
                <button
                onClick={() => router.back()}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
                >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Voltar</span>
                </button>
                <h1 className="min-w-0 truncate text-xl font-semibold text-slate-800 sm:text-2xl">
                {subjectName}
                </h1>
            </div>
            <button
                onClick={() => {
                    setEditingError({
                        id: "",
                        topic_id: "",
                        subject_id: subjectId,
                        error_text: "",
                        correction_text: "",
                        description: "",
                        reference_link: "",
                        error_type: "",
                        error_status: ""
                    })
                    setOpenModal(true)
                }}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Adicionar Erro</span>
            </button>
        </header>

        {/* GRÁFICO */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <ErrorsByTopicChart errors={errors} subjectId={subjectId} />
        </section>

        {/* Botão Expandir Todos */}
        {errors.length > 0 && (
            <div className="mb-4 flex flex-wrap justify-end">
            <button
                onClick={() => setAllCardsExpanded(!allCardsExpanded)}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
                title={allCardsExpanded ? "Ocultar todos" : "Mostrar todos"}
            >
                <Eye className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{allCardsExpanded ? "Ocultar todos" : "Mostrar todos"}</span>
            </button>
            </div>
        )}

        {/* FILTROS */}
        <section className="relative mb-6 flex flex-wrap gap-2 sm:gap-3">
            {/* Filtro Tema */}
            <div className="relative">
                <button
                onClick={() =>
                    setOpenFilterMenu(
                    openFilterMenu === "topics" ? null : "topics"
                    )
                }
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition sm:px-4 ${
                    selectedTopicIds.length > 0
                    ? "bg-slate-100 border-slate-900 text-slate-900"
                    : "border-slate-300 text-slate-900 hover:bg-slate-50"
                }`}
                >
                <Filter className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Tema</span>
                {selectedTopicIds.length > 0 && (
                    <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">
                    {selectedTopicIds.length}
                    </span>
                )}
                </button>

                {openFilterMenu === "topics" && (
                <>
                    <div
                    className="fixed inset-0 z-10"
                    onClick={() => setOpenFilterMenu(null)}
                    />
                    <div className="absolute top-full left-0 z-20 mt-2 w-full min-w-[16rem] max-w-[calc(100vw-2rem)] max-h-64 overflow-auto rounded-lg border bg-white p-3 shadow-lg sm:w-64">
                    {topics.length === 0 ? (
                        <p className="text-sm text-slate-500">
                        Nenhum tema cadastrado
                        </p>
                    ) : (
                        topics.map(topic => (
                        <label
                            key={topic.id}
                            className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer"
                        >
                            <input
                            type="checkbox"
                            checked={selectedTopicIds.includes(topic.id)}
                            onChange={e => {
                                if (e.target.checked) {
                                setSelectedTopicIds([...selectedTopicIds, topic.id])
                                } else {
                                setSelectedTopicIds(
                                    selectedTopicIds.filter(id => id !== topic.id)
                                )
                                }
                            }}
                            className="rounded"
                            />
                            <span className="text-sm">{topic.name}</span>
                        </label>
                        ))
                    )}
                    {selectedTopicIds.length > 0 && (
                        <button
                        onClick={() => setSelectedTopicIds([])}
                        className="mt-2 w-full text-xs text-red-600 hover:underline"
                        >
                        Limpar seleção
                        </button>
                    )}
                    </div>
                </>
                )}
            </div>

            {/* Filtro Tipo de Erro */}
            <div className="relative">
                <button
                onClick={() =>
                    setOpenFilterMenu(
                    openFilterMenu === "errorTypes" ? null : "errorTypes"
                    )
                }
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition sm:px-4 ${
                    selectedErrorTypes.length > 0
                    ? "bg-slate-100 border-slate-900 text-slate-900"
                    : "border-slate-300 text-slate-900 hover:bg-slate-50"
                }`}
                >
                <Filter className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Tipo de erro</span>
                {selectedErrorTypes.length > 0 && (
                    <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">
                    {selectedErrorTypes.length}
                    </span>
                )}
                </button>

                {mounted && openFilterMenu === "errorTypes" && (
                <>
                    <div
                    className="fixed inset-0 z-10"
                    onClick={() => setOpenFilterMenu(null)}
                    />
                    <div className="absolute top-full left-0 z-20 mt-2 w-full min-w-[16rem] max-w-[calc(100vw-2rem)] max-h-64 overflow-auto rounded-lg border bg-white p-3 shadow-lg sm:w-64">
                    {errorTypes.length === 0 ? (
                        <p className="text-sm text-slate-500">
                        Nenhum tipo cadastrado
                        </p>
                    ) : (
                        errorTypes.map(type => (
                        <label
                            key={`error-type-${type.id}`}
                            htmlFor={`error-type-checkbox-${type.id}`}
                            className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer"
                        >
                            <input
                            id={`error-type-checkbox-${type.id}`}
                            type="checkbox"
                            checked={selectedErrorTypes.includes(type.name)}
                            onChange={e => {
                                if (e.target.checked) {
                                setSelectedErrorTypes([...selectedErrorTypes, type.name])
                                } else {
                                setSelectedErrorTypes(
                                    selectedErrorTypes.filter(t => t !== type.name)
                                )
                                }
                            }}
                            className="rounded"
                            />
                            <span className="text-sm">{type.name}</span>
                        </label>
                        ))
                    )}
                    {selectedErrorTypes.length > 0 && (
                        <button
                        type="button"
                        onClick={() => setSelectedErrorTypes([])}
                        className="mt-2 w-full text-xs text-red-600 hover:underline"
                        >
                        Limpar seleção
                        </button>
                    )}
                    </div>
                </>
                )}
            </div>

            {/* Filtro Status */}
            <div className="relative">
                <button
                onClick={() =>
                    setOpenFilterMenu(
                    openFilterMenu === "statuses" ? null : "statuses"
                    )
                }
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition sm:px-4 ${
                    selectedStatuses.length > 0
                    ? "bg-slate-100 border-slate-900 text-slate-900"
                    : "border-slate-300 text-slate-900 hover:bg-slate-50"
                }`}
                >
                <Filter className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Status</span>
                {selectedStatuses.length > 0 && (
                    <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">
                    {selectedStatuses.length}
                    </span>
                )}
                </button>

                {mounted && openFilterMenu === "statuses" && (
                <>
                    <div
                    className="fixed inset-0 z-10"
                    onClick={() => setOpenFilterMenu(null)}
                    />
                    <div className="absolute top-full left-0 z-20 mt-2 w-full min-w-[16rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-3 shadow-lg sm:w-64">
                    {errorStatuses.length === 0 ? (
                        <p className="text-sm text-slate-500">
                        Nenhum status cadastrado
                        </p>
                    ) : (
                        errorStatuses.map(status => (
                        <label
                            key={status.id}
                            htmlFor={`status-checkbox-${status.id}`}
                            className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer"
                        >
                            <input
                            id={`status-checkbox-${status.id}`}
                            type="checkbox"
                            checked={selectedStatuses.includes(status.name)}
                            onChange={e => {
                                if (e.target.checked) {
                                setSelectedStatuses([...selectedStatuses, status.name])
                                } else {
                                setSelectedStatuses(
                                    selectedStatuses.filter(s => s !== status.name)
                                )
                                }
                            }}
                            className="rounded"
                            />
                            <span className="text-sm capitalize">{status.name}</span>
                        </label>
                        ))
                    )}
                    {selectedStatuses.length > 0 && (
                        <button
                        type="button"
                        onClick={() => setSelectedStatuses([])}
                        className="mt-2 w-full text-xs text-red-600 hover:underline"
                        >
                        Limpar seleção
                        </button>
                    )}
                    </div>
                </>
                )}
            </div>
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
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
            {errors.map(error => (
                <ErrorCard
                    key={error.id}
                    error={error}
                    onEdit={() => handleEdit(error)}
                    onDeleted={() => handleDelete(error.id)}
                    allCardsExpanded={allCardsExpanded}
                    availableStatuses={errorStatuses}
                    onStatusChange={async (errorId, newStatus) => {
                        // Atualiza o status do erro
                        const res = await fetch(`/api/errors/${errorId}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                user_id: userId,
                                topic_id: error.topics.id,
                                error_text: error.error_text,
                                correction_text: error.correction_text,
                                description: error.description,
                                reference_link: error.reference_link,
                                error_type: error.error_type,
                                error_status: newStatus
                            })
                        })
                        
                        if (res.ok) {
                            // Invalida o cache e recarrega erros e status
                            cache.invalidateErrors(userId!, subjectId)
                            await Promise.all([
                                loadErrors(userId!),
                                loadErrorStatuses(userId!)
                            ])
                        }
                    }}
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
            onSuccess={() => {
                cache.invalidateErrors(userId!, subjectId)
                loadErrors(userId!)
                loadErrorTypes(userId!)
                loadErrorStatuses(userId!)
            }}
        />
        </main>
    )
    }
