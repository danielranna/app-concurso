export async function moveNotebookLocation(
  notebookId: string,
  subjectId: string,
  folderId: string | null
) {
  const res = await fetch(`/api/notebooks/${notebookId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject_id: subjectId,
      folder_id: folderId,
    }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error ?? "Erro ao mover caderno")
  }
}

export async function bulkMoveNotebooks(
  notebookIds: string[],
  subjectId: string,
  folderId: string | null
) {
  for (const id of notebookIds) {
    await moveNotebookLocation(id, subjectId, folderId)
  }
}

export async function bulkDeleteNotebooks(notebookIds: string[]) {
  const results = await Promise.all(
    notebookIds.map(async (id) => {
      const res = await fetch(`/api/notebooks/${id}`, { method: "DELETE" })
      return { id, ok: res.ok }
    })
  )
  const failed = results.filter((r) => !r.ok).length
  if (failed > 0) {
    throw new Error(`${failed} caderno(s) não puderam ser excluídos`)
  }
}
